import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface BatchWebhookPayload {
  events: Array<{
    event: string;
    timestamp: number;
    site_url: string;
    order?: any;
    product?: any;
  }>;
  site_url: string;
  timestamp: number;
}

// POST: Receive batch webhook from WooCommerce
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      console.error('Batch webhook received but Supabase not configured');
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    // Get request body and headers
    const body = await request.text();
    const signature = request.headers.get('x-wc-signature');
    const source = request.headers.get('x-wc-source');

    console.log('Received batch webhook from:', source);

    // Parse payload
    let payload: BatchWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error('Invalid JSON payload:', error);
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate payload structure
    if (!payload.events || !Array.isArray(payload.events) || payload.events.length === 0) {
      console.error('Invalid batch payload structure');
      return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
    }

    // Find matching site configuration
    let siteId: string | null = null;
    if (source || payload.site_url) {
      const siteUrl = source || payload.site_url;
      const { data: site } = await supabase
        .from('wc_sites')
        .select('id, api_secret')
        .eq('url', siteUrl)
        .eq('enabled', true)
        .single();

      if (site) {
        siteId = site.id;

        // TODO: Verify batch signature if needed
        // Batch signatures might need different handling
      } else {
        console.error('Site not found or disabled:', siteUrl);
        return NextResponse.json({ error: 'Site not found' }, { status: 404 });
      }
    }

    if (!siteId) {
      return NextResponse.json({ error: 'Site identification required' }, { status: 400 });
    }

    const startTime = Date.now();
    const results = {
      total: payload.events.length,
      processed: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process each event in the batch
    for (const event of payload.events) {
      try {
        const eventResult = await processSingleEvent(supabase, siteId, event);
        
        if (eventResult.success) {
          results.processed++;
        } else {
          results.failed++;
          results.errors.push(`${event.event}: ${eventResult.error}`);
        }

      } catch (error: any) {
        results.failed++;
        results.errors.push(`${event.event}: ${error.message}`);
        console.error(`Failed to process event ${event.event}:`, error);
      }
    }

    const processingTime = Date.now() - startTime;

    // Log batch processing
    await logBatchWebhookEvent(supabase, {
      site_id: siteId,
      batch_size: results.total,
      processed_count: results.processed,
      failed_count: results.failed,
      processing_time: processingTime,
      status: results.failed === 0 ? 'success' : 'partial',
      errors: results.errors.length > 0 ? results.errors : null,
    });

    console.log(`Batch webhook processed: ${results.processed}/${results.total} events in ${processingTime}ms`);

    return NextResponse.json({
      success: results.failed === 0,
      message: `Processed ${results.processed}/${results.total} events`,
      results,
      processing_time: processingTime,
    });

  } catch (error: any) {
    console.error('Batch webhook processing error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// Process single event from batch
async function processSingleEvent(supabase: any, siteId: string, event: any) {
  try {
    if (event.event.startsWith('order.')) {
      return await processOrderEvent(supabase, siteId, event);
    } else if (event.event.startsWith('product.')) {
      return await processProductEvent(supabase, siteId, event);
    } else {
      return { success: false, error: `Unsupported event type: ${event.event}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Process order event from batch
async function processOrderEvent(supabase: any, siteId: string, event: any) {
  if (!event.order || !event.order.id) {
    return { success: false, error: 'Invalid order data' };
  }

  try {
    switch (event.event) {
      case 'order.created':
      case 'order.updated':
        return await upsertOrder(supabase, siteId, event.order);
      case 'order.deleted':
        return await deleteOrder(supabase, siteId, event.order.id);
      default:
        return { success: false, error: `Unsupported order event: ${event.event}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Process product event from batch
async function processProductEvent(supabase: any, siteId: string, event: any) {
  if (!event.product || !event.product.id) {
    return { success: false, error: 'Invalid product data' };
  }

  try {
    switch (event.event) {
      case 'product.created':
      case 'product.updated':
        return await upsertProduct(supabase, siteId, event.product);
      case 'product.deleted':
        return await deleteProduct(supabase, siteId, event.product.id);
      default:
        return { success: false, error: `Unsupported product event: ${event.event}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Upsert order (simplified version for batch processing)
async function upsertOrder(supabase: any, siteId: string, orderData: any) {
  const order = {
    site_id: siteId,
    order_id: orderData.id,
    order_number: orderData.number,
    status: orderData.status,
    total: parseFloat(orderData.total) || 0,
    date_created: orderData.date_created,
    date_modified: orderData.date_modified || orderData.date_created,
    customer_email: orderData.billing?.email || null,
    synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('orders')
    .upsert(order, { onConflict: 'site_id,order_id' });

  if (error) {
    return { success: false, error: `Failed to upsert order: ${error.message}` };
  }

  return { success: true };
}

// Delete order
async function deleteOrder(supabase: any, siteId: string, orderId: number) {
  // Delete order items first
  await supabase
    .from('order_items')
    .delete()
    .in('order_id', 
      supabase
        .from('orders')
        .select('id')
        .eq('site_id', siteId)
        .eq('order_id', orderId)
    );

  // Delete order
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('site_id', siteId)
    .eq('order_id', orderId);

  if (error) {
    return { success: false, error: `Failed to delete order: ${error.message}` };
  }

  return { success: true };
}

// Upsert product (simplified version for batch processing)
async function upsertProduct(supabase: any, siteId: string, productData: any) {
  const product = {
    site_id: siteId,
    product_id: productData.id,
    sku: productData.sku || `product-${productData.id}`,
    name: productData.name,
    type: productData.type,
    status: productData.status,
    price: parseFloat(productData.price) || null,
    stock_quantity: productData.stock_quantity || null,
    stock_status: productData.stock_status,
    manage_stock: productData.manage_stock,
    date_created: productData.date_created,
    date_modified: productData.date_modified || productData.date_created,
    synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('products')
    .upsert(product, { onConflict: 'site_id,product_id' });

  if (error) {
    return { success: false, error: `Failed to upsert product: ${error.message}` };
  }

  return { success: true };
}

// Delete product
async function deleteProduct(supabase: any, siteId: string, productId: number) {
  // Delete product variations first
  await supabase
    .from('product_variations')
    .delete()
    .in('product_id', 
      supabase
        .from('products')
        .select('id')
        .eq('site_id', siteId)
        .eq('product_id', productId)
    );

  // Delete product
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('site_id', siteId)
    .eq('product_id', productId);

  if (error) {
    return { success: false, error: `Failed to delete product: ${error.message}` };
  }

  return { success: true };
}

// Log batch webhook event
async function logBatchWebhookEvent(supabase: any, data: {
  site_id: string;
  batch_size: number;
  processed_count: number;
  failed_count: number;
  processing_time: number;
  status: string;
  errors?: string[] | null;
}) {
  try {
    await supabase
      .from('webhook_events')
      .insert({
        site_id: data.site_id,
        event_type: 'batch.webhook',
        object_id: null,
        object_type: 'batch',
        processing_time_ms: data.processing_time,
        status: data.status,
        error_message: data.errors ? data.errors.join('; ') : null,
        received_at: new Date().toISOString(),
        metadata: {
          batch_size: data.batch_size,
          processed_count: data.processed_count,
          failed_count: data.failed_count,
          errors: data.errors,
        },
      });
  } catch (error) {
    console.error('Failed to log batch webhook event:', error);
  }
}