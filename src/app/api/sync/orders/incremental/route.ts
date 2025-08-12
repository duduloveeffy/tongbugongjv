import { type NextRequest, NextResponse } from 'next/server';
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
  meta_data: any[];
  line_items: OrderItem[];
  refunds: any[];
}

// POST: Incremental sync orders from WooCommerce to Supabase
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { 
      siteId, 
      mode = 'incremental',
      batchSize = 50, // Configurable batch size
      taskId = null // Optional task ID for async progress updates
    } = body;

    if (!siteId) {
      return NextResponse.json({ 
        error: 'Site ID is required' 
      }, { status: 400 });
    }

    // Get site configuration
    const { data: site, error: siteError } = await supabase
      .from('wc_sites')
      .select('*')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ 
        error: 'Site not found' 
      }, { status: 404 });
    }

    if (!site.enabled) {
      return NextResponse.json({ 
        error: 'Site is disabled' 
      }, { status: 400 });
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
    const startTime = Date.now();

    try {
      // Get or create sync checkpoint
      let checkpoint = await getOrCreateCheckpoint(supabase, siteId, 'orders');
      
      // Fetch orders from WooCommerce
      const { orders, hasMore, lastOrder } = await fetchIncrementalOrders(
        site.url,
        site.api_key,
        site.api_secret,
        checkpoint,
        mode
      );

      const results = {
        totalOrders: orders.length,
        syncedOrders: 0,
        syncedItems: 0,
        failedOrders: 0,
        errors: [] as string[],
      };

      // Check for duplicates in the fetched orders
      const orderIdSet = new Set<number>();
      const duplicatesInFetch = orders.filter(order => {
        if (orderIdSet.has(order.id)) {
          return true;
        }
        orderIdSet.add(order.id);
        return false;
      });
      
      if (duplicatesInFetch.length > 0) {
        console.warn(`Found ${duplicatesInFetch.length} duplicate orders in fetched data:`, 
          duplicatesInFetch.map(o => o.id));
      }

      // Process orders in batches with configurable size
      console.log(`Processing ${orders.length} unique orders in batches of ${batchSize}`);
      
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
                progress_percentage: Math.round((results.syncedOrders / orders.length) * 100),
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
          
          // Log progress every 10 batches
          if ((i / batchSize) % 10 === 0) {
            console.log(`Progress: ${results.syncedOrders}/${orders.length} orders synced`);
          }
        } catch (batchError: any) {
          console.error('Batch processing error:', batchError);
          results.errors.push(batchError.message);
          results.failedOrders += batch.length;
        }
      }

      // Update checkpoint if successful
      if (results.syncedOrders > 0 && lastOrder) {
        await supabase
          .from('sync_checkpoints_v2')
          .upsert({
            site_id: siteId,
            sync_type: 'orders',
            last_order_id: lastOrder.id,
            last_order_modified: lastOrder.date_modified,
            orders_synced_count: (checkpoint?.orders_synced_count || 0) + results.syncedOrders,
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

      return NextResponse.json({
        success: true,
        siteId,
        siteName: site.name,
        mode,
        results: {
          ...results,
          hasMore,
          duration: Date.now() - startTime,
        },
      });

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

      // Update checkpoint with error
      await supabase
        .from('sync_checkpoints_v2')
        .upsert({
          site_id: siteId,
          sync_type: 'orders',
          last_sync_status: 'failed',
          last_error_message: syncError.message,
        }, {
          onConflict: 'site_id,sync_type',
        });

      throw syncError;
    }

  } catch (error: any) {
    console.error('Orders sync API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
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
  const seenOrderIds = new Set<number>(); // Track seen order IDs to prevent duplicates
  let page = 1;
  const perPage = 100;
  let hasMore = false;
  let lastOrder: WooCommerceOrder | null = null;

  // Build query parameters based on mode and checkpoint
  const buildParams = (pageNum: number) => {
    const params = new URLSearchParams({
      per_page: perPage.toString(),
      page: pageNum.toString(),
      orderby: 'modified',
      order: 'asc',
      status: 'any',
    });

    // For incremental sync, only fetch orders modified after last checkpoint
    if (mode === 'incremental' && checkpoint?.last_order_modified) {
      const lastModified = new Date(checkpoint.last_order_modified);
      // Add 1 second to avoid re-fetching the same order
      lastModified.setSeconds(lastModified.getSeconds() + 1);
      params.append('modified_after', lastModified.toISOString());
    }

    return params;
  };

  // Fetch orders page by page - NO LIMIT for full sync
  const maxPages = mode === 'full' ? 999999 : 50; // No practical limit for full sync
  console.log(`Starting to fetch orders, mode: ${mode}, checkpoint orders: ${checkpoint?.orders_synced_count || 0}`);
  
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

      // Filter out duplicate orders
      const newOrders = orders.filter((order: WooCommerceOrder) => {
        if (seenOrderIds.has(order.id)) {
          console.log(`[Page ${page}] Duplicate order ${order.id} detected - previously seen. Order details:`, {
            id: order.id,
            number: order.number,
            status: order.status,
            date_modified: order.date_modified,
            line_items_count: order.line_items?.length || 0,
            skus: order.line_items?.map(item => item.sku).join(', ')
          });
          return false;
        }
        seenOrderIds.add(order.id);
        return true;
      });
      
      if (newOrders.length > 0) {
        allOrders.push(...newOrders);
      }
      
      // Track the last order for checkpoint update
      if (orders.length > 0) {
        lastOrder = orders[orders.length - 1];
      }

      // Check if there are more pages
      hasMore = orders.length === perPage;
      if (!hasMore) {
        break;
      }

      page++;
      
      // Log progress every 10 pages
      if (page % 10 === 0) {
        console.log(`Fetched ${allOrders.length} orders so far (page ${page})...`);
      }

      // Add a small delay to avoid rate limiting (only for larger pages)
      if (orders.length === perPage) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Reduced from 200ms
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

// Process a batch of orders
async function processOrderBatch(
  supabase: any,
  siteId: string,
  orders: WooCommerceOrder[],
  results: any
) {
  // Remove duplicate orders in the batch (keep the last occurrence)
  const uniqueOrdersMap = new Map<number, WooCommerceOrder>();
  orders.forEach(order => {
    uniqueOrdersMap.set(order.id, order);
  });
  const uniqueOrders = Array.from(uniqueOrdersMap.values());
  
  if (uniqueOrders.length < orders.length) {
    console.log(`Removed ${orders.length - uniqueOrders.length} duplicate orders in batch`);
  }
  
  // Prepare orders for insertion
  const ordersToInsert = uniqueOrders.map(order => ({
    site_id: siteId,
    order_id: order.id,
    order_number: order.number,
    order_key: order.order_key,
    status: order.status,
    currency: order.currency,
    payment_method: order.payment_method,
    payment_method_title: order.payment_method_title,
    transaction_id: order.transaction_id,
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
    shipping_method: null, // Will be populated from shipping lines if available
    date_created: order.date_created,
    date_modified: order.date_modified || order.date_created,
    date_completed: order.date_completed || null,
    date_paid: order.date_paid || null,
    meta_data: order.meta_data || null,
    refunds: order.refunds || null,
    synced_at: new Date().toISOString(),
  }));

  // Upsert orders
  const { data: insertedOrders, error: orderError } = await supabase
    .from('orders')
    .upsert(ordersToInsert, {
      onConflict: 'site_id,order_id',
      returning: 'minimal',
    })
    .select('id,order_id');

  if (orderError) {
    console.error('Order upsert error:', orderError);
    console.error('Failed orders data sample:', ordersToInsert.slice(0, 3));
    
    // 如果是数值溢出错误，记录详细信息并尝试恢复
    if (orderError.message.includes('numeric field overflow') || orderError.message.includes('overflow')) {
      const problematicOrders = ordersToInsert.filter(order => 
        Math.abs(order.total) > 999999.99 ||
        Math.abs(order.subtotal) > 999999.99 ||
        Math.abs(order.total_tax) > 999999.99
      );
      
      console.error('Problematic orders with large values:', problematicOrders.map(o => ({
        order_id: o.order_id,
        total: o.total,
        subtotal: o.subtotal,
        total_tax: o.total_tax
      })));
      
      // 尝试跳过有问题的订单，继续处理其他订单
      const validOrders = ordersToInsert.filter(order => 
        Math.abs(order.total) <= 999999.99 &&
        Math.abs(order.subtotal) <= 999999.99 &&
        Math.abs(order.total_tax) <= 999999.99
      );
      
      if (validOrders.length > 0) {
        console.log(`Retrying with ${validOrders.length} valid orders (skipping ${ordersToInsert.length - validOrders.length} problematic ones)`);
        
        const { data: retryInsertedOrders, error: retryError } = await supabase
          .from('orders')
          .upsert(validOrders, {
            onConflict: 'site_id,order_id',
            returning: 'minimal',
          })
          .select('id,order_id');
          
        if (!retryError && retryInsertedOrders) {
          // 更新结果，但记录跳过的订单
          results.syncedOrders += validOrders.length;
          results.failedOrders += (ordersToInsert.length - validOrders.length);
          results.errors.push(`Skipped ${ordersToInsert.length - validOrders.length} orders with overflow values`);
          
          // 继续处理订单项
          const orderIdMap = new Map();
          retryInsertedOrders.forEach((order: any) => {
            orderIdMap.set(order.order_id, order.id);
          });
          
          // 使用重试成功的订单继续处理订单项
          await processOrderItems(supabase, uniqueOrders.filter(o => validOrders.some(v => v.order_id === o.id)), orderIdMap, results);
          return; // 成功处理部分订单，返回
        } else if (retryError) {
          console.error('Retry also failed:', retryError);
          results.failedOrders += ordersToInsert.length;
          results.errors.push(`Database error: ${retryError.message}`);
          return; // 记录错误但不抛出异常
        }
      } else {
        // 所有订单都有问题
        console.error('All orders have overflow values, skipping entire batch');
        results.failedOrders += ordersToInsert.length;
        results.errors.push('All orders in batch have overflow values');
        return; // 跳过整个批次但继续处理
      }
    } else {
      // 其他类型的数据库错误
      console.error('Non-overflow database error:', orderError.message);
      results.failedOrders += ordersToInsert.length;
      results.errors.push(`Database error: ${orderError.message}`);
      return; // 记录错误但继续处理
    }
  }

  results.syncedOrders += uniqueOrders.length;

  // Create a map of order_id to internal id for order items
  const orderIdMap = new Map();
  if (insertedOrders) {
    insertedOrders.forEach((order: any) => {
      orderIdMap.set(order.order_id, order.id);
    });
  }
  
  // Process order items
  await processOrderItems(supabase, uniqueOrders, orderIdMap, results);
  return results;
}

// 提取订单项处理逻辑为单独函数
async function processOrderItems(supabase: any, orders: any[], orderIdMap: Map<any, any>, results: any) {

  // Prepare order items for insertion
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

  // Insert order items if any
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
      results.syncedItems += allOrderItems.length;
    }
  }
}