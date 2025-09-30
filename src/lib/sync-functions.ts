import { getSupabaseClient } from '@/lib/supabase';

interface OrderItem {
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
}

interface WooCommerceOrder {
  id: number;
  number: string;
  order_key: string;
  status: string;
  currency: string;
  total: string;
  subtotal: string;
  total_tax: string;
  shipping_total: string;
  shipping_tax: string;
  discount_total: string;
  discount_tax: string;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  customer_id: number;
  customer_note: string;
  customer_ip_address: string;
  customer_user_agent: string;
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
  date_created: string;
  date_modified: string;
  date_completed: string | null;
  date_paid: string | null;
  date_paid_gmt: string | null;
  meta_data: any[];
  line_items: OrderItem[];
  refunds: any[];
}

interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  date_created: string;
  date_modified: string;
  type: string;
  status: string;
  featured: boolean;
  catalog_visibility: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_to: string | null;
  price_html: string;
  on_sale: boolean;
  purchasable: boolean;
  total_sales: number;
  virtual: boolean;
  downloadable: boolean;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: string;
  backorders: string;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_required: boolean;
  shipping_taxable: boolean;
  shipping_class: string;
  shipping_class_id: number;
  reviews_allowed: boolean;
  average_rating: string;
  rating_count: number;
  parent_id: number;
  purchase_note: string;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  tags: any[];
  images: any[];
  attributes: any[];
  default_attributes: any[];
  variations: number[];
  grouped_products: any[];
  menu_order: number;
  meta_data: any[];
  yoast_head: string;
  yoast_head_json: any;
}

export interface SyncResult {
  totalOrders?: number;
  syncedOrders?: number;
  syncedItems?: number;
  failedOrders?: number;
  totalProducts?: number;
  syncedProducts?: number;
  failedProducts?: number;
  errors: string[];
  duration?: number;
  hasMore?: boolean;
}

// Safe number parsing with range validation
function safeParseFloat(value: any, defaultValue = 0, max = 9999999999.9999): number {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = parseFloat(String(value));
  if (isNaN(parsed)) {
    return defaultValue;
  }

  // Clamp to reasonable range to prevent overflow
  return Math.min(Math.max(parsed, -max), max);
}

function safeParseInt(value: any, defaultValue: number | null = null, max = 2147483647): number | null {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }

  // Clamp to INT range to prevent overflow
  return Math.min(Math.max(parsed, -max), max);
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

// Get or create sync checkpoint
async function getOrCreateCheckpoint(supabase: any, siteId: string, syncType: string) {
  const { data: checkpoint } = await supabase
    .from('sync_checkpoints_v2')
    .select('*')
    .eq('site_id', siteId)
    .eq('sync_type', syncType)
    .single();

  if (!checkpoint) {
    const { data: newCheckpoint } = await supabase
      .from('sync_checkpoints_v2')
      .insert({
        site_id: siteId,
        sync_type: syncType,
        orders_synced_count: 0,
        products_synced_count: 0,
      })
      .select()
      .single();

    return newCheckpoint;
  }

  return checkpoint;
}

// Fetch incremental orders from WooCommerce
async function fetchIncrementalOrders(
  siteUrl: string,
  apiKey: string,
  apiSecret: string,
  checkpoint: any,
  mode: string
): Promise<{ orders: WooCommerceOrder[], hasMore: boolean, lastOrder: WooCommerceOrder | null }> {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = siteUrl.replace(/\/$/, '');

  const allOrders: WooCommerceOrder[] = [];
  const seenOrderIds = new Set<number>();
  let page = 1;
  const perPage = 100;
  let hasMore = false;
  let lastOrder: WooCommerceOrder | null = null;

  const buildParams = (pageNum: number) => {
    const params = new URLSearchParams({
      per_page: perPage.toString(),
      page: pageNum.toString(),
      orderby: 'modified',
      order: 'asc',
      status: 'any',
    });

    if (mode === 'incremental' && checkpoint?.last_order_modified) {
      const lastModified = new Date(checkpoint.last_order_modified);
      lastModified.setSeconds(lastModified.getSeconds() + 1);
      params.append('modified_after', lastModified.toISOString());
    }

    return params;
  };

  const maxPages = mode === 'full' ? 999999 : 50;
  console.log(`[${siteUrl}] Fetching orders, mode: ${mode}`);

  while (page <= maxPages) {
    const params = buildParams(page);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${baseUrl}/wp-json/wc/v3/orders?${params.toString()}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
      }

      const orders = await response.json();

      if (orders.length === 0) {
        break;
      }

      const newOrders = orders.filter((order: WooCommerceOrder) => {
        if (seenOrderIds.has(order.id)) {
          return false;
        }
        seenOrderIds.add(order.id);
        return true;
      });

      if (newOrders.length > 0) {
        allOrders.push(...newOrders);
      }

      if (orders.length > 0) {
        lastOrder = orders[orders.length - 1];
      }

      hasMore = orders.length === perPage;
      if (!hasMore) {
        break;
      }

      page++;

      if (page % 10 === 0) {
        console.log(`[${siteUrl}] Fetched ${allOrders.length} orders (page ${page})`);
      }

      if (orders.length === perPage) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout while fetching orders');
      }

      throw fetchError;
    }
  }

  return { orders: allOrders, hasMore, lastOrder };
}

// Process order items
async function processOrderItems(supabase: any, orders: any[], orderIdMap: Map<any, any>, results: SyncResult) {
  const allOrderItems: any[] = [];

  for (const order of orders) {
    const orderId = orderIdMap.get(order.id);
    if (!orderId) continue;

    if (order.line_items && order.line_items.length > 0) {
      const orderItems = order.line_items.map((item: any) => ({
        order_id: orderId,
        item_id: safeParseInt(item.id, 0),
        item_type: 'line_item',
        product_id: safeParseInt(item.product_id, null),
        variation_id: safeParseInt(item.variation_id, null),
        sku: item.sku || null,
        name: item.name,
        quantity: safeParseInt(item.quantity, 1, 999999),
        price: safeParseFloat(item.price),
        subtotal: safeParseFloat(item.subtotal),
        subtotal_tax: safeParseFloat(item.subtotal_tax),
        total: safeParseFloat(item.total),
        total_tax: safeParseFloat(item.total_tax),
        tax_class: item.tax_class || null,
        taxes: item.taxes || null,
        meta_data: item.meta_data || null,
      }));

      allOrderItems.push(...orderItems);
    }
  }

  if (allOrderItems.length > 0) {
    const { error: itemError } = await supabase
      .from('order_items')
      .upsert(allOrderItems, {
        onConflict: 'order_id,item_id',
      });

    if (itemError) {
      console.error('Failed to insert order items:', itemError);
      results.errors.push(`Order items error: ${itemError.message}`);
    } else {
      results.syncedItems = (results.syncedItems || 0) + allOrderItems.length;
    }
  }
}

// Process a batch of orders
async function processOrderBatch(
  supabase: any,
  siteId: string,
  orders: WooCommerceOrder[],
  results: SyncResult
) {
  const uniqueOrdersMap = new Map<number, WooCommerceOrder>();
  orders.forEach(order => {
    uniqueOrdersMap.set(order.id, order);
  });
  const uniqueOrders = Array.from(uniqueOrdersMap.values());

  const customerEmails = new Set<string>();

  const ordersToInsert = uniqueOrders.map(order => {
    const attribution = extractAttributionData(order.meta_data);
    const customerEmail = order.billing?.email || null;

    if (customerEmail) {
      customerEmails.add(customerEmail);
    }

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
      payment_method: order.payment_method,
      payment_method_title: order.payment_method_title,
      transaction_id: order.transaction_id,
      payment_date: order.date_paid,
      payment_date_gmt: order.date_paid_gmt || null,
      payment_status: paymentStatus,
      is_paid: isPaid,
      paid_via_credit_card: ['stripe', 'square', 'paypal', 'authorize_net'].includes(order.payment_method),
      customer_ip_address: order.customer_ip_address || null,
      customer_user_agent: order.customer_user_agent || null,
      total: safeParseFloat(order.total),
      subtotal: safeParseFloat(order.subtotal),
      total_tax: safeParseFloat(order.total_tax),
      shipping_total: safeParseFloat(order.shipping_total),
      shipping_tax: safeParseFloat(order.shipping_tax),
      discount_total: safeParseFloat(order.discount_total),
      discount_tax: safeParseFloat(order.discount_tax),
      customer_id: safeParseInt(order.customer_id, null),
      customer_email: order.billing?.email || null,
      customer_first_name: order.billing?.first_name || null,
      customer_last_name: order.billing?.last_name || null,
      customer_company: order.billing?.company || null,
      customer_phone: order.billing?.phone || null,
      customer_note: order.customer_note || null,
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
      shipping_first_name: order.shipping?.first_name || null,
      shipping_last_name: order.shipping?.last_name || null,
      shipping_company: order.shipping?.company || null,
      shipping_address_1: order.shipping?.address_1 || null,
      shipping_address_2: order.shipping?.address_2 || null,
      shipping_city: order.shipping?.city || null,
      shipping_state: order.shipping?.state || null,
      shipping_postcode: order.shipping?.postcode || null,
      shipping_country: order.shipping?.country || null,
      shipping_method: null,
      date_created: order.date_created,
      date_modified: order.date_modified || order.date_created,
      date_completed: order.date_completed || null,
      date_paid: order.date_paid || null,
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
      meta_data: order.meta_data || null,
      refunds: order.refunds || null,
      synced_at: new Date().toISOString(),
    };
  });

  const { data: insertedOrders, error: orderError } = await supabase
    .from('orders')
    .upsert(ordersToInsert, {
      onConflict: 'site_id,order_id',
      returning: 'minimal',
    })
    .select('id,order_id');

  if (orderError) {
    console.error('Order upsert error:', orderError);
    results.failedOrders = (results.failedOrders || 0) + ordersToInsert.length;
    results.errors.push(`Database error: ${orderError.message}`);
    return;
  }

  results.syncedOrders = (results.syncedOrders || 0) + uniqueOrders.length;

  const orderIdMap = new Map();
  if (insertedOrders) {
    insertedOrders.forEach((order: any) => {
      orderIdMap.set(order.order_id, order.id);
    });
  }

  await processOrderItems(supabase, uniqueOrders, orderIdMap, results);
}

// Fetch incremental products from WooCommerce
async function fetchIncrementalProducts(
  siteUrl: string,
  apiKey: string,
  apiSecret: string,
  checkpoint: any,
  mode: string
): Promise<{ products: WooCommerceProduct[], hasMore: boolean, lastProduct: WooCommerceProduct | null }> {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = siteUrl.replace(/\/$/, '');

  const allProducts: WooCommerceProduct[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = false;
  let lastProduct: WooCommerceProduct | null = null;

  const buildParams = (pageNum: number) => {
    const params = new URLSearchParams({
      per_page: perPage.toString(),
      page: pageNum.toString(),
      orderby: 'modified',
      order: 'asc',
      status: 'any',
    });

    if (mode === 'incremental' && checkpoint?.last_product_modified) {
      const lastModified = new Date(checkpoint.last_product_modified);
      lastModified.setSeconds(lastModified.getSeconds() + 1);
      params.append('modified_after', lastModified.toISOString());
    }

    return params;
  };

  const maxPages = mode === 'full' ? 999999 : 50;
  console.log(`[${siteUrl}] Fetching products, mode: ${mode}`);

  while (page <= maxPages) {
    const params = buildParams(page);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?${params.toString()}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
      }

      const products = await response.json();

      if (products.length === 0) {
        break;
      }

      allProducts.push(...products);

      if (products.length > 0) {
        lastProduct = products[products.length - 1];
      }

      hasMore = products.length === perPage;
      if (!hasMore) {
        break;
      }

      page++;

      if (page % 10 === 0) {
        console.log(`[${siteUrl}] Fetched ${allProducts.length} products (page ${page})`);
      }

      if (products.length === perPage) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout while fetching products');
      }

      throw fetchError;
    }
  }

  return { products: allProducts, hasMore, lastProduct };
}

// Process a batch of products
async function processProductBatch(
  supabase: any,
  siteId: string,
  products: WooCommerceProduct[],
  results: SyncResult
) {
  const productsToInsert = products.map(product => ({
    site_id: siteId,
    product_id: product.id,
    name: product.name,
    slug: product.slug,
    permalink: product.permalink,
    type: product.type,
    status: product.status,
    featured: product.featured,
    catalog_visibility: product.catalog_visibility,
    description: product.description,
    short_description: product.short_description,
    sku: product.sku || null,
    price: safeParseFloat(product.price),
    regular_price: safeParseFloat(product.regular_price),
    sale_price: safeParseFloat(product.sale_price),
    on_sale: product.on_sale,
    purchasable: product.purchasable,
    total_sales: product.total_sales || 0,
    virtual: product.virtual,
    downloadable: product.downloadable,
    manage_stock: product.manage_stock,
    stock_quantity: product.stock_quantity,
    stock_status: product.stock_status,
    backorders: product.backorders,
    weight: product.weight || null,
    dimensions: product.dimensions || null,
    shipping_required: product.shipping_required,
    shipping_taxable: product.shipping_taxable,
    shipping_class: product.shipping_class || null,
    shipping_class_id: product.shipping_class_id || null,
    reviews_allowed: product.reviews_allowed,
    average_rating: safeParseFloat(product.average_rating),
    rating_count: product.rating_count || 0,
    parent_id: product.parent_id || null,
    purchase_note: product.purchase_note || null,
    categories: product.categories || [],
    tags: product.tags || [],
    images: product.images || [],
    attributes: product.attributes || [],
    default_attributes: product.default_attributes || [],
    variations: product.variations || [],
    grouped_products: product.grouped_products || [],
    menu_order: product.menu_order || 0,
    meta_data: product.meta_data || [],
    date_created: product.date_created,
    date_modified: product.date_modified || product.date_created,
    date_on_sale_from: product.date_on_sale_from,
    date_on_sale_to: product.date_on_sale_to,
    synced_at: new Date().toISOString(),
  }));

  const { error: productError } = await supabase
    .from('products')
    .upsert(productsToInsert, {
      onConflict: 'site_id,product_id',
      returning: 'minimal',
    });

  if (productError) {
    console.error('Product upsert error:', productError);
    results.failedProducts = (results.failedProducts || 0) + productsToInsert.length;
    results.errors.push(`Database error: ${productError.message}`);
    return;
  }

  results.syncedProducts = (results.syncedProducts || 0) + products.length;
}

// Execute incremental sync for orders
export async function executeIncrementalOrderSync(
  siteId: string,
  mode: string = 'incremental',
  batchSize: number = 50,
  taskId: string | null = null
): Promise<SyncResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const startTime = Date.now();
  const results: SyncResult = {
    totalOrders: 0,
    syncedOrders: 0,
    syncedItems: 0,
    failedOrders: 0,
    errors: [],
  };

  // Get site configuration
  const { data: site, error: siteError } = await supabase
    .from('wc_sites')
    .select('*')
    .eq('id', siteId)
    .single();

  if (siteError || !site) {
    throw new Error('Site not found');
  }

  if (!site.enabled) {
    throw new Error('Site is disabled');
  }

  // Start sync log
  const { data: syncLog } = await supabase
    .from('sync_logs')
    .insert({
      site_id: siteId,
      sync_type: 'orders',
      sync_mode: mode,
      status: 'started',
    })
    .select()
    .single();

  const syncLogId = syncLog?.id;

  try {
    // Get or create sync checkpoint
    const checkpoint = await getOrCreateCheckpoint(supabase, siteId, 'orders');

    // Fetch orders from WooCommerce
    const { orders, hasMore, lastOrder } = await fetchIncrementalOrders(
      site.url,
      site.api_key,
      site.api_secret,
      checkpoint,
      mode
    );

    results.totalOrders = orders.length;
    results.hasMore = hasMore;

    // Process orders in batches
    console.log(`[${site.name}] Processing ${orders.length} orders in batches of ${batchSize}`);

    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);

      try {
        await processOrderBatch(supabase, siteId, batch, results);

        // Update sync progress
        if (syncLogId) {
          await supabase
            .from('sync_logs')
            .update({
              status: 'in_progress',
              items_synced: results.syncedOrders,
              progress_percentage: Math.round((results.syncedOrders! / orders.length) * 100),
            })
            .eq('id', syncLogId);
        }

        // Update task progress if task ID provided
        if (taskId) {
          await supabase
            .from('sync_tasks')
            .update({
              progress: {
                orders: {
                  total: orders.length,
                  synced: results.syncedOrders,
                  status: 'running'
                }
              }
            })
            .eq('id', taskId);
        }

      } catch (batchError: any) {
        console.error('Batch processing error:', batchError);
        results.errors.push(batchError.message);
        results.failedOrders = (results.failedOrders || 0) + batch.length;
      }
    }

    // Update checkpoint if successful
    if (results.syncedOrders! > 0 && lastOrder) {
      await supabase
        .from('sync_checkpoints_v2')
        .upsert({
          site_id: siteId,
          sync_type: 'orders',
          last_order_id: lastOrder.id,
          last_order_modified: lastOrder.date_modified,
          orders_synced_count: (checkpoint?.orders_synced_count || 0) + results.syncedOrders!,
          last_sync_completed_at: new Date().toISOString(),
          last_sync_status: 'success',
          last_sync_duration_ms: Date.now() - startTime,
        }, {
          onConflict: 'site_id,sync_type',
        });
    }

    // Update sync log
    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'completed',
          items_to_sync: results.totalOrders,
          items_synced: results.syncedOrders,
          items_failed: results.failedOrders,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          error_message: results.errors.length > 0 ? results.errors[0] : null,
          error_details: results.errors.length > 0 ? { errors: results.errors } : null,
        })
        .eq('id', syncLogId);
    }

    // Update site last sync time
    await supabase
      .from('wc_sites')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', siteId);

    results.duration = Date.now() - startTime;
    return results;

  } catch (syncError: any) {
    console.error('Sync error:', syncError);

    // Update sync log with error
    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          error_message: syncError.message,
        })
        .eq('id', syncLogId);
    }

    throw syncError;
  }
}

// Execute incremental sync for products
export async function executeIncrementalProductSync(
  siteId: string,
  mode: string = 'incremental',
  batchSize: number = 50,
  taskId: string | null = null
): Promise<SyncResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const startTime = Date.now();
  const results: SyncResult = {
    totalProducts: 0,
    syncedProducts: 0,
    failedProducts: 0,
    errors: [],
  };

  // Get site configuration
  const { data: site, error: siteError } = await supabase
    .from('wc_sites')
    .select('*')
    .eq('id', siteId)
    .single();

  if (siteError || !site) {
    throw new Error('Site not found');
  }

  if (!site.enabled) {
    throw new Error('Site is disabled');
  }

  // Start sync log
  const { data: syncLog } = await supabase
    .from('sync_logs')
    .insert({
      site_id: siteId,
      sync_type: 'products',
      sync_mode: mode,
      status: 'started',
    })
    .select()
    .single();

  const syncLogId = syncLog?.id;

  try {
    // Get or create sync checkpoint
    const checkpoint = await getOrCreateCheckpoint(supabase, siteId, 'products');

    // Fetch products from WooCommerce
    const { products, hasMore, lastProduct } = await fetchIncrementalProducts(
      site.url,
      site.api_key,
      site.api_secret,
      checkpoint,
      mode
    );

    results.totalProducts = products.length;
    results.hasMore = hasMore;

    // Process products in batches
    console.log(`[${site.name}] Processing ${products.length} products in batches of ${batchSize}`);

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      try {
        await processProductBatch(supabase, siteId, batch, results);

        // Update sync progress
        if (syncLogId) {
          await supabase
            .from('sync_logs')
            .update({
              status: 'in_progress',
              items_synced: results.syncedProducts,
              progress_percentage: Math.round((results.syncedProducts! / products.length) * 100),
            })
            .eq('id', syncLogId);
        }

        // Update task progress if task ID provided
        if (taskId) {
          await supabase
            .from('sync_tasks')
            .update({
              progress: {
                products: {
                  total: products.length,
                  synced: results.syncedProducts,
                  status: 'running'
                }
              }
            })
            .eq('id', taskId);
        }

      } catch (batchError: any) {
        console.error('Batch processing error:', batchError);
        results.errors.push(batchError.message);
        results.failedProducts = (results.failedProducts || 0) + batch.length;
      }
    }

    // Update checkpoint if successful
    if (results.syncedProducts! > 0 && lastProduct) {
      await supabase
        .from('sync_checkpoints_v2')
        .upsert({
          site_id: siteId,
          sync_type: 'products',
          last_product_id: lastProduct.id,
          last_product_modified: lastProduct.date_modified,
          products_synced_count: (checkpoint?.products_synced_count || 0) + results.syncedProducts!,
          last_sync_completed_at: new Date().toISOString(),
          last_sync_status: 'success',
          last_sync_duration_ms: Date.now() - startTime,
        }, {
          onConflict: 'site_id,sync_type',
        });
    }

    // Update sync log
    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'completed',
          items_to_sync: results.totalProducts,
          items_synced: results.syncedProducts,
          items_failed: results.failedProducts,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          error_message: results.errors.length > 0 ? results.errors[0] : null,
          error_details: results.errors.length > 0 ? { errors: results.errors } : null,
        })
        .eq('id', syncLogId);
    }

    results.duration = Date.now() - startTime;
    return results;

  } catch (syncError: any) {
    console.error('Sync error:', syncError);

    // Update sync log with error
    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          error_message: syncError.message,
        })
        .eq('id', syncLogId);
    }

    throw syncError;
  }
}