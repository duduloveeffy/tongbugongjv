import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { cacheSalesData, getCachedSalesData, generateCacheKey, CACHE_TTL } from '@/lib/redis-cache';
import crypto from 'crypto';

interface SalesQueryResult {
  sku: string;
  siteName: string;
  siteId: string;
  orderCount: number;
  salesQuantity: number;
  orderCount30d: number;
  salesQuantity30d: number;
  totalRevenue: number;
  lastOrderDate: string | null;
  productName: string | null;
  stockQuantity: number | null;
  stockStatus: string | null;
  price: number | null;
}

interface AggregatedSalesData {
  sku: string;
  productName: string | null;
  totalOrderCount: number;
  totalSalesQuantity: number;
  totalOrderCount30d: number;
  totalSalesQuantity30d: number;
  totalRevenue: number;
  lastOrderDate: string | null;
  sites: {
    [siteName: string]: {
      siteId: string;
      orderCount: number;
      salesQuantity: number;
      orderCount30d: number;
      salesQuantity30d: number;
      revenue: number;
      lastOrderDate: string | null;
      stockQuantity: number | null;
      stockStatus: string | null;
      price: number | null;
    };
  };
}

// POST: Query sales data from local database
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error('Failed to parse request body:', error);
      return NextResponse.json({ 
        error: 'Invalid request body - expecting JSON' 
      }, { status: 400 });
    }
    
    const { 
      skus, 
      siteIds, 
      daysBack = 30,
      includeStock = true,
      aggregateResults = true 
    } = body;

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ 
        error: 'SKUs array is required' 
      }, { status: 400 });
    }

    // Validate site IDs if provided
    let validSiteIds = siteIds;
    if (!siteIds || siteIds.length === 0) {
      // If no sites specified, get all enabled sites
      const { data: sites } = await supabase
        .from('wc_sites')
        .select('id')
        .eq('enabled', true);
      
      validSiteIds = sites?.map(s => s.id) || [];
    }

    if (validSiteIds.length === 0) {
      return NextResponse.json({ 
        error: 'No enabled sites found' 
      }, { status: 400 });
    }

    // 生成缓存键
    const skuHash = crypto.createHash('md5').update(skus.sort().join(',')).digest('hex').slice(0, 16);
    const siteHash = crypto.createHash('md5').update(validSiteIds.sort().join(',')).digest('hex').slice(0, 16);
    const cacheKey = `${skuHash}:${siteHash}:${daysBack}`;
    
    // 尝试从缓存获取
    const cached = await getCachedSalesData(skuHash, `${siteHash}:${daysBack}`);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached.data,
        meta: {
          ...cached.meta,
          fromCache: true,
          cacheKey,
        },
      });
    }

    const startTime = Date.now();
    const results: SalesQueryResult[] = [];
    const errors: string[] = [];

    // Process SKUs in batches for better performance
    const batchSize = 50;
    for (let i = 0; i < skus.length; i += batchSize) {
      const skuBatch = skus.slice(i, i + batchSize);
      
      try {
        // Query sales data using the database function
        const { data: salesData, error: salesError } = await supabase
          .rpc('get_batch_sales_stats', {
            p_skus: skuBatch,
            p_site_ids: validSiteIds,
            p_days_back: daysBack,
          });

        if (salesError) {
          console.error('Sales query error:', salesError);
          errors.push(`Batch ${i / batchSize + 1}: ${salesError.message}`);
          continue;
        }

        // If stock information is requested, fetch it
        let stockData: any[] = [];
        if (includeStock) {
          const { data: stock, error: stockError } = await supabase
            .rpc('get_product_stock_status', {
              p_skus: skuBatch,
              p_site_ids: validSiteIds,
            });

          if (stockError) {
            console.error('Stock query error:', stockError);
            errors.push(`Stock batch ${i / batchSize + 1}: ${stockError.message}`);
          } else {
            stockData = stock || [];
          }
        }

        // Combine sales and stock data
        if (salesData && salesData.length > 0) {
          for (const sale of salesData) {
            // Find matching stock data
            const stock = stockData.find(
              s => s.sku === sale.sku && s.site_id === sale.site_id
            );

            results.push({
              sku: sale.sku,
              siteName: sale.site_name,
              siteId: sale.site_id,
              orderCount: Number(sale.order_count) || 0,
              salesQuantity: Number(sale.sales_quantity) || 0,
              orderCount30d: Number(sale.order_count_30d) || 0,
              salesQuantity30d: Number(sale.sales_quantity_30d) || 0,
              totalRevenue: Number(sale.total_revenue) || 0,
              lastOrderDate: sale.last_order_date,
              productName: stock?.product_name || null,
              stockQuantity: stock?.stock_quantity ?? null,
              stockStatus: stock?.stock_status || null,
              price: stock?.price ?? null,
            });
          }
        }

        // Add SKUs with no sales but have stock data
        if (includeStock && stockData.length > 0) {
          for (const stock of stockData) {
            const hasSales = results.some(
              r => r.sku === stock.sku && r.siteId === stock.site_id
            );

            if (!hasSales) {
              results.push({
                sku: stock.sku,
                siteName: stock.site_name,
                siteId: stock.site_id,
                orderCount: 0,
                salesQuantity: 0,
                orderCount30d: 0,
                salesQuantity30d: 0,
                totalRevenue: 0,
                lastOrderDate: null,
                productName: stock.product_name,
                stockQuantity: stock.stock_quantity ?? null,
                stockStatus: stock.stock_status || null,
                price: stock.price ?? null,
              });
            }
          }
        }

      } catch (batchError: any) {
        console.error('Batch processing error:', batchError);
        errors.push(`Batch ${i / batchSize + 1}: ${batchError.message}`);
      }
    }

    // Aggregate results if requested
    let responseData: any = results;
    
    if (aggregateResults && results.length > 0) {
      responseData = aggregateSalesData(results);
    }

    // Check sync freshness for the queried sites
    const { data: checkpoints } = await supabase
      .from('sync_checkpoints_v2')
      .select('site_id, last_sync_completed_at, last_sync_status')
      .in('site_id', validSiteIds)
      .eq('sync_type', 'orders');

    const syncStatus = checkpoints?.reduce((acc: any, cp) => {
      acc[cp.site_id] = {
        lastSync: cp.last_sync_completed_at,
        status: cp.last_sync_status,
        isFresh: isSyncFresh(cp.last_sync_completed_at),
      };
      return acc;
    }, {});

    const response = {
      data: responseData,
      meta: {
        totalSkus: skus.length,
        totalSites: validSiteIds.length,
        resultsCount: results.length,
        queryDuration: Date.now() - startTime,
        daysBack,
        syncStatus,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
    
    // 异步缓存结果（不阻塞响应）
    if (results.length > 0 && errors.length === 0) {
      cacheSalesData(skuHash, `${siteHash}:${daysBack}`, response, CACHE_TTL.SALES).catch(err => {
        console.error('Failed to cache sales data:', err);
      });
    }
    
    return NextResponse.json({
      success: true,
      ...response,
    });

  } catch (error: any) {
    console.error('Sales query API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// GET: Get sync status for all sites
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    // Get all sites with their sync status
    const { data: sites, error: sitesError } = await supabase
      .from('wc_sites')
      .select(`
        id,
        name,
        url,
        enabled,
        last_sync_at
      `)
      .order('name');

    if (sitesError) {
      throw sitesError;
    }

    // Get sync checkpoints for all sites
    const { data: checkpoints, error: checkpointsError } = await supabase
      .from('sync_checkpoints_v2')
      .select('*')
      .eq('sync_type', 'orders');

    if (checkpointsError) {
      throw checkpointsError;
    }

    // Get recent sync logs
    const { data: recentLogs, error: logsError } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('sync_type', 'orders')
      .order('started_at', { ascending: false })
      .limit(50);

    if (logsError) {
      throw logsError;
    }

    // Combine data
    const siteStatus = sites?.map(site => {
      const checkpoint = checkpoints?.find(cp => cp.site_id === site.id);
      const logs = recentLogs?.filter(log => log.site_id === site.id) || [];
      
      return {
        ...site,
        syncStatus: {
          lastOrderId: checkpoint?.last_order_id,
          lastOrderModified: checkpoint?.last_order_modified,
          orderssynced: checkpoint?.orders_synced_count || 0,
          lastSyncCompleted: checkpoint?.last_sync_completed_at,
          lastSyncStatus: checkpoint?.last_sync_status,
          lastError: checkpoint?.last_error_message,
          isFresh: isSyncFresh(checkpoint?.last_sync_completed_at),
        },
        recentLogs: logs.slice(0, 5).map(log => ({
          startedAt: log.started_at,
          completedAt: log.completed_at,
          status: log.status,
          itemsSynced: log.items_synced,
          duration: log.duration_ms,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      sites: siteStatus,
      totalSites: sites?.length || 0,
      enabledSites: sites?.filter(s => s.enabled).length || 0,
    });

  } catch (error: any) {
    console.error('Sync status API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// Helper function to aggregate sales data by SKU
function aggregateSalesData(results: SalesQueryResult[]): AggregatedSalesData[] {
  const aggregated = new Map<string, AggregatedSalesData>();

  for (const result of results) {
    let skuData = aggregated.get(result.sku);
    
    if (!skuData) {
      skuData = {
        sku: result.sku,
        productName: result.productName,
        totalOrderCount: 0,
        totalSalesQuantity: 0,
        totalOrderCount30d: 0,
        totalSalesQuantity30d: 0,
        totalRevenue: 0,
        lastOrderDate: null,
        sites: {},
      };
      aggregated.set(result.sku, skuData);
    }

    // Update totals
    skuData.totalOrderCount += result.orderCount;
    skuData.totalSalesQuantity += result.salesQuantity;
    skuData.totalOrderCount30d += result.orderCount30d;
    skuData.totalSalesQuantity30d += result.salesQuantity30d;
    skuData.totalRevenue += result.totalRevenue;

    // Update last order date
    if (result.lastOrderDate) {
      if (!skuData.lastOrderDate || 
          new Date(result.lastOrderDate) > new Date(skuData.lastOrderDate)) {
        skuData.lastOrderDate = result.lastOrderDate;
      }
    }

    // Update product name if not set
    if (!skuData.productName && result.productName) {
      skuData.productName = result.productName;
    }

    // Add site-specific data
    skuData.sites[result.siteName] = {
      siteId: result.siteId,
      orderCount: result.orderCount,
      salesQuantity: result.salesQuantity,
      orderCount30d: result.orderCount30d,
      salesQuantity30d: result.salesQuantity30d,
      revenue: result.totalRevenue,
      lastOrderDate: result.lastOrderDate,
      stockQuantity: result.stockQuantity,
      stockStatus: result.stockStatus,
      price: result.price,
    };
  }

  return Array.from(aggregated.values());
}

// Helper function to check if sync is fresh (within 6 hours)
function isSyncFresh(lastSync: string | null | undefined, hoursThreshold = 6): boolean {
  if (!lastSync) return false;
  
  const syncTime = new Date(lastSync).getTime();
  const now = Date.now();
  const hoursDiff = (now - syncTime) / (1000 * 60 * 60);
  
  return hoursDiff <= hoursThreshold;
}