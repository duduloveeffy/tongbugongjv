#!/usr/bin/env node

/**
 * Backfill new order fields for existing orders
 * This script updates existing orders with:
 * - Payment information (payment_status, is_paid, payment_date, customer_ip_address)
 * - Order attribution data (source, medium, campaign, UTM parameters)
 * - Customer history (is_returning_customer, lifetime_value, order counts)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration');
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
async function updateCustomerHistory(siteId, customerEmail) {
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

    // Find most common payment method
    const paymentMethods = {};
    orders.forEach(order => {
      if (order.payment_method) {
        paymentMethods[order.payment_method] = (paymentMethods[order.payment_method] || 0) + 1;
      }
    });

    const preferredPaymentMethod = Object.entries(paymentMethods)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

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

// Process orders in batches
async function processOrderBatch(orders) {
  const updates = [];

  for (const order of orders) {
    try {
      // Extract attribution data from meta_data
      const attributionData = extractAttributionData(order.meta_data);

      // Calculate customer history
      const customerHistory = await updateCustomerHistory(
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

      // Only update if there are new fields to add
      if (Object.keys(updateData).length > 0) {
        updates.push({
          id: order.id,
          data: updateData
        });
      }

    } catch (error) {
      console.error(`Error processing order ${order.id}:`, error.message);
    }
  }

  // Batch update orders
  if (updates.length > 0) {
    for (const update of updates) {
      try {
        const { error } = await supabase
          .from('orders')
          .update(update.data)
          .eq('id', update.id);

        if (error) throw error;
      } catch (error) {
        console.error(`Failed to update order ${update.id}:`, error.message);
      }
    }

    console.log(`✅ Updated ${updates.length} orders`);
  }

  return updates.length;
}

// Main backfill function
async function backfillOrders() {
  console.log('🚀 Starting order field backfill...\n');

  try {
    // Get total count
    const { count, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    console.log(`📊 Total orders to process: ${count}\n`);

    let offset = 0;
    const batchSize = 50;
    let totalProcessed = 0;

    while (offset < count) {
      // Fetch batch of orders
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, site_id, customer_email, status, payment_method, date_paid, meta_data')
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!orders || orders.length === 0) break;

      console.log(`📦 Processing batch ${Math.floor(offset / batchSize) + 1} (orders ${offset + 1}-${offset + orders.length})...`);

      const processed = await processOrderBatch(orders);
      totalProcessed += processed;

      // Progress indicator
      const progress = Math.round((offset + orders.length) / count * 100);
      console.log(`   Progress: ${progress}% (${offset + orders.length}/${count})\n`);

      offset += batchSize;

      // Small delay to avoid overloading
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('✨ Backfill completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Total orders checked: ${count}`);
    console.log(`   - Orders updated: ${totalProcessed}`);

    // Update customer history table
    console.log('\n🔄 Updating customer history table...');

    const { data: customers, error: customerError } = await supabase
      .from('orders')
      .select('site_id, customer_email')
      .not('customer_email', 'is', null)
      .order('customer_email');

    if (!customerError && customers) {
      const uniqueCustomers = new Map();
      customers.forEach(c => {
        const key = `${c.site_id}-${c.customer_email}`;
        if (!uniqueCustomers.has(key)) {
          uniqueCustomers.set(key, c);
        }
      });

      console.log(`   Found ${uniqueCustomers.size} unique customers`);

      // Call the update function for each customer
      for (const [key, customer] of uniqueCustomers) {
        try {
          const { error } = await supabase.rpc('update_customer_history_stats', {
            p_site_id: customer.site_id,
            p_customer_email: customer.customer_email
          });

          if (error) {
            console.error(`   Failed to update customer ${customer.customer_email}:`, error.message);
          }
        } catch (error) {
          console.error(`   Error updating customer ${customer.customer_email}:`, error);
        }
      }

      console.log('✅ Customer history updated');
    }

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillOrders()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });