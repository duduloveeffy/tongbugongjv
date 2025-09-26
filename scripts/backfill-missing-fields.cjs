#!/usr/bin/env node

/**
 * Selective backfill - only updates orders that are missing the new fields
 * This is much faster as it skips already processed orders
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

// Extract fields from meta_data
function extractMetaFields(metaData) {
  if (!metaData || !Array.isArray(metaData)) return {};

  const fields = {};

  for (const meta of metaData) {
    const key = meta.key || meta.name;
    const value = meta.value;

    if (!key || value === undefined || value === null || value === '') continue;

    switch (key) {
      // Attribution
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
      case '_wc_order_attribution_utm_source':
        fields.attribution_utm_source = value;
        break;
      case '_wc_order_attribution_utm_medium':
        fields.attribution_utm_medium = value;
        break;
      case '_wc_order_attribution_utm_campaign':
        fields.attribution_utm_campaign = value;
        break;
      case '_wc_order_attribution_referrer':
        fields.attribution_referrer = value;
        break;

      // Customer info
      case '_customer_ip_address':
        fields.customer_ip_address = value;
        break;
      case '_customer_user_agent':
        fields.customer_user_agent = value;
        break;

      // Payment date
      case '_date_paid':
        const timestamp = parseInt(value);
        if (!isNaN(timestamp) && timestamp > 0) {
          fields.payment_date = new Date(timestamp * 1000).toISOString();
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

async function main() {
  console.log('🚀 Selective Backfill - Only Missing Fields\n');

  try {
    // First, find orders that need updating
    console.log('🔍 Finding orders with missing fields...');

    const { data: ordersNeedingUpdate, error: searchError } = await supabase
      .from('orders')
      .select('id, status, payment_method, date_paid, meta_data')
      .or('payment_status.is.null,attribution_source.is.null,customer_ip_address.is.null')
      .not('meta_data', 'is', null)
      .limit(10000); // Process up to 10k at a time

    if (searchError) throw searchError;

    if (!ordersNeedingUpdate || ordersNeedingUpdate.length === 0) {
      console.log('✅ All orders are already up to date!');
      return;
    }

    console.log(`📊 Found ${ordersNeedingUpdate.length} orders to update\n`);

    let updated = 0;
    let skipped = 0;
    const startTime = Date.now();

    // Process each order
    for (let i = 0; i < ordersNeedingUpdate.length; i++) {
      const order = ordersNeedingUpdate[i];

      // Extract meta fields
      const metaFields = extractMetaFields(order.meta_data);

      // Determine payment status
      let paymentStatus = 'pending';
      let isPaid = false;

      if (['completed', 'processing'].includes(order.status)) {
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

      if (metaFields.payment_date || order.date_paid) {
        isPaid = true;
        if (!['completed', 'refunded'].includes(paymentStatus)) {
          paymentStatus = 'completed';
        }
      }

      const updateData = {
        ...metaFields,
        payment_status: paymentStatus,
        is_paid: isPaid,
        paid_via_credit_card: ['stripe', 'paypal', 'square'].includes(order.payment_method)
      };

      if (order.date_paid && !updateData.payment_date) {
        updateData.payment_date_gmt = order.date_paid;
      }

      // Update if we have data
      if (Object.keys(metaFields).length > 0 || !order.payment_status) {
        const { error: updateError } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', order.id);

        if (!updateError) {
          updated++;
        } else {
          console.error(`Failed to update order ${order.id}:`, updateError.message);
        }
      } else {
        skipped++;
      }

      // Progress indicator
      if ((i + 1) % 100 === 0 || i === ordersNeedingUpdate.length - 1) {
        const progress = Math.round((i + 1) / ordersNeedingUpdate.length * 100);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const rate = Math.round(updated / (elapsed || 1));

        process.stdout.write(`\r⚡ Progress: ${progress}% | Updated: ${updated} | Skipped: ${skipped} | Rate: ${rate}/sec     `);
      }
    }

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log('\n\n✨ Backfill Complete!');
    console.log(`📊 Summary:`);
    console.log(`   - Orders updated: ${updated}`);
    console.log(`   - Orders skipped: ${skipped}`);
    console.log(`   - Time: ${totalTime}s`);

    // Check remaining
    const { count: remaining } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .or('payment_status.is.null,attribution_source.is.null');

    if (remaining > 0) {
      console.log(`\n📋 ${remaining} orders still need processing.`);
      console.log('   Run this script again to process more.');
    } else {
      console.log('\n✅ All orders have been processed!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main().then(() => {
  console.log('\n🎉 Done!');
  process.exit(0);
});