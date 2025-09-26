#!/usr/bin/env node

/**
 * Fast backfill for order fields - focuses on extracting data from meta_data
 * Customer history stats can be calculated separately
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Extract attribution and payment data from meta_data
function extractMetaFields(metaData) {
  if (!metaData || !Array.isArray(metaData)) {
    return {};
  }

  const fields = {};

  for (const meta of metaData) {
    const key = meta.key || meta.name;
    const value = meta.value;

    if (!key || value === undefined || value === null || value === '') continue;

    switch (key) {
      // Attribution fields
      case '_wc_order_attribution_source_type':
        fields.attribution_source_type = value;
        break;
      case '_wc_order_attribution_source':
        fields.attribution_source = value;
        break;
      case '_wc_order_attribution_medium':
        fields.attribution_medium = value;
        break;
      case '_wc_order_attribution_campaign':
        fields.attribution_campaign = value;
        break;
      case '_wc_order_attribution_device_type':
        fields.attribution_device_type = value;
        break;
      case '_wc_order_attribution_session_page_views':
        const pageViews = parseInt(value);
        if (!isNaN(pageViews)) fields.attribution_session_page_views = pageViews;
        break;
      case '_wc_order_attribution_utm_source':
        fields.attribution_utm_source = value;
        break;
      case '_wc_order_attribution_utm_medium':
        fields.attribution_utm_medium = value;
        break;
      case '_wc_order_attribution_utm_campaign':
        fields.attribution_utm_campaign = value;
        break;
      case '_wc_order_attribution_utm_content':
        fields.attribution_utm_content = value;
        break;
      case '_wc_order_attribution_utm_term':
        fields.attribution_utm_term = value;
        break;
      case '_wc_order_attribution_referrer':
        fields.attribution_referrer = value;
        break;

      // Customer IP and User Agent
      case '_customer_ip_address':
        fields.customer_ip_address = value;
        break;
      case '_customer_user_agent':
        fields.customer_user_agent = value;
        break;

      // Payment date
      case '_date_paid':
        if (value) {
          const timestamp = parseInt(value);
          if (!isNaN(timestamp)) {
            fields.payment_date = new Date(timestamp * 1000).toISOString();
          }
        }
        break;
      case '_paid_date':
        if (value && !fields.payment_date) {
          const timestamp = parseInt(value);
          if (!isNaN(timestamp)) {
            fields.payment_date = new Date(timestamp * 1000).toISOString();
          }
        }
        break;
    }
  }

  // Build attribution_origin
  if (fields.attribution_source_type && fields.attribution_source) {
    const sourceType = fields.attribution_source_type.charAt(0).toUpperCase() +
                      fields.attribution_source_type.slice(1);
    fields.attribution_origin = `${sourceType}: ${fields.attribution_source}`;
  }

  return fields;
}

// Determine payment status from order status
function getPaymentStatus(orderStatus, hasPaymentDate) {
  let paymentStatus = 'pending';
  let isPaid = false;

  if (orderStatus === 'completed' || orderStatus === 'processing') {
    paymentStatus = 'completed';
    isPaid = true;
  } else if (orderStatus === 'refunded') {
    paymentStatus = 'refunded';
    isPaid = true;
  } else if (orderStatus === 'failed') {
    paymentStatus = 'failed';
  } else if (orderStatus === 'cancelled') {
    paymentStatus = 'cancelled';
  }

  // If there's a payment date, mark as paid
  if (hasPaymentDate) {
    isPaid = true;
    if (!['completed', 'refunded'].includes(paymentStatus)) {
      paymentStatus = 'completed';
    }
  }

  return { payment_status: paymentStatus, is_paid: isPaid };
}

// Process a batch of orders
async function processBatch(orders) {
  const updates = [];

  for (const order of orders) {
    // Extract fields from meta_data
    const metaFields = extractMetaFields(order.meta_data);

    // Get payment status
    const paymentInfo = getPaymentStatus(order.status, !!metaFields.payment_date || !!order.date_paid);

    // Combine all updates
    const updateData = {
      ...metaFields,
      ...paymentInfo,
      payment_date_gmt: order.date_paid,
      paid_via_credit_card: ['stripe', 'paypal', 'square', 'authorize_net'].includes(order.payment_method)
    };

    // Only update if we have new data
    if (Object.keys(metaFields).length > 0 || !order.payment_status) {
      updates.push({
        id: order.id,
        data: updateData
      });
    }
  }

  // Batch update
  let successCount = 0;
  for (const update of updates) {
    try {
      const { error } = await supabase
        .from('orders')
        .update(update.data)
        .eq('id', update.id);

      if (!error) successCount++;
    } catch (error) {
      // Silent fail, continue with others
    }
  }

  return successCount;
}

async function main() {
  console.log('🚀 Fast Order Backfill - Extracting Meta Data\n');

  try {
    // Get total count
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    console.log(`📊 Total orders: ${count}`);

    // Check sample for already processed orders
    const { data: sample } = await supabase
      .from('orders')
      .select('payment_status, attribution_source')
      .limit(1000);

    if (sample) {
      const alreadyProcessed = sample.filter(o => o.payment_status || o.attribution_source).length;
      const percentProcessed = Math.round(alreadyProcessed / sample.length * 100);
      console.log(`   Already processed: ~${percentProcessed}%\n`);
    }

    const batchSize = 100; // Larger batches for faster processing
    let offset = 0;
    let totalUpdated = 0;
    const startTime = Date.now();

    while (offset < count) {
      // Fetch batch
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, site_id, status, payment_method, date_paid, meta_data, payment_status')
        .range(offset, offset + batchSize - 1)
        .order('synced_at');

      if (error || !orders || orders.length === 0) break;

      // Process batch
      const updated = await processBatch(orders);
      totalUpdated += updated;

      // Progress
      const progress = Math.round((offset + orders.length) / count * 100);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = Math.round(totalUpdated / elapsed);

      process.stdout.write(`\r⚡ Progress: ${progress}% | Updated: ${totalUpdated} | Rate: ${rate}/sec | Batch: ${Math.floor(offset/batchSize) + 1}     `);

      offset += batchSize;
    }

    console.log('\n\n✨ Backfill Complete!');
    console.log(`📊 Orders updated: ${totalUpdated}`);
    console.log(`⏱️  Time: ${Math.round((Date.now() - startTime) / 1000)}s`);

    // Now update customer history in bulk
    console.log('\n🔄 Updating customer history stats...');

    const { data: uniqueCustomers } = await supabase
      .from('orders')
      .select('site_id, customer_email')
      .not('customer_email', 'is', null)
      .in('status', ['completed', 'processing']);

    if (uniqueCustomers) {
      const customerMap = new Map();
      uniqueCustomers.forEach(c => {
        const key = `${c.site_id}-${c.customer_email}`;
        customerMap.set(key, c);
      });

      console.log(`   Found ${customerMap.size} unique customers`);

      let processed = 0;
      for (const [_, customer] of customerMap) {
        try {
          // Calculate stats for this customer
          const { data: customerOrders } = await supabase
            .from('orders')
            .select('total, date_created')
            .eq('site_id', customer.site_id)
            .eq('customer_email', customer.customer_email)
            .in('status', ['completed', 'processing'])
            .order('date_created');

          if (customerOrders && customerOrders.length > 0) {
            const totalRevenue = customerOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
            const avgValue = totalRevenue / customerOrders.length;

            // Update all orders for this customer
            await supabase
              .from('orders')
              .update({
                is_returning_customer: customerOrders.length > 1,
                customer_order_count: customerOrders.length,
                customer_total_revenue: totalRevenue.toFixed(2),
                customer_average_order_value: avgValue.toFixed(2),
                customer_lifetime_value: totalRevenue.toFixed(2),
                customer_first_order_date: customerOrders[0].date_created,
                customer_last_order_date: customerOrders[customerOrders.length - 1].date_created
              })
              .eq('site_id', customer.site_id)
              .eq('customer_email', customer.customer_email);

            processed++;
            if (processed % 100 === 0) {
              process.stdout.write(`\r   Processed ${processed}/${customerMap.size} customers...     `);
            }
          }
        } catch (error) {
          // Continue on error
        }
      }

      console.log(`\n✅ Updated ${processed} customer histories`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main().then(() => {
  console.log('\n🎉 All done!');
  process.exit(0);
});