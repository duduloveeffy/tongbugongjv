import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// POST: Start async sync task
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
      syncOrders = true, 
      syncProducts = true,
      force = false 
    } = body;

    if (!siteId) {
      return NextResponse.json({ 
        error: 'Site ID is required' 
      }, { status: 400 });
    }

    console.log('Received siteId:', siteId);
    console.log('siteId type:', typeof siteId);
    console.log('siteId length:', siteId.length);

    // Get site info
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
    
    // Check if there's already a running sync for this site
    const { data: runningSyncs } = await supabase
      .from('sync_tasks')
      .select('*')
      .eq('site_id', siteId)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (runningSyncs && runningSyncs.length > 0) {
      const runningTask = runningSyncs[0];
      const taskAge = Date.now() - new Date(runningTask.created_at).getTime();
      
      // If task is less than 30 minutes old, consider it still running
      if (taskAge < 30 * 60 * 1000) {
        return NextResponse.json({
          success: false,
          error: 'A sync task is already running for this site',
          existingTask: {
            id: runningTask.id,
            status: runningTask.status,
            created_at: runningTask.created_at,
            progress: runningTask.progress
          }
        }, { status: 409 }); // Conflict status
      } else {
        // Mark old task as failed if it's been running too long
        await supabase
          .from('sync_tasks')
          .update({ 
            status: 'failed',
            error_message: 'Task timeout - marked as failed after 30 minutes',
            completed_at: new Date().toISOString()
          })
          .eq('id', runningTask.id);
      }
    }
    
    // Check for recent completed syncs (within 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentSyncs } = await supabase
      .from('sync_tasks')
      .select('*')
      .eq('site_id', siteId)
      .eq('sync_type', 'full')
      .gte('created_at', tenMinutesAgo)
      .in('status', ['completed', 'completed_with_errors'])
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (recentSyncs && recentSyncs.length > 0 && !force) {
      const recentTask = recentSyncs[0];
      return NextResponse.json({
        success: false,
        warning: 'A full sync was completed recently',
        recentTask: {
          id: recentTask.id,
          completed_at: recentTask.completed_at,
          results: recentTask.results
        },
        message: 'A full sync was completed less than 10 minutes ago. Please confirm if you want to run another sync.',
        requireConfirmation: true
      }, { status: 200 });
    }

    // Create a sync task record with a unique task ID
    // siteId should already be a valid UUID from the frontend
    let taskId = `sync_${siteId.replace(/-/g, '')}_${Date.now()}`;
    
    // First try with text ID
    let taskData: any = {
      id: taskId,
      site_id: siteId, // This should be the actual UUID from the database
      site_name: site.name,
      sync_type: 'full',
      sync_orders: syncOrders,
      sync_products: syncProducts,
      status: 'pending',
      created_at: new Date().toISOString(),
      progress: {
        orders: { total: 0, synced: 0, status: 'pending' },
        products: { total: 0, synced: 0, status: 'pending' }
      }
    };

    let { error: taskError } = await supabase
      .from('sync_tasks')
      .insert(taskData);

    if (taskError) {
      console.error('Task insert error:', taskError);
      console.error('Task data:', taskData);
      
      // If it's a UUID type error, try without specifying ID (let DB generate it)
      if (taskError.code === '22P02' || taskError.message?.includes('invalid input syntax for type uuid')) {
        console.log('Table expects UUID for id, letting database generate it...');
        
        // Remove the id field and let database auto-generate
        delete taskData.id;
        
        const { data: insertedTask, error: uuidError } = await supabase
          .from('sync_tasks')
          .insert(taskData)
          .select()
          .single();
        
        if (!uuidError && insertedTask) {
          // Use the generated ID as taskId
          taskId = insertedTask.id;
          console.log('Task created with auto-generated ID:', taskId);
        } else if (uuidError) {
          console.error('UUID insert error:', uuidError);
          
          // If still fails due to missing columns, try minimal insert
          if (uuidError.code === 'PGRST204' || uuidError.message?.includes('column')) {
            const minimalTaskData = {
              site_id: siteId,
              status: 'pending',
              created_at: new Date().toISOString()
            };
            
            const { data: minimalTask, error: minimalError } = await supabase
              .from('sync_tasks')
              .insert(minimalTaskData)
              .select()
              .single();
              
            if (!minimalError && minimalTask) {
              taskId = minimalTask.id;
              console.log('Minimal task created with ID:', taskId);
            } else if (minimalError) {
              console.error('Minimal insert error:', minimalError);
              throw new Error(`Failed to create sync task: ${minimalError.message}`);
            }
          } else {
            throw new Error(`Failed to create sync task: ${uuidError.message}`);
          }
        }
      }
      // If column doesn't exist error (PGRST204) or table doesn't exist (42P01)
      else if (taskError.code === '42P01' || taskError.code === 'PGRST204' || taskError.message?.includes('column')) {
        console.log('Table or columns missing, trying without progress column...');
        
        // Try without the progress column
        const simpleTaskData = {
          id: taskId,
          site_id: siteId,
          site_name: site.name,
          sync_type: 'full',
          sync_orders: syncOrders,
          sync_products: syncProducts,
          status: 'pending',
          created_at: new Date().toISOString()
        };
        
        const { error: retryError } = await supabase
          .from('sync_tasks')
          .insert(simpleTaskData);
        
        if (retryError) {
          console.error('Simple insert error:', retryError);
          
          // Last resort: minimal insert
          const minimalTaskData = {
            site_id: siteId,
            status: 'pending',
            created_at: new Date().toISOString()
          };
          
          const { data: minimalTask, error: minimalError } = await supabase
            .from('sync_tasks')
            .insert(minimalTaskData)
            .select()
            .single();
            
          if (!minimalError && minimalTask) {
            taskId = minimalTask.id;
          } else if (minimalError) {
            console.error('Minimal insert error:', minimalError);
            throw new Error(`Failed to create sync task: ${minimalError.message}`);
          }
        }
      } else {
        throw taskError;
      }
    }

    // Start the actual sync in background (non-blocking)
    startBackgroundSync(taskId, site, syncOrders, syncProducts).catch(error => {
      console.error('Background sync error:', error);
      // Update task status to failed
      supabase
        .from('sync_tasks')
        .update({ 
          status: 'failed', 
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId)
        .then(() => {});
    });

    // Return immediately with task ID
    return NextResponse.json({
      success: true,
      taskId,
      message: 'Sync task started in background',
      checkStatusUrl: `/api/sync/async/status?taskId=${taskId}`
    });

  } catch (error: any) {
    console.error('Start async sync error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to start sync task',
      success: false 
    }, { status: 500 });
  }
}

// Background sync function
async function startBackgroundSync(
  taskId: string,
  site: any,
  syncOrders: boolean,
  syncProducts: boolean
) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  // Update status to running
  await supabase
    .from('sync_tasks')
    .update({ 
      status: 'running',
      started_at: new Date().toISOString()
    })
    .eq('id', taskId);

  const results = {
    orders: { synced: 0, errors: [] as string[] },
    products: { synced: 0, variations: 0, errors: [] as string[] }
  };

  // Sync orders
  if (syncOrders) {
    try {
      console.log(`[${taskId}] Starting orders sync for ${site.name}`);
      
      // Use longer timeout for large datasets
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/sync/orders/incremental`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site.id,
          mode: 'full',
          batchSize: 30, // Smaller batch size for large datasets
          taskId // Pass task ID for progress updates
        }),
        signal: AbortSignal.timeout(3600000) // 60 minutes timeout for large sites
      });

      if (response.ok) {
        const result = await response.json();
        results.orders.synced = result.results?.syncedOrders || 0;
      }
    } catch (error: any) {
      console.error(`[${taskId}] Orders sync error:`, error);
      results.orders.errors.push(error.message);
    }

    // Update progress
    await supabase
      .from('sync_tasks')
      .update({
        progress: {
          orders: { 
            total: results.orders.synced, 
            synced: results.orders.synced, 
            status: results.orders.errors.length > 0 ? 'failed' : 'completed' 
          },
          products: { total: 0, synced: 0, status: 'pending' }
        }
      })
      .eq('id', taskId);
  }

  // Sync products
  if (syncProducts) {
    try {
      console.log(`[${taskId}] Starting products sync for ${site.name}`);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/sync/products/incremental`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site.id,
          mode: 'full',
          includeVariations: true,
          batchSize: 20, // Smaller batch size for products
          taskId // Pass task ID for progress updates
        }),
        signal: AbortSignal.timeout(600000) // 10 minutes timeout
      });

      if (response.ok) {
        const result = await response.json();
        results.products.synced = result.results?.syncedProducts || 0;
        results.products.variations = result.results?.syncedVariations || 0;
      }
    } catch (error: any) {
      console.error(`[${taskId}] Products sync error:`, error);
      results.products.errors.push(error.message);
    }
  }

  // Update final status
  const hasErrors = results.orders.errors.length > 0 || results.products.errors.length > 0;
  
  await supabase
    .from('sync_tasks')
    .update({
      status: hasErrors ? 'completed_with_errors' : 'completed',
      completed_at: new Date().toISOString(),
      results,
      progress: {
        orders: { 
          total: results.orders.synced, 
          synced: results.orders.synced, 
          status: results.orders.errors.length > 0 ? 'failed' : 'completed' 
        },
        products: { 
          total: results.products.synced, 
          synced: results.products.synced, 
          status: results.products.errors.length > 0 ? 'failed' : 'completed' 
        }
      }
    })
    .eq('id', taskId);

  console.log(`[${taskId}] Full sync completed for ${site.name}`);
  
  // Auto-run incremental sync after full sync to catch changes during sync
  console.log(`[${taskId}] Starting automatic incremental sync to catch changes...`);
  
  try {
    // Run incremental sync for orders
    if (syncOrders) {
      const incrementalOrdersResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/sync/orders/incremental`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: site.id,
            mode: 'incremental',
            batchSize: 50, // Larger batch for incremental
          }),
          signal: AbortSignal.timeout(300000) // 5 minutes timeout
        }
      );
      
      if (incrementalOrdersResponse.ok) {
        const incrementalResult = await incrementalOrdersResponse.json();
        console.log(`[${taskId}] Incremental orders sync completed: ${incrementalResult.results?.syncedOrders || 0} orders updated`);
      }
    }
    
    // Run incremental sync for products
    if (syncProducts) {
      const incrementalProductsResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/sync/products/incremental`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: site.id,
            mode: 'incremental',
            includeVariations: true,
            batchSize: 30,
          }),
          signal: AbortSignal.timeout(180000) // 3 minutes timeout
        }
      );
      
      if (incrementalProductsResponse.ok) {
        const incrementalResult = await incrementalProductsResponse.json();
        console.log(`[${taskId}] Incremental products sync completed: ${incrementalResult.results?.syncedProducts || 0} products updated`);
      }
    }
    
    console.log(`[${taskId}] Auto-incremental sync completed successfully`);
    
    // Update task with incremental sync note
    await supabase
      .from('sync_tasks')
      .update({
        results: {
          ...results,
          auto_incremental_sync: true,
          auto_incremental_completed_at: new Date().toISOString()
        }
      })
      .eq('id', taskId);
      
  } catch (error) {
    console.error(`[${taskId}] Auto-incremental sync failed:`, error);
  }

  console.log(`[${taskId}] All sync operations completed for ${site.name}`);
}

// Create or update sync_tasks table structure
async function createOrUpdateSyncTasksTable(supabase: any) {
  // First, try to execute raw SQL to create/update the table
  // This approach doesn't rely on RPC functions which might not exist
  try {
    // Check if table exists and create minimal structure if not
    const { data: tables } = await supabase
      .from('sync_tasks')
      .select('id')
      .limit(1);
    
    // If we get here without error, table exists
    console.log('sync_tasks table exists, structure may need updating');
    
    // Note: Direct ALTER TABLE commands need to be run via Supabase dashboard
    // or migrations. Here we can only work with what's available.
    return true;
  } catch (error: any) {
    console.log('sync_tasks table might not exist, attempting to work around it');
    
    // If the table doesn't exist at all, we need manual intervention
    console.error('IMPORTANT: Please run the migration file manually in Supabase:');
    console.error('supabase/migrations/20250809_create_sync_tasks_table.sql');
    console.error('and supabase/migrations/20250809_update_sync_tasks_table.sql');
    
    return false;
  }
}