import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, isCacheFresh, getCacheExpiryTime, type MultiSiteSalesData } from '@/lib/supabase';

// POST: Get multi-site sales data from cache (with automatic sync trigger)
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    // If Supabase not configured, fall back to single-site mode
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Multi-site feature not available',
        fallbackMode: true 
      }, { status: 503 });
    }

    const body = await request.json();
    const { skus, siteIds, forceRefresh = false } = body;

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ 
        error: 'No SKUs provided' 
      }, { status: 400 });
    }

    // Get enabled sites
    let sitesQuery = supabase
      .from('wc_sites')
      .select('*')
      .eq('enabled', true);

    if (siteIds && siteIds.length > 0) {
      sitesQuery = sitesQuery.in('id', siteIds);
    }

    const { data: sites, error: sitesError } = await sitesQuery;

    if (sitesError || !sites || sites.length === 0) {
      return NextResponse.json({ 
        error: 'No active sites found',
        details: sitesError?.message 
      }, { status: 404 });
    }

    // Fetch cached sales data for all SKUs and sites
    const { data: cachedData, error: cacheError } = await supabase
      .from('sales_cache')
      .select('*')
      .in('sku', skus)
      .in('site_id', sites.map(s => s.id));

    if (cacheError) {
      console.error('Failed to fetch cache:', cacheError);
      return NextResponse.json({ 
        error: 'Failed to fetch cached data',
        details: cacheError.message 
      }, { status: 500 });
    }

    // Process cached data into response format
    const salesDataMap = new Map<string, MultiSiteSalesData>();
    const staleSkus = new Set<string>();
    const missingSKUs = new Set<string>(skus);

    // Initialize data structure for all SKUs
    skus.forEach(sku => {
      salesDataMap.set(sku, {
        sku,
        total: {
          orderCount: 0,
          salesQuantity: 0,
          orderCount30d: 0,
          salesQuantity30d: 0,
        },
        sites: {},
      });
    });

    // Process cached data
    if (cachedData && cachedData.length > 0) {
      cachedData.forEach(cache => {
        const site = sites.find(s => s.id === cache.site_id);
        if (!site) return;

        missingSKUs.delete(cache.sku);
        const salesData = salesDataMap.get(cache.sku);
        if (!salesData) return;

        const isFresh = !forceRefresh && isCacheFresh(cache.last_updated);
        
        if (!isFresh) {
          staleSkus.add(cache.sku);
        }

        // Add to site-specific data
        salesData.sites[site.name] = {
          siteId: site.id,
          orderCount: cache.order_count,
          salesQuantity: cache.sales_quantity,
          orderCount30d: cache.order_count_30d,
          salesQuantity30d: cache.sales_quantity_30d,
          lastUpdated: cache.last_updated,
          isFresh,
        };

        // Add to totals
        salesData.total.orderCount += cache.order_count;
        salesData.total.salesQuantity += cache.sales_quantity;
        salesData.total.orderCount30d += cache.order_count_30d;
        salesData.total.salesQuantity30d += cache.sales_quantity_30d;
      });
    }

    // Determine which SKUs need syncing
    const skusToSync = new Set([...missingSKUs, ...(forceRefresh ? skus : staleSkus)]);
    
    // Trigger background sync for stale or missing data
    let syncTriggered = false;
    if (skusToSync.size > 0) {
      // Create sync tasks for each site
      const syncTasks = sites.map(site => ({
        site_id: site.id,
        task_type: 'sku_batch' as const,
        sku_list: Array.from(skusToSync),
        priority: 2,
        status: 'pending' as const,
        retry_count: 0,
        error_message: null,
        started_at: null,
        completed_at: null,
      }));

      const { error: syncError } = await supabase
        .from('sync_tasks')
        .insert(syncTasks);

      if (syncError) {
        console.error('Failed to create sync tasks:', syncError);
      } else {
        syncTriggered = true;
        
        // If we have no data at all for some SKUs, trigger immediate sync
        if (missingSKUs.size > 0 && !forceRefresh) {
          // Trigger sync worker (in production, this would be a separate service)
          triggerSyncWorker(Array.from(missingSKUs), sites);
        }
      }
    }

    // Convert map to response object
    const responseData: Record<string, MultiSiteSalesData> = {};
    salesDataMap.forEach((data, sku) => {
      responseData[sku] = data;
    });

    return NextResponse.json({
      success: true,
      data: responseData,
      syncTriggered,
      staleSkus: Array.from(staleSkus),
      missingSkus: Array.from(missingSKUs),
      sites: sites.map(s => ({ id: s.id, name: s.name })),
    });

  } catch (error: any) {
    console.error('Multi-site sales API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// Trigger sync worker (placeholder - in production this would be a queue/worker system)
async function triggerSyncWorker(skus: string[], sites: any[]) {
  // This is a simplified version - in production, use a proper queue system
  // For now, we'll just mark it for processing
  console.log(`Sync triggered for ${skus.length} SKUs across ${sites.length} sites`);
  
  // In a real implementation, this would:
  // 1. Send message to a queue (e.g., AWS SQS, Redis Queue)
  // 2. Have a worker process that picks up the message
  // 3. Worker fetches from WooCommerce and updates Supabase
  
  // For now, we'll call the sync endpoint directly (async, non-blocking)
  sites.forEach(site => {
    fetch('/api/sales/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: site.id,
        skus: skus.slice(0, 10), // Limit to prevent timeout
      }),
    }).catch(err => console.error('Sync trigger failed:', err));
  });
}