import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import crypto from 'crypto';

interface WebhookPayload {
  event: string;
  timestamp: number;
  site_url: string;
  order: {
    id: number;
    number: string;
    order_key: string;
    status: string;
    currency: string;
    date_created: string;
    date_modified: string;
    date_completed?: string;
    date_paid?: string;
    total: number;
    subtotal: number;
    total_tax: number;
    shipping_total: number;
    shipping_tax: number;
    discount_total: number;
    discount_tax: number;
    payment_method?: string;
    payment_method_title?: string;
    transaction_id?: string;
    customer_id: number;
    customer_note?: string;
    billing: {
      first_name?: string;
      last_name?: string;
      company?: string;
      address_1?: string;
      address_2?: string;
      city?: string;
      state?: string;
      postcode?: string;
      country?: string;
      email?: string;
      phone?: string;
    };
    shipping: {
      first_name?: string;
      last_name?: string;
      company?: string;
      address_1?: string;
      address_2?: string;
      city?: string;
      state?: string;
      postcode?: string;
      country?: string;
    };
    line_items: Array<{
      id: number;
      name: string;
      product_id: number;
      variation_id: number;
      quantity: number;
      tax_class?: string;
      subtotal: number;
      subtotal_tax: number;
      total: number;
      total_tax: number;
      taxes: any;
      meta_data: any;
      sku: string;
      price: number;
    }>;
    shipping_lines?: any[];
    tax_lines?: any[];
    fee_lines?: any[];
    coupon_lines?: any[];
    refunds?: any[];
    meta_data?: any[];
  };
}

// POST: Receive order webhook from WooCommerce
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      console.error('Webhook received but Supabase not configured');
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    // Get request body and headers
    const body = await request.text();
    const signature = request.headers.get('x-wc-signature');
    const event = request.headers.get('x-wc-event');
    const source = request.headers.get('x-wc-source');
    const timestamp = request.headers.get('x-wc-timestamp');

    console.log('Received webhook:', { event, source, hasSignature: !!signature });

    // Basic validation
    if (!event || !event.startsWith('order.')) {
      console.error('Invalid webhook event:', event);
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }

    // Parse payload
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error('Invalid JSON payload:', error);
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate payload structure
    if (!payload.order || !payload.order.id) {
      console.error('Invalid payload structure:', payload);
      return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
    }

    // Find matching site configuration
    let siteId: string | null = null;
    if (source) {
      const { data: site } = await supabase
        .from('wc_sites')
        .select('id, api_secret')
        .eq('url', source)
        .eq('enabled', true)
        .single();

      if (site) {
        siteId = site.id;

        // Verify signature if available
        if (signature && site.api_secret) {
          const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', site.api_secret)
            .update(body)
            .digest('hex');

          if (signature !== expectedSignature) {
            console.error('Invalid webhook signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
          }
        }
      } else {
        console.error('Site not found or disabled:', source);
        return NextResponse.json({ error: 'Site not found' }, { status: 404 });
      }
    }

    // Process webhook based on event type
    const startTime = Date.now();
    let result;

    switch (payload.event) {
      case 'order.created':
      case 'order.updated':
        result = await processOrderWebhook(supabase, siteId, payload, 'upsert');
        break;
      case 'order.deleted':
        result = await processOrderWebhook(supabase, siteId, payload, 'delete');
        break;
      default:
        console.error('Unsupported event type:', payload.event);
        return NextResponse.json({ error: 'Unsupported event type' }, { status: 400 });
    }

    const processingTime = Date.now() - startTime;
    
    // Log webhook processing
    if (siteId) {
      await logWebhookEvent(supabase, {
        site_id: siteId,
        event_type: payload.event,
        object_id: payload.order.id,
        object_type: 'order',
        processing_time: processingTime,
        status: result.success ? 'success' : 'error',
        error_message: result.error || null,
      });
    }

    if (result.success) {
      console.log(`Webhook processed successfully: ${payload.event} for order ${payload.order.id}`);
      return NextResponse.json({ 
        success: true, 
        message: 'Webhook processed successfully',
        processing_time: processingTime 
      });
    } else {
      console.error(`Webhook processing failed: ${result.error}`);
      return NextResponse.json({ 
        error: result.error 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// Process order webhook
async function processOrderWebhook(
  supabase: any, 
  siteId: string | null, 
  payload: WebhookPayload, 
  action: 'upsert' | 'delete'
) {
  try {
    if (!siteId) {
      return { success: false, error: 'No site ID available' };
    }

    if (action === 'delete') {
      // Delete order and related items
      const { error: itemsError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', payload.order.id);

      const { error: orderError } = await supabase
        .from('orders')
        .delete()
        .eq('site_id', siteId)
        .eq('order_id', payload.order.id);

      if (orderError) {
        return { success: false, error: `Failed to delete order: ${orderError.message}` };
      }

      return { success: true };
    }

    // Upsert order
    const orderData = {
      site_id: siteId,
      order_id: payload.order.id,
      order_number: payload.order.number,
      order_key: payload.order.order_key,
      status: payload.order.status,
      currency: payload.order.currency,
      payment_method: payload.order.payment_method,
      payment_method_title: payload.order.payment_method_title,
      transaction_id: payload.order.transaction_id,
      total: payload.order.total,
      subtotal: payload.order.subtotal,
      total_tax: payload.order.total_tax,
      shipping_total: payload.order.shipping_total,
      shipping_tax: payload.order.shipping_tax,
      discount_total: payload.order.discount_total,
      discount_tax: payload.order.discount_tax,
      customer_id: payload.order.customer_id,
      customer_email: payload.order.billing?.email,
      customer_first_name: payload.order.billing?.first_name,
      customer_last_name: payload.order.billing?.last_name,
      customer_company: payload.order.billing?.company,
      customer_phone: payload.order.billing?.phone,
      customer_note: payload.order.customer_note,
      billing_first_name: payload.order.billing?.first_name,
      billing_last_name: payload.order.billing?.last_name,
      billing_company: payload.order.billing?.company,
      billing_address_1: payload.order.billing?.address_1,
      billing_address_2: payload.order.billing?.address_2,
      billing_city: payload.order.billing?.city,
      billing_state: payload.order.billing?.state,
      billing_postcode: payload.order.billing?.postcode,
      billing_country: payload.order.billing?.country,
      billing_email: payload.order.billing?.email,
      billing_phone: payload.order.billing?.phone,
      shipping_first_name: payload.order.shipping?.first_name,
      shipping_last_name: payload.order.shipping?.last_name,
      shipping_company: payload.order.shipping?.company,
      shipping_address_1: payload.order.shipping?.address_1,
      shipping_address_2: payload.order.shipping?.address_2,
      shipping_city: payload.order.shipping?.city,
      shipping_state: payload.order.shipping?.state,
      shipping_postcode: payload.order.shipping?.postcode,
      shipping_country: payload.order.shipping?.country,
      date_created: payload.order.date_created,
      date_modified: payload.order.date_modified,
      date_completed: payload.order.date_completed || null,
      date_paid: payload.order.date_paid || null,
      meta_data: payload.order.meta_data,
      refunds: payload.order.refunds,
      synced_at: new Date().toISOString(),
    };

    const { data: orderResult, error: orderError } = await supabase
      .from('orders')
      .upsert(orderData, {
        onConflict: 'site_id,order_id',
        returning: 'minimal',
      })
      .select('id');

    if (orderError) {
      return { success: false, error: `Failed to upsert order: ${orderError.message}` };
    }

    // Get the internal order ID
    let internalOrderId: string;
    if (orderResult && orderResult.length > 0) {
      internalOrderId = orderResult[0].id;
    } else {
      // Query for existing order ID
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('site_id', siteId)
        .eq('order_id', payload.order.id)
        .single();

      if (!existingOrder) {
        return { success: false, error: 'Failed to get order ID' };
      }
      internalOrderId = existingOrder.id;
    }

    // Delete existing order items
    await supabase
      .from('order_items')
      .delete()
      .eq('order_id', internalOrderId);

    // Insert new order items
    if (payload.order.line_items && payload.order.line_items.length > 0) {
      const orderItems = payload.order.line_items.map(item => ({
        order_id: internalOrderId,
        item_id: item.id,
        item_type: 'line_item',
        product_id: item.product_id || null,
        variation_id: item.variation_id || null,
        sku: item.sku || null,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
        subtotal_tax: item.subtotal_tax,
        total: item.total,
        total_tax: item.total_tax,
        tax_class: item.tax_class,
        taxes: item.taxes,
        meta_data: item.meta_data,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('Failed to insert order items:', itemsError);
        // Don't fail the entire operation for item errors
      }
    }

    return { success: true };

  } catch (error: any) {
    console.error('Error processing order webhook:', error);
    return { success: false, error: error.message };
  }
}

// Log webhook event
async function logWebhookEvent(supabase: any, data: {
  site_id: string;
  event_type: string;
  object_id: number;
  object_type: string;
  processing_time: number;
  status: string;
  error_message?: string | null;
}) {
  try {
    await supabase
      .from('webhook_events')
      .insert({
        site_id: data.site_id,
        event_type: data.event_type,
        object_id: data.object_id,
        object_type: data.object_type,
        processing_time_ms: data.processing_time,
        status: data.status,
        error_message: data.error_message,
        received_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('Failed to log webhook event:', error);
    // Don't fail the main operation if logging fails
  }
}