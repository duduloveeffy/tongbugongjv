import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// POST: Run scheduled sync for all enabled sites
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    // Get authorization header for security
    const authHeader = request.headers.get('authorization');
    const expectedAuth = process.env.SYNC_CRON_SECRET || 'your-secret-key';
    
    if (authHeader !== `Bearer ${expectedAuth}`) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    const startTime = Date.now();
    console.log('Starting scheduled sync job...');

    // Get all enabled sites
    const { data: sites, error: sitesError } = await supabase
      .from('wc_sites')
      .select('*')
      .eq('enabled', true);

    if (sitesError) {
      throw sitesError;
    }

    if (!sites || sites.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No enabled sites to sync',
        results: { sites: [], totalSites: 0 },
      });
    }

    console.log(`Found ${sites.length} enabled sites to sync`);

    const results = {
      sites: [] as any[],
      totalSites: sites.length,
      successfulSites: 0,
      failedSites: 0,
      errors: [] as string[],
    };

    // Process sites sequentially to avoid overwhelming the system
    for (const site of sites) {
      const siteResult = {
        siteId: site.id,
        siteName: site.name,
        orders: { attempted: false, successful: false, count: 0, error: null },
        products: { attempted: false, successful: false, count: 0, error: null },
        duration: 0,
      };

      const siteStartTime = Date.now();
      console.log(`Starting sync for site: ${site.name}`);

      try {
        // Determine if this site needs initial sync or incremental sync
        const { data: checkpoints } = await supabase
          .from('sync_checkpoints_v2')
          .select('*')
          .eq('site_id', site.id);

        const hasOrderCheckpoint = checkpoints?.some(cp => cp.sync_type === 'orders' && cp.last_order_id);
        const hasProductCheckpoint = checkpoints?.some(cp => cp.sync_type === 'products' && cp.last_product_id);

        const syncMode = (hasOrderCheckpoint || hasProductCheckpoint) ? 'incremental' : 'full';
        console.log(`Using ${syncMode} sync for ${site.name}`);

        // Sync orders
        try {
          siteResult.orders.attempted = true;
          
          const orderResponse = await fetch(`${request.url.replace('/sync/scheduled', '/sync/orders/incremental')}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              siteId: site.id,
              mode: syncMode,
            }),
          });

          if (orderResponse.ok) {
            const orderData = await orderResponse.json();
            if (orderData.success) {
              siteResult.orders.successful = true;
              siteResult.orders.count = orderData.results?.syncedOrders || 0;
              console.log(`Orders sync completed for ${site.name}: ${siteResult.orders.count} orders`);
            } else {
              siteResult.orders.error = orderData.error || 'Unknown orders sync error';
            }
          } else {
            siteResult.orders.error = `HTTP ${orderResponse.status}`;
          }
        } catch (orderError: any) {
          siteResult.orders.error = orderError.message;
        }

        // Sync products (only if orders sync was successful or if it's an incremental sync)
        if (siteResult.orders.successful || syncMode === 'incremental') {
          try {
            siteResult.products.attempted = true;
            
            const productResponse = await fetch(`${request.url.replace('/sync/scheduled', '/sync/products/incremental')}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                siteId: site.id,
                mode: syncMode,
                includeVariations: true,
              }),
            });

            if (productResponse.ok) {
              const productData = await productResponse.json();
              if (productData.success) {
                siteResult.products.successful = true;
                siteResult.products.count = productData.results?.syncedProducts || 0;
                console.log(`Products sync completed for ${site.name}: ${siteResult.products.count} products`);
              } else {
                siteResult.products.error = productData.error || 'Unknown products sync error';
              }
            } else {
              siteResult.products.error = `HTTP ${productResponse.status}`;
            }
          } catch (productError: any) {
            siteResult.products.error = productError.message;
          }
        }

        siteResult.duration = Date.now() - siteStartTime;

        // Update site sync status
        if (siteResult.orders.successful || siteResult.products.successful) {
          results.successfulSites++;
          
          // Update site last sync time
          await supabase
            .from('wc_sites')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('id', site.id);
        } else {
          results.failedSites++;
          const errors = [siteResult.orders.error, siteResult.products.error].filter(Boolean);
          results.errors.push(`${site.name}: ${errors.join(', ')}`);
        }

        console.log(`Sync completed for ${site.name} in ${Math.round(siteResult.duration / 1000)}s`);

      } catch (siteError: any) {
        console.error(`Site sync failed for ${site.name}:`, siteError);
        siteResult.duration = Date.now() - siteStartTime;
        results.failedSites++;
        results.errors.push(`${site.name}: ${siteError.message}`);
      }

      results.sites.push(siteResult);

      // Add a small delay between sites to avoid overwhelming external APIs
      if (sites.indexOf(site) < sites.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`Scheduled sync job completed in ${Math.round(totalDuration / 1000)}s`);

    // Log the scheduled sync result
    await supabase
      .from('sync_logs')
      .insert({
        site_id: null, // This is a global scheduled sync
        sync_type: 'scheduled',
        sync_mode: 'auto',
        status: results.failedSites === 0 ? 'completed' : 'partial',
        items_to_sync: results.totalSites,
        items_synced: results.successfulSites,
        items_failed: results.failedSites,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: totalDuration,
        error_message: results.errors.length > 0 ? results.errors[0] : null,
        error_details: results.errors.length > 0 ? { errors: results.errors } : null,
      });

    return NextResponse.json({
      success: results.failedSites === 0,
      message: `Scheduled sync completed. ${results.successfulSites}/${results.totalSites} sites synced successfully.`,
      results,
      duration: totalDuration,
    });

  } catch (error: any) {
    console.error('Scheduled sync API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// GET: Get scheduled sync status and logs
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    // Get recent scheduled sync logs
    const { data: scheduledLogs, error: logsError } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('sync_type', 'scheduled')
      .order('started_at', { ascending: false })
      .limit(20);

    if (logsError) {
      throw logsError;
    }

    // Get overall sync health
    const { data: sites, error: sitesError } = await supabase
      .from('wc_sites')
      .select(`
        id,
        name,
        enabled,
        last_sync_at
      `)
      .eq('enabled', true);

    if (sitesError) {
      throw sitesError;
    }

    // Calculate sync health metrics
    const now = Date.now();
    const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000);
    
    const healthMetrics = {
      totalEnabledSites: sites?.length || 0,
      recentlySynced: sites?.filter(s => 
        s.last_sync_at && new Date(s.last_sync_at) > sixHoursAgo
      ).length || 0,
      staleSync: sites?.filter(s => 
        !s.last_sync_at || new Date(s.last_sync_at) <= sixHoursAgo
      ).length || 0,
    };

    // Get next scheduled sync info (if using cron jobs)
    const cronSchedule = process.env.SYNC_CRON_SCHEDULE || '0 */6 * * *'; // Every 6 hours by default

    return NextResponse.json({
      success: true,
      healthMetrics,
      cronSchedule,
      recentLogs: scheduledLogs?.map(log => ({
        id: log.id,
        startedAt: log.started_at,
        completedAt: log.completed_at,
        status: log.status,
        duration: log.duration_ms,
        itemsSynced: log.items_synced,
        itemsFailed: log.items_failed,
        errorMessage: log.error_message,
      })) || [],
      staleSites: sites?.filter(s => 
        !s.last_sync_at || new Date(s.last_sync_at) <= sixHoursAgo
      ).map(s => ({
        id: s.id,
        name: s.name,
        lastSync: s.last_sync_at,
      })) || [],
    });

  } catch (error: any) {
    console.error('Scheduled sync status API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}