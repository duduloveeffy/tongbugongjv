#!/usr/bin/env node

/**
 * Backfill new order fields for existing orders (CommonJS version)
 * This script updates existing orders with:
 * - Payment information (payment_status, is_paid, payment_date, customer_ip_address)
 * - Order attribution data (source, medium, campaign, UTM parameters)
 * - Customer history (is_returning_customer, lifetime_value, order counts)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration');
  console.log('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Extract attribution data from meta_data
function extractAttributionData(metaData) {
  if (!metaData || !Array.isArray(metaData)) {
    return {};
  }

  const attribution = {};

  for (const meta of metaData) {
    const key = meta.key || meta.name;
    const value = meta.value;

    if (!key || value === undefined) continue;

    // Map WooCommerce meta keys to our database fields
    switch (key) {
      // Attribution fields
      case '_wc_order_attribution_source_type':
        attribution.attribution_source_type = value;
        break;
      case '_wc_order_attribution_source':
        attribution.attribution_source = value;
        break;
      case '_wc_order_attribution_medium':
        attribution.attribution_medium = value;
        break;
      case '_wc_order_attribution_campaign':
        attribution.attribution_campaign = value;
        break;
      case '_wc_order_attribution_device_type':
        attribution.attribution_device_type = value;
        break;
      case '_wc_order_attribution_session_page_views':
        attribution.attribution_session_page_views = parseInt(value) || 0;
        break;
      case '_wc_order_attribution_utm_source':
        attribution.attribution_utm_source = value;
        break;
      case '_wc_order_attribution_utm_medium':
        attribution.attribution_utm_medium = value;
        break;
      case '_wc_order_attribution_utm_campaign':
        attribution.attribution_utm_campaign = value;
        break;
      case '_wc_order_attribution_utm_content':
        attribution.attribution_utm_content = value;
        break;
      case '_wc_order_attribution_utm_term':
        attribution.attribution_utm_term = value;
        break;
      case '_wc_order_attribution_referrer':
        attribution.attribution_referrer = value;
        break;

      // Customer IP and User Agent
      case '_customer_ip_address':
        attribution.customer_ip_address = value;
        break;
      case '_customer_user_agent':
        attribution.customer_user_agent = value;
        break;

      // Payment tracking
      case '_date_paid':
        if (value) {
          attribution.payment_date = new Date(value * 1000).toISOString();
        }
        break;
      case '_paid_date':
        if (value && !attribution.payment_date) {
          attribution.payment_date = new Date(value * 1000).toISOString();
        }
        break;
    }
  }

  // Build attribution_origin from source type and source
  if (attribution.attribution_source_type && attribution.attribution_source) {
    const sourceType = attribution.attribution_source_type.charAt(0).toUpperCase() +
                      attribution.attribution_source_type.slice(1);
    attribution.attribution_origin = `${sourceType}: ${attribution.attribution_source}`;
  }

  return attribution;
}

// Calculate customer history stats
async function calculateCustomerStats(siteId, customerEmail) {
  if (!customerEmail) return {};

  try {
    // Get all orders for this customer
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, total, date_created, payment_method')
      .eq('site_id', siteId)
      .eq('customer_email', customerEmail)
      .in('status', ['completed', 'processing'])
      .order('date_created', { ascending: true });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      return {};
    }

    // Calculate statistics
    const totalRevenue = orders.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0);
    const avgOrderValue = totalRevenue / orders.length;
    const firstOrderDate = orders[0]?.date_created;
    const lastOrderDate = orders[orders.length - 1]?.date_created;

    return {
      is_returning_customer: orders.length > 1,
      customer_order_count: orders.length,
      customer_total_revenue: totalRevenue.toFixed(2),
      customer_average_order_value: avgOrderValue.toFixed(2),
      customer_lifetime_value: totalRevenue.toFixed(2),
      customer_first_order_date: firstOrderDate,
      customer_last_order_date: lastOrderDate
    };

  } catch (error) {
    console.error(`Error calculating customer history for ${customerEmail}:`, error.message);
    return {};
  }
}

// Process a single order
async function processOrder(order) {
  try {
    // Extract attribution data from meta_data
    const attributionData = extractAttributionData(order.meta_data);

    // Calculate customer history (skip for performance, can be done separately)
    const customerHistory = await calculateCustomerStats(
      order.site_id,
      order.customer_email
    );

    // Determine payment status
    let paymentStatus = 'pending';
    let isPaid = false;

    if (order.status === 'completed' || order.status === 'processing') {
      paymentStatus = 'completed';
      isPaid = true;
    } else if (order.status === 'refunded') {
      paymentStatus = 'refunded';
      isPaid = true;
    } else if (order.status === 'failed') {
      paymentStatus = 'failed';
    } else if (order.status === 'cancelled') {
      paymentStatus = 'cancelled';
    }

    // Check if paid based on payment date
    if (order.date_paid || attributionData.payment_date) {
      isPaid = true;
      if (!['completed', 'refunded'].includes(paymentStatus)) {
        paymentStatus = 'completed';
      }
    }

    // Merge all update data
    const updateData = {
      ...attributionData,
      ...customerHistory,
      payment_status: paymentStatus,
      is_paid: isPaid,
      payment_date_gmt: order.date_paid,
      paid_via_credit_card: ['stripe', 'paypal', 'square'].includes(order.payment_method)
    };

    return updateData;

  } catch (error) {
    console.error(`Error processing order ${order.id}:`, error.message);
    return null;
  }
}

// Main backfill function
async function backfillOrders() {
  console.log('🚀 Starting order field backfill...');
  console.log('   This will update existing orders with new fields from meta_data\n');

  try {
    // Get total count
    const { count, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    console.log(`📊 Total orders in database: ${count}`);

    // Check how many orders need updates (sample check)
    const { data: sampleOrders, error: sampleError } = await supabase
      .from('orders')
      .select('id, payment_status, attribution_source, is_returning_customer')
      .limit(100);

    if (!sampleError && sampleOrders) {
      const needsUpdate = sampleOrders.filter(o =>
        !o.payment_status && !o.attribution_source && o.is_returning_customer === null
      ).length;
      console.log(`   Sample shows ~${Math.round(needsUpdate)}% may need updates\n`);
    }

    let offset = 0;
    const batchSize = 25; // Smaller batches for better progress tracking
    let totalProcessed = 0;
    let totalUpdated = 0;

    while (offset < count) {
      // Fetch batch of orders
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, site_id, customer_email, status, payment_method, date_paid, meta_data')
        .range(offset, offset + batchSize - 1)
        .order('synced_at', { ascending: true });

      if (error) throw error;

      if (!orders || orders.length === 0) break;

      const batchNum = Math.floor(offset / batchSize) + 1;
      console.log(`📦 Processing batch ${batchNum} (orders ${offset + 1}-${offset + orders.length})...`);

      // Process each order in the batch
      for (const order of orders) {
        const updateData = await processOrder(order);

        if (updateData && Object.keys(updateData).length > 0) {
          // Update the order
          const { error: updateError } = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', order.id);

          if (updateError) {
            console.error(`   ❌ Failed to update order ${order.id}:`, updateError.message);
          } else {
            totalUpdated++;
          }
        }

        totalProcessed++;
      }

      // Progress indicator
      const progress = Math.round((offset + orders.length) / count * 100);
      console.log(`   ✅ Batch complete. Progress: ${progress}% (${offset + orders.length}/${count})`);
      console.log(`   📊 Orders updated so far: ${totalUpdated}\n`);

      offset += batchSize;

      // Small delay to avoid overloading
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('✨ Backfill completed!');
    console.log(`📊 Final Summary:`);
    console.log(`   - Total orders processed: ${totalProcessed}`);
    console.log(`   - Orders updated with new fields: ${totalUpdated}`);
    console.log(`   - Orders skipped (no new data): ${totalProcessed - totalUpdated}`);

    // Optional: Update customer history summary table
    console.log('\n🔄 Updating customer history summaries...');

    // Get unique customers
    const { data: customers, error: customerError } = await supabase
      .from('orders')
      .select('site_id, customer_email')
      .not('customer_email', 'is', null)
      .in('status', ['completed', 'processing']);

    if (!customerError && customers) {
      const uniqueCustomers = new Map();
      customers.forEach(c => {
        const key = `${c.site_id}-${c.customer_email}`;
        uniqueCustomers.set(key, c);
      });

      console.log(`   Found ${uniqueCustomers.size} unique customers`);

      let customerCount = 0;
      for (const [key, customer] of uniqueCustomers) {
        try {
          // Use RPC function if available, or direct update
          const { error } = await supabase.rpc('update_customer_history_stats', {
            p_site_id: customer.site_id,
            p_customer_email: customer.customer_email
          });

          if (!error) {
            customerCount++;
            if (customerCount % 100 === 0) {
              console.log(`   Processed ${customerCount} customers...`);
            }
          }
        } catch (error) {
          // RPC might not exist, skip silently
        }
      }

      if (customerCount > 0) {
        console.log(`✅ Updated history for ${customerCount} customers`);
      }
    }

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

// Show what fields will be updated
async function previewChanges() {
  console.log('\n📋 Fields that will be updated:');
  console.log('   Payment Information:');
  console.log('     - payment_status (pending/completed/failed/refunded/cancelled)');
  console.log('     - is_paid (true/false)');
  console.log('     - payment_date (from _date_paid meta)');
  console.log('     - customer_ip_address (from _customer_ip_address meta)');
  console.log('     - customer_user_agent (from _customer_user_agent meta)');
  console.log('\n   Attribution Data:');
  console.log('     - attribution_source_type, attribution_source');
  console.log('     - attribution_medium, attribution_campaign');
  console.log('     - attribution_device_type');
  console.log('     - attribution_utm_* fields (source, medium, campaign, content, term)');
  console.log('     - attribution_referrer');
  console.log('     - attribution_origin (computed from source_type + source)');
  console.log('\n   Customer History:');
  console.log('     - is_returning_customer');
  console.log('     - customer_order_count');
  console.log('     - customer_total_revenue');
  console.log('     - customer_average_order_value');
  console.log('     - customer_lifetime_value');
  console.log('     - customer_first_order_date');
  console.log('     - customer_last_order_date');
  console.log('\n');
}

// Run the script
async function main() {
  console.log('====================================');
  console.log('  ORDER FIELD BACKFILL UTILITY');
  console.log('====================================');

  await previewChanges();

  // Add confirmation prompt if running interactively
  if (process.stdin.isTTY) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise((resolve) => {
      rl.question('⚠️  This will update all orders. Continue? (y/n): ', (answer) => {
        rl.close();
        if (answer.toLowerCase() !== 'y') {
          console.log('❌ Cancelled by user');
          process.exit(0);
        }
        resolve();
      });
    });
  }

  await backfillOrders();
  console.log('\n🎉 All done!');
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});