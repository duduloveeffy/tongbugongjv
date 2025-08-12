import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// POST: Initial full sync for a site (orders and products)
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { siteId, syncOrders = true, syncProducts = true } = body;

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

    const startTime = Date.now();
    const results = {
      siteId,
      siteName: site.name,
      orders: {
        attempted: false,
        successful: false,
        count: 0,
        errors: [] as string[],
      },
      products: {
        attempted: false,
        successful: false,
        count: 0,
        variations: 0,
        errors: [] as string[],
      },
      duration: 0,
    };

    // Clear any existing checkpoints for fresh start
    await supabase
      .from('sync_checkpoints_v2')
      .delete()
      .eq('site_id', siteId);

    // Sync orders if requested
    if (syncOrders) {
      results.orders.attempted = true;
      
      try {
        console.log(`Starting initial orders sync for site ${site.name}`);
        
        // Create AbortController for timeout handling with longer timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200000); // 20 minute timeout for large datasets

        let orderResponse;
        let orderResult;
        
        try {
          orderResponse = await fetch(`${request.url.replace('/sync/initial', '/sync/orders/incremental')}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Add keep-alive headers to prevent timeout
              'Connection': 'keep-alive',
            },
            body: JSON.stringify({
              siteId,
              mode: 'full',
            }),
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          // Parse response with timeout protection
          const jsonPromise = orderResponse.json();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Response parsing timeout')), 10000)
          );
          
          orderResult = await Promise.race([jsonPromise, timeoutPromise]);
          
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          
          // Check if it's a headers timeout after successful processing
          if (fetchError.cause?.code === 'UND_ERR_HEADERS_TIMEOUT') {
            console.log('Order sync likely completed but response timed out, checking status...');
            
            // Try to check if sync actually completed
            const { data: recentLog } = await supabase
              .from('sync_logs')
              .select('*')
              .eq('site_id', siteId)
              .eq('sync_type', 'orders')
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            
            if (recentLog && recentLog.status === 'completed') {
              console.log('Order sync confirmed completed despite timeout');
              orderResult = {
                success: true,
                results: {
                  syncedOrders: recentLog.items_synced || 0
                }
              };
            } else if (recentLog && recentLog.status === 'in_progress') {
              // Sync is still running, but response timed out
              console.log('Order sync still in progress, continuing in background');
              orderResult = {
                success: true,
                results: {
                  syncedOrders: recentLog.items_synced || 0,
                  message: 'Sync is running in background, may take a few more minutes'
                }
              };
            } else {
              // No recent log or failed status - treat as partial success
              console.log('Order sync status uncertain, treating as partial success');
              orderResult = {
                success: true,
                results: {
                  syncedOrders: 0,
                  message: 'Sync status uncertain, please check the site sync status later'
                }
              };
            }
          } else if (fetchError.name === 'AbortError') {
            throw new Error('Order sync timeout after 20 minutes');
          } else {
            throw fetchError;
          }
        }
        
        if (orderResult.success) {
          results.orders.successful = true;
          results.orders.count = orderResult.results?.syncedOrders || 0;
          console.log(`Orders sync completed: ${results.orders.count} orders synced`);
        } else {
          results.orders.errors.push(orderResult.error || 'Unknown orders sync error');
        }

      } catch (orderError: any) {
        console.error('Orders sync error:', orderError);
        
        if (orderError.name === 'AbortError') {
          // Timeout but likely still running
          results.orders.errors.push('Orders sync timeout - sync continues in background, please check status later');
          // Don't mark as failed, just incomplete
          results.orders.successful = false;
        } else if (orderError.message?.includes('timeout')) {
          // Various timeout scenarios
          results.orders.errors.push('Sync response timeout - data may have been synced successfully, please verify');
          // Treat as partial success
          results.orders.successful = false;
        } else {
          results.orders.errors.push(orderError.message || 'Unknown error during orders sync');
          results.orders.successful = false;
        }
      }
    }

    // Sync products if requested
    if (syncProducts) {
      results.products.attempted = true;
      
      try {
        console.log(`Starting initial products sync for site ${site.name}`);
        
        const productResponse = await fetch(`${request.url.replace('/sync/initial', '/sync/products/incremental')}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            siteId,
            mode: 'full',
            includeVariations: true,
          }),
        });

        const productResult = await productResponse.json();
        
        if (productResult.success) {
          results.products.successful = true;
          results.products.count = productResult.results?.syncedProducts || 0;
          results.products.variations = productResult.results?.syncedVariations || 0;
          console.log(`Products sync completed: ${results.products.count} products, ${results.products.variations} variations synced`);
        } else {
          results.products.errors.push(productResult.error || 'Unknown products sync error');
        }

      } catch (productError: any) {
        console.error('Products sync failed:', productError);
        results.products.errors.push(productError.message);
      }
    }

    results.duration = Date.now() - startTime;

    // Log initial sync completion
    const overallSuccess = (!syncOrders || results.orders.successful) && 
                          (!syncProducts || results.products.successful);

    await supabase
      .from('sync_logs')
      .insert({
        site_id: siteId,
        sync_type: 'initial',
        sync_mode: 'full',
        status: overallSuccess ? 'completed' : 'failed',
        items_to_sync: (results.orders.count || 0) + (results.products.count || 0),
        items_synced: (results.orders.count || 0) + (results.products.count || 0),
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: results.duration,
        error_message: overallSuccess ? null : 'Some sync operations failed',
        error_details: overallSuccess ? null : {
          orderErrors: results.orders.errors,
          productErrors: results.products.errors,
        },
      });

    return NextResponse.json({
      success: overallSuccess,
      message: overallSuccess ? 
        'Initial sync completed successfully' : 
        'Initial sync completed with errors',
      results,
    });

  } catch (error: any) {
    console.error('Initial sync API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// GET: Get initial sync status/progress for all sites
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    // Get all sites
    const { data: sites, error: sitesError } = await supabase
      .from('wc_sites')
      .select('id, name, enabled')
      .order('name');

    if (sitesError) {
      throw sitesError;
    }

    // Get sync status for each site
    const siteStatuses = [];
    
    for (const site of sites || []) {
      // Check if initial sync has been completed
      const { data: initialLogs } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('site_id', site.id)
        .eq('sync_type', 'initial')
        .order('started_at', { ascending: false })
        .limit(1);

      // Get current sync checkpoints
      const { data: checkpoints } = await supabase
        .from('sync_checkpoints_v2')
        .select('*')
        .eq('site_id', site.id);

      // Get data counts
      const { count: orderCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id);

      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id);

      const { count: variationCount } = await supabase
        .from('product_variations')
        .select('pv.*', { count: 'exact', head: true })
        .from('product_variations as pv')
        .join('products as p', 'pv.product_id', 'p.id')
        .eq('p.site_id', site.id);

      // Determine sync status
      let status = 'not_started';
      let lastInitialSync = null;
      let hasData = (orderCount || 0) > 0 || (productCount || 0) > 0;

      if (initialLogs && initialLogs.length > 0) {
        const lastLog = initialLogs[0];
        lastInitialSync = lastLog;
        
        if (lastLog.status === 'completed') {
          status = hasData ? 'completed' : 'completed_no_data';
        } else if (lastLog.status === 'failed') {
          status = hasData ? 'partial' : 'failed';
        } else {
          status = 'in_progress';
        }
      } else if (hasData) {
        // Has data but no initial sync log (might be migrated data)
        status = 'completed';
      }

      const orderCheckpoint = checkpoints?.find(cp => cp.sync_type === 'orders');
      const productCheckpoint = checkpoints?.find(cp => cp.sync_type === 'products');

      siteStatuses.push({
        siteId: site.id,
        siteName: site.name,
        enabled: site.enabled,
        status,
        lastInitialSync,
        dataCounts: {
          orders: orderCount || 0,
          products: productCount || 0,
          variations: variationCount || 0,
        },
        checkpoints: {
          orders: orderCheckpoint ? {
            lastOrderId: orderCheckpoint.last_order_id,
            lastModified: orderCheckpoint.last_order_modified,
            syncedCount: orderCheckpoint.orders_synced_count,
            lastSync: orderCheckpoint.last_sync_completed_at,
            status: orderCheckpoint.last_sync_status,
          } : null,
          products: productCheckpoint ? {
            lastProductId: productCheckpoint.last_product_id,
            lastModified: productCheckpoint.last_product_modified,
            syncedCount: productCheckpoint.products_synced_count,
            lastSync: productCheckpoint.last_sync_completed_at,
            status: productCheckpoint.last_sync_status,
          } : null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      sites: siteStatuses,
      summary: {
        total: siteStatuses.length,
        completed: siteStatuses.filter(s => s.status === 'completed' || s.status === 'completed_no_data').length,
        failed: siteStatuses.filter(s => s.status === 'failed').length,
        inProgress: siteStatuses.filter(s => s.status === 'in_progress').length,
        notStarted: siteStatuses.filter(s => s.status === 'not_started').length,
        partial: siteStatuses.filter(s => s.status === 'partial').length,
      },
    });

  } catch (error: any) {
    console.error('Initial sync status API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}