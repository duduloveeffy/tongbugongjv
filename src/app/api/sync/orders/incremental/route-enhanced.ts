// Enhanced version of processOrderBatch with full payment, attribution, and customer history support

import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// Enhanced WooCommerce Order interface with extended fields
interface WooCommerceOrder {
  id: number;
  number: string;
  order_key: string;
  status: string;
  currency: string;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;

  // Monetary values
  total: string;
  subtotal: string;
  total_tax: string;
  shipping_total: string;
  shipping_tax: string;
  discount_total: string;
  discount_tax: string;

  // Customer info
  customer_id: number;
  customer_note: string;
  customer_ip_address: string;
  customer_user_agent: string;

  // Dates
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  date_completed: string | null;
  date_completed_gmt: string | null;
  date_paid: string | null;
  date_paid_gmt: string | null;

  // Billing & Shipping
  billing: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    email: string;
    phone: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };

  // Line items
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    tax_class: string;
    subtotal: string;
    subtotal_tax: string;
    total: string;
    total_tax: string;
    taxes: any[];
    meta_data: any[];
    sku: string;
    price: number;
  }>;

  // Meta data
  meta_data: Array<{
    id: number;
    key: string;
    value: any;
  }>;

  // Refunds
  refunds: any[];
}

// Helper function to extract order attribution data from meta_data
function extractAttributionData(metaData: any[]) {
  const attribution: any = {
    origin: null,
    source_type: null,
    source: null,
    medium: null,
    campaign: null,
    device_type: null,
    session_page_views: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    referrer: null,
  };

  if (!metaData || !Array.isArray(metaData)) {
    return attribution;
  }

  metaData.forEach(meta => {
    const key = meta.key?.toLowerCase() || '';
    const value = meta.value;

    // WooCommerce Order Attribution fields
    if (key === '_wc_order_attribution_source_type') attribution.source_type = value;
    if (key === '_wc_order_attribution_source') attribution.source = value;
    if (key === '_wc_order_attribution_medium') attribution.medium = value;
    if (key === '_wc_order_attribution_campaign') attribution.campaign = value;
    if (key === '_wc_order_attribution_device_type') attribution.device_type = value;
    if (key === '_wc_order_attribution_session_pages') attribution.session_page_views = parseInt(value) || null;
    if (key === '_wc_order_attribution_referrer') attribution.referrer = value;

    // UTM parameters
    if (key === '_wc_order_attribution_utm_source' || key === 'utm_source') attribution.utm_source = value;
    if (key === '_wc_order_attribution_utm_medium' || key === 'utm_medium') attribution.utm_medium = value;
    if (key === '_wc_order_attribution_utm_campaign' || key === 'utm_campaign') attribution.utm_campaign = value;
    if (key === '_wc_order_attribution_utm_content' || key === 'utm_content') attribution.utm_content = value;
    if (key === '_wc_order_attribution_utm_term' || key === 'utm_term') attribution.utm_term = value;

    // Legacy or custom attribution fields
    if (key === 'origin' || key === '_origin') attribution.origin = value;
  });

  // Build origin string if not directly provided
  if (!attribution.origin && attribution.source) {
    if (attribution.source_type === 'organic' && attribution.source) {
      attribution.origin = `Organic: ${attribution.source}`;
    } else if (attribution.source_type === 'paid' && attribution.source) {
      attribution.origin = `Paid: ${attribution.source}`;
    } else if (attribution.source_type) {
      attribution.origin = `${attribution.source_type}: ${attribution.source || 'Unknown'}`;
    }
  }

  return attribution;
}

// Enhanced processOrderBatch function
export async function processOrderBatch(
  supabase: any,
  siteId: string,
  orders: WooCommerceOrder[],
  results: any
) {
  // Remove duplicate orders in the batch
  const uniqueOrdersMap = new Map<number, WooCommerceOrder>();
  orders.forEach(order => {
    uniqueOrdersMap.set(order.id, order);
  });
  const uniqueOrders = Array.from(uniqueOrdersMap.values());

  if (uniqueOrders.length < orders.length) {
    console.log(`Removed ${orders.length - uniqueOrders.length} duplicate orders in batch`);
  }

  // Track customer emails for history update
  const customerEmails = new Set<string>();

  // Prepare orders for insertion with all new fields
  const ordersToInsert = uniqueOrders.map(order => {
    const attribution = extractAttributionData(order.meta_data);
    const customerEmail = order.billing?.email || null;

    if (customerEmail) {
      customerEmails.add(customerEmail);
    }

    // Determine payment status
    const isPaid = !!order.date_paid || ['completed', 'processing'].includes(order.status);
    const paymentStatus = isPaid ? 'paid' :
      order.status === 'pending' ? 'pending' :
      order.status === 'failed' ? 'failed' :
      order.status === 'refunded' ? 'refunded' :
      order.status === 'cancelled' ? 'cancelled' : 'unknown';

    return {
      site_id: siteId,
      order_id: order.id,
      order_number: order.number,
      order_key: order.order_key,
      status: order.status,
      currency: order.currency,

      // Payment information
      payment_method: order.payment_method,
      payment_method_title: order.payment_method_title,
      transaction_id: order.transaction_id,
      payment_date: order.date_paid,
      payment_date_gmt: order.date_paid_gmt || null,
      payment_status: paymentStatus,
      is_paid: isPaid,
      paid_via_credit_card: ['stripe', 'square', 'paypal', 'authorize_net'].includes(order.payment_method),

      // Customer IP and User Agent
      customer_ip_address: order.customer_ip_address || null,
      customer_user_agent: order.customer_user_agent || null,

      // Monetary values
      total: parseFloat(order.total) || 0,
      subtotal: parseFloat(order.subtotal) || 0,
      total_tax: parseFloat(order.total_tax) || 0,
      shipping_total: parseFloat(order.shipping_total) || 0,
      shipping_tax: parseFloat(order.shipping_tax) || 0,
      discount_total: parseFloat(order.discount_total) || 0,
      discount_tax: parseFloat(order.discount_tax) || 0,

      // Customer info
      customer_id: order.customer_id || null,
      customer_email: customerEmail,
      customer_first_name: order.billing?.first_name || null,
      customer_last_name: order.billing?.last_name || null,
      customer_company: order.billing?.company || null,
      customer_phone: order.billing?.phone || null,
      customer_note: order.customer_note || null,

      // Billing
      billing_first_name: order.billing?.first_name || null,
      billing_last_name: order.billing?.last_name || null,
      billing_company: order.billing?.company || null,
      billing_address_1: order.billing?.address_1 || null,
      billing_address_2: order.billing?.address_2 || null,
      billing_city: order.billing?.city || null,
      billing_state: order.billing?.state || null,
      billing_postcode: order.billing?.postcode || null,
      billing_country: order.billing?.country || null,
      billing_email: order.billing?.email || null,
      billing_phone: order.billing?.phone || null,

      // Shipping
      shipping_first_name: order.shipping?.first_name || null,
      shipping_last_name: order.shipping?.last_name || null,
      shipping_company: order.shipping?.company || null,
      shipping_address_1: order.shipping?.address_1 || null,
      shipping_address_2: order.shipping?.address_2 || null,
      shipping_city: order.shipping?.city || null,
      shipping_state: order.shipping?.state || null,
      shipping_postcode: order.shipping?.postcode || null,
      shipping_country: order.shipping?.country || null,

      // Dates
      date_created: order.date_created,
      date_modified: order.date_modified || order.date_created,
      date_completed: order.date_completed || null,
      date_paid: order.date_paid || null,

      // Order Attribution
      attribution_origin: attribution.origin,
      attribution_source_type: attribution.source_type,
      attribution_source: attribution.source,
      attribution_medium: attribution.medium,
      attribution_campaign: attribution.campaign,
      attribution_device_type: attribution.device_type,
      attribution_session_page_views: attribution.session_page_views,
      attribution_utm_source: attribution.utm_source,
      attribution_utm_medium: attribution.utm_medium,
      attribution_utm_campaign: attribution.utm_campaign,
      attribution_utm_content: attribution.utm_content,
      attribution_utm_term: attribution.utm_term,
      attribution_referrer: attribution.referrer,

      // Meta data and raw data
      meta_data: order.meta_data || {},
      raw_data: order, // Store complete order data for reference
    };
  });

  // Upsert orders to wc_orders_v2 table
  const { data: insertedOrders, error: orderError } = await supabase
    .from('wc_orders_v2')
    .upsert(ordersToInsert, {
      onConflict: 'site_id,order_id',
    })
    .select('id,order_id,customer_email');

  if (orderError) {
    console.error('Order upsert error:', orderError);
    results.failedOrders += ordersToInsert.length;
    results.errors.push(`Database error: ${orderError.message}`);
    return;
  }

  results.syncedOrders += insertedOrders?.length || 0;

  // Process order notes
  await processOrderNotes(supabase, siteId, uniqueOrders);

  // Process order line items
  await processOrderItems(supabase, siteId, uniqueOrders);

  // Update customer history
  if (customerEmails.size > 0) {
    await updateCustomerHistory(supabase, siteId, Array.from(customerEmails));
  }
}

// Process order notes
async function processOrderNotes(supabase: any, siteId: string, orders: WooCommerceOrder[]) {
  const allNotes: any[] = [];

  // Fetch notes for each order (this would typically come from WooCommerce API)
  for (const order of orders) {
    // Add customer note if exists
    if (order.customer_note) {
      allNotes.push({
        site_id: siteId,
        order_id: order.id,
        note_id: 0, // Customer note doesn't have an ID
        note: order.customer_note,
        note_type: 'customer',
        customer_note: true,
        added_by: 'customer',
        date_created: order.date_created,
      });
    }

    // In a real implementation, you would fetch order notes from WooCommerce API
    // const notes = await fetchOrderNotes(order.id);
    // allNotes.push(...notes.map(note => ({ ... })));
  }

  if (allNotes.length > 0) {
    const { error } = await supabase
      .from('wc_order_notes')
      .upsert(allNotes, {
        onConflict: 'site_id,order_id,note_id',
      });

    if (error) {
      console.error('Failed to sync order notes:', error);
    }
  }
}

// Process order line items
async function processOrderItems(supabase: any, siteId: string, orders: WooCommerceOrder[]) {
  const allItems: any[] = [];

  orders.forEach(order => {
    if (order.line_items && Array.isArray(order.line_items)) {
      order.line_items.forEach(item => {
        allItems.push({
          site_id: siteId,
          order_id: order.id,
          item_id: item.id,
          product_id: item.product_id || null,
          variation_id: item.variation_id || null,
          name: item.name,
          sku: item.sku || null,
          quantity: item.quantity,
          price: item.price || 0,
          subtotal: parseFloat(item.subtotal) || 0,
          subtotal_tax: parseFloat(item.subtotal_tax) || 0,
          total: parseFloat(item.total) || 0,
          total_tax: parseFloat(item.total_tax) || 0,
          tax_class: item.tax_class || null,
          meta_data: item.meta_data || {},
        });
      });
    }
  });

  if (allItems.length > 0) {
    const { error } = await supabase
      .from('wc_order_items_v2')
      .upsert(allItems, {
        onConflict: 'site_id,order_id,item_id',
      });

    if (error) {
      console.error('Failed to sync order items:', error);
    }
  }
}

// Update customer history
async function updateCustomerHistory(supabase: any, siteId: string, customerEmails: string[]) {
  for (const email of customerEmails) {
    // Calculate customer statistics
    const { data: orderStats } = await supabase
      .from('wc_orders_v2')
      .select('order_id, total, date_created')
      .eq('site_id', siteId)
      .eq('customer_email', email)
      .order('date_created', { ascending: true });

    if (orderStats && orderStats.length > 0) {
      const totalOrders = orderStats.length;
      const totalRevenue = orderStats.reduce((sum: number, order: any) => sum + (order.total || 0), 0);
      const averageOrderValue = totalRevenue / totalOrders;
      const firstOrderDate = orderStats[0].date_created;
      const lastOrderDate = orderStats[orderStats.length - 1].date_created;

      // Update customer history
      const { error } = await supabase
        .from('wc_customer_history')
        .upsert({
          site_id: siteId,
          customer_email: email,
          total_orders: totalOrders,
          total_revenue: totalRevenue,
          average_order_value: averageOrderValue,
          first_order_date: firstOrderDate,
          last_order_date: lastOrderDate,
          lifetime_value: totalRevenue,
        }, {
          onConflict: 'site_id,customer_email',
        });

      if (error) {
        console.error(`Failed to update customer history for ${email}:`, error);
      }

      // Also update the is_returning_customer flag in orders
      await supabase
        .from('wc_orders_v2')
        .update({
          customer_total_orders: totalOrders,
          customer_total_revenue: totalRevenue,
          customer_average_order_value: averageOrderValue,
          is_returning_customer: totalOrders > 1,
          customer_first_order_date: firstOrderDate,
          customer_last_order_date: lastOrderDate,
        })
        .eq('site_id', siteId)
        .eq('customer_email', email);
    }
  }
}