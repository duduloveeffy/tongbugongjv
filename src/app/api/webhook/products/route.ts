import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import crypto from 'crypto';

interface WebhookPayload {
  event: string;
  timestamp: number;
  site_url: string;
  product: {
    id: number;
    name: string;
    slug: string;
    permalink: string;
    type: string;
    status: string;
    featured: boolean;
    catalog_visibility: string;
    date_created: string;
    date_modified: string;
    date_on_sale_from?: string;
    date_on_sale_to?: string;
    description?: string;
    short_description?: string;
    sku: string;
    price?: number;
    regular_price?: number;
    sale_price?: number;
    tax_status: string;
    tax_class: string;
    manage_stock: boolean;
    stock_quantity?: number;
    stock_status: string;
    backorders: string;
    low_stock_amount?: number;
    sold_individually: boolean;
    weight?: string;
    dimensions: {
      length?: string;
      width?: string;
      height?: string;
    };
    shipping_class?: string;
    upsell_ids: number[];
    cross_sell_ids: number[];
    parent_id: number;
    categories: Array<{
      id: number;
      name: string;
      slug: string;
    }>;
    tags: Array<{
      id: number;
      name: string;
      slug: string;
    }>;
    images: Array<{
      id: number;
      src: string;
      name: string;
      alt: string;
    }>;
    attributes: any[];
    variations: number[];
    downloadable: boolean;
    downloads: any[];
    download_limit: number;
    download_expiry: number;
    external_url?: string;
    button_text?: string;
    reviews_allowed: boolean;
    average_rating: number;
    rating_count: number;
    meta_data?: any[];
    variation_attributes?: any;
  };
}

// POST: Receive product webhook from WooCommerce
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
    if (!event || !event.startsWith('product.')) {
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
    if (!payload.product || !payload.product.id) {
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
      case 'product.created':
      case 'product.updated':
        result = await processProductWebhook(supabase, siteId, payload, 'upsert');
        break;
      case 'product.deleted':
        result = await processProductWebhook(supabase, siteId, payload, 'delete');
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
        object_id: payload.product.id,
        object_type: 'product',
        processing_time: processingTime,
        status: result.success ? 'success' : 'error',
        error_message: result.error || null,
      });
    }

    if (result.success) {
      console.log(`Webhook processed successfully: ${payload.event} for product ${payload.product.id}`);
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

// Process product webhook
async function processProductWebhook(
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
      // Delete product variations first (if any)
      await supabase
        .from('product_variations')
        .delete()
        .in('product_id', 
          supabase
            .from('products')
            .select('id')
            .eq('site_id', siteId)
            .eq('product_id', payload.product.id)
        );

      // Delete product
      const { error: productError } = await supabase
        .from('products')
        .delete()
        .eq('site_id', siteId)
        .eq('product_id', payload.product.id);

      if (productError) {
        return { success: false, error: `Failed to delete product: ${productError.message}` };
      }

      return { success: true };
    }

    // Upsert product
    const productData = {
      site_id: siteId,
      product_id: payload.product.id,
      sku: payload.product.sku || `product-${payload.product.id}`,
      name: payload.product.name,
      slug: payload.product.slug,
      permalink: payload.product.permalink,
      type: payload.product.type,
      status: payload.product.status,
      featured: payload.product.featured,
      catalog_visibility: payload.product.catalog_visibility,
      description: payload.product.description,
      short_description: payload.product.short_description,
      price: payload.product.price || null,
      regular_price: payload.product.regular_price || null,
      sale_price: payload.product.sale_price || null,
      date_on_sale_from: payload.product.date_on_sale_from || null,
      date_on_sale_to: payload.product.date_on_sale_to || null,
      tax_status: payload.product.tax_status,
      tax_class: payload.product.tax_class,
      manage_stock: payload.product.manage_stock,
      stock_quantity: payload.product.stock_quantity || null,
      stock_status: payload.product.stock_status,
      backorders: payload.product.backorders,
      low_stock_amount: payload.product.low_stock_amount || null,
      sold_individually: payload.product.sold_individually,
      weight: payload.product.weight || null,
      length: payload.product.dimensions?.length || null,
      width: payload.product.dimensions?.width || null,
      height: payload.product.dimensions?.height || null,
      shipping_class: payload.product.shipping_class || null,
      upsell_ids: payload.product.upsell_ids,
      cross_sell_ids: payload.product.cross_sell_ids,
      parent_id: payload.product.parent_id,
      categories: payload.product.categories,
      tags: payload.product.tags,
      attributes: payload.product.attributes,
      default_attributes: payload.product.variation_attributes || null,
      variations: payload.product.variations,
      images: payload.product.images,
      downloadable: payload.product.downloadable,
      downloads: payload.product.downloads,
      download_limit: payload.product.download_limit,
      download_expiry: payload.product.download_expiry,
      external_url: payload.product.external_url || null,
      button_text: payload.product.button_text || null,
      reviews_allowed: payload.product.reviews_allowed,
      average_rating: payload.product.average_rating || 0,
      rating_count: payload.product.rating_count || 0,
      date_created: payload.product.date_created,
      date_modified: payload.product.date_modified,
      synced_at: new Date().toISOString(),
    };

    const { data: productResult, error: productError } = await supabase
      .from('products')
      .upsert(productData, {
        onConflict: 'site_id,product_id',
        returning: 'minimal',
      })
      .select('id');

    if (productError) {
      return { success: false, error: `Failed to upsert product: ${productError.message}` };
    }

    // Handle product variations for variable products
    if (payload.product.type === 'variation' && payload.product.parent_id) {
      // This is a product variation, handle it separately
      await processProductVariation(supabase, siteId, payload.product);
    }

    return { success: true };

  } catch (error: any) {
    console.error('Error processing product webhook:', error);
    return { success: false, error: error.message };
  }
}

// Process product variation
async function processProductVariation(supabase: any, siteId: string, variation: any) {
  try {
    // Find the parent product
    const { data: parentProduct } = await supabase
      .from('products')
      .select('id')
      .eq('site_id', siteId)
      .eq('product_id', variation.parent_id)
      .single();

    if (!parentProduct) {
      console.warn(`Parent product not found for variation ${variation.id}`);
      return;
    }

    const variationData = {
      product_id: parentProduct.id,
      variation_id: variation.id,
      sku: variation.sku || `variation-${variation.id}`,
      status: variation.status,
      price: variation.price || null,
      regular_price: variation.regular_price || null,
      sale_price: variation.sale_price || null,
      date_on_sale_from: variation.date_on_sale_from || null,
      date_on_sale_to: variation.date_on_sale_to || null,
      manage_stock: variation.manage_stock,
      stock_quantity: variation.stock_quantity || null,
      stock_status: variation.stock_status,
      backorders: variation.backorders,
      weight: variation.weight || null,
      length: variation.dimensions?.length || null,
      width: variation.dimensions?.width || null,
      height: variation.dimensions?.height || null,
      shipping_class: variation.shipping_class || null,
      attributes: variation.variation_attributes,
      image: variation.images?.[0] || null,
      meta_data: variation.meta_data,
      downloadable: variation.downloadable,
      downloads: variation.downloads,
      download_limit: variation.download_limit,
      download_expiry: variation.download_expiry,
      date_created: variation.date_created,
      date_modified: variation.date_modified,
      synced_at: new Date().toISOString(),
    };

    const { error: variationError } = await supabase
      .from('product_variations')
      .upsert(variationData, {
        onConflict: 'product_id,variation_id',
      });

    if (variationError) {
      console.error('Failed to upsert product variation:', variationError);
    }

  } catch (error) {
    console.error('Error processing product variation:', error);
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