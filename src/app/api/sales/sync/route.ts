import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getCacheExpiryTime } from '@/lib/supabase';

interface SalesData {
  orderCount: number;
  salesQuantity: number;
  orderCount30d: number;
  salesQuantity30d: number;
}

// POST: Sync sales data from WooCommerce to Supabase cache
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { siteId, skus, taskId } = body;

    if (!siteId || !skus || !Array.isArray(skus)) {
      return NextResponse.json({ 
        error: 'Invalid parameters' 
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

    // Update task status if taskId provided
    if (taskId) {
      await supabase
        .from('sync_tasks')
        .update({ 
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', taskId);
    }

    const startTime = Date.now();
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    try {
      // Fetch sales data from WooCommerce
      const salesData = await fetchWooCommerceSales(
        site.url,
        site.api_key,
        site.api_secret,
        skus
      );

      // Prepare batch upsert data
      const upsertData = skus.map(sku => {
        const data = salesData[sku] || {
          orderCount: 0,
          salesQuantity: 0,
          orderCount30d: 0,
          salesQuantity30d: 0,
        };

        return {
          sku,
          site_id: siteId,
          order_count: data.orderCount,
          sales_quantity: data.salesQuantity,
          order_count_30d: data.orderCount30d,
          sales_quantity_30d: data.salesQuantity30d,
          cache_expires_at: getCacheExpiryTime(6), // 6 hours cache
          last_updated: new Date().toISOString(),
        };
      });

      // Batch upsert to Supabase
      const { error: upsertError } = await supabase
        .from('sales_cache')
        .upsert(upsertData, {
          onConflict: 'sku,site_id',
        });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        results.errors.push(upsertError.message);
        results.failed = skus.length;
      } else {
        results.successful = skus.length;
      }

      // Update site last sync time
      await supabase
        .from('wc_sites')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', siteId);

      // Update sync metrics
      const duration = Date.now() - startTime;
      await updateSyncMetrics(supabase, siteId, results.successful, results.failed, duration);

      // Update task status if taskId provided
      if (taskId) {
        await supabase
          .from('sync_tasks')
          .update({ 
            status: results.failed > 0 ? 'failed' : 'completed',
            completed_at: new Date().toISOString(),
            error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
          })
          .eq('id', taskId);
      }

    } catch (syncError: any) {
      console.error('Sync error:', syncError);
      results.errors.push(syncError.message);
      results.failed = skus.length;

      if (taskId) {
        await supabase
          .from('sync_tasks')
          .update({ 
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: syncError.message,
          })
          .eq('id', taskId);
      }
    }

    return NextResponse.json({
      success: results.successful > 0,
      siteId,
      siteName: site.name,
      results,
      duration: Date.now() - startTime,
    });

  } catch (error: any) {
    console.error('Sync API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// Fetch sales data from WooCommerce
async function fetchWooCommerceSales(
  siteUrl: string,
  apiKey: string,
  apiSecret: string,
  skus: string[]
): Promise<Record<string, SalesData>> {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = siteUrl.replace(/\/$/, '');
  
  // Calculate date ranges
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Fetch all orders for the period
  const params = new URLSearchParams({
    status: 'completed,processing',
    per_page: '100',
    orderby: 'date',
    order: 'desc',
    after: thirtyDaysAgo.toISOString(),
    _fields: 'id,date_created,line_items',
  });

  const allOrders: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 10) { // Limit to 10 pages for safety
    params.set('page', page.toString());
    
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
        throw new Error(`WooCommerce API error: ${response.status}`);
      }

      const orders = await response.json();
      allOrders.push(...orders);
      
      hasMore = orders.length === 100;
      page++;
      
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  }

  // Process orders to calculate sales data
  return calculateSalesDataFromOrders(allOrders, skus);
}

// Calculate sales data from orders
function calculateSalesDataFromOrders(
  orders: any[],
  targetSkus: string[]
): Record<string, SalesData> {
  const salesDataMap: Record<string, SalesData> = {};
  const skuSet = new Set(targetSkus);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Initialize all SKUs
  targetSkus.forEach(sku => {
    salesDataMap[sku] = {
      orderCount: 0,
      salesQuantity: 0,
      orderCount30d: 0,
      salesQuantity30d: 0,
    };
  });

  // Process orders
  orders.forEach(order => {
    const orderDate = new Date(order.date_created);
    const isWithin30Days = orderDate >= thirtyDaysAgo;
    const processedSkusInOrder = new Set<string>();

    if (order.line_items && Array.isArray(order.line_items)) {
      order.line_items.forEach((item: any) => {
        const sku = item.sku;
        
        if (sku && skuSet.has(sku) && salesDataMap[sku]) {
          const quantity = Number(item.quantity) || 0;
          const skuData = salesDataMap[sku];
          
          // Update total counts
          skuData.salesQuantity += quantity;
          
          if (!processedSkusInOrder.has(sku)) {
            skuData.orderCount += 1;
            processedSkusInOrder.add(sku);
          }
          
          // Update 30-day counts
          if (isWithin30Days) {
            skuData.salesQuantity30d += quantity;
            
            if (!processedSkusInOrder.has(`${sku}_30d`)) {
              skuData.orderCount30d += 1;
              processedSkusInOrder.add(`${sku}_30d`);
            }
          }
        }
      });
    }
  });

  return salesDataMap;
}

// Update sync metrics
async function updateSyncMetrics(
  supabase: any,
  siteId: string,
  successful: number,
  failed: number,
  duration: number
) {
  const today = new Date().toISOString().split('T')[0];
  
  // Try to update existing record for today
  const { data: existing } = await supabase
    .from('sync_metrics')
    .select('*')
    .eq('site_id', siteId)
    .eq('date', today)
    .single();

  if (existing) {
    // Update existing metrics
    await supabase
      .from('sync_metrics')
      .update({
        total_syncs: existing.total_syncs + 1,
        successful_syncs: existing.successful_syncs + (failed === 0 ? 1 : 0),
        failed_syncs: existing.failed_syncs + (failed > 0 ? 1 : 0),
        avg_duration_ms: Math.round(
          (existing.avg_duration_ms * existing.total_syncs + duration) / 
          (existing.total_syncs + 1)
        ),
        total_skus_synced: existing.total_skus_synced + successful,
      })
      .eq('site_id', siteId)
      .eq('date', today);
  } else {
    // Create new metrics record
    await supabase
      .from('sync_metrics')
      .insert({
        site_id: siteId,
        date: today,
        total_syncs: 1,
        successful_syncs: failed === 0 ? 1 : 0,
        failed_syncs: failed > 0 ? 1 : 0,
        avg_duration_ms: Math.round(duration),
        total_skus_synced: successful,
      });
  }
}