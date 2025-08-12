import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// 任务处理器 - 应该由定时任务或后台服务调用
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    // 检查是否有正在处理的任务（限制并发）
    const { data: processingTasks } = await supabase
      .from('sync_tasks')
      .select('id')
      .eq('status', 'processing');
    
    const MAX_CONCURRENT = 2; // 最大并发数
    if (processingTasks && processingTasks.length >= MAX_CONCURRENT) {
      return NextResponse.json({
        message: 'Max concurrent tasks reached',
        processing: processingTasks.length
      });
    }

    // 获取下一个待处理任务
    const { data: nextTask, error: fetchError } = await supabase
      .from('sync_tasks')
      .select(`
        *,
        site:wc_sites(*)
      `)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !nextTask) {
      return NextResponse.json({
        message: 'No pending tasks',
        processing: processingTasks?.length || 0
      });
    }

    // 标记任务为处理中
    const { error: updateError } = await supabase
      .from('sync_tasks')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        progress: {
          percentage: 0,
          current: 0,
          total: 0,
          message: '正在初始化...'
        }
      })
      .eq('id', nextTask.id);

    if (updateError) {
      throw updateError;
    }

    // 根据任务类型执行同步
    try {
      let result;
      
      switch (nextTask.task_type) {
        case 'full':
          // 全量同步订单和产品
          result = await executeFullSync(supabase, nextTask);
          break;
        
        case 'incremental':
          // 增量同步
          result = await executeIncrementalSync(supabase, nextTask);
          break;
        
        case 'sku_batch':
          // SKU批量同步
          result = await executeSkuBatchSync(supabase, nextTask);
          break;
        
        default:
          throw new Error(`Unknown task type: ${nextTask.task_type}`);
      }

      // 更新任务为完成状态
      await supabase
        .from('sync_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress: {
            percentage: 100,
            current: result.total,
            total: result.total,
            message: '同步完成'
          },
          metadata: {
            ...nextTask.metadata,
            result
          }
        })
        .eq('id', nextTask.id);

      return NextResponse.json({
        success: true,
        taskId: nextTask.id,
        result
      });

    } catch (syncError: any) {
      console.error('Sync execution error:', syncError);
      
      // 更新任务为失败状态
      await supabase
        .from('sync_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: syncError.message,
          progress: {
            percentage: 0,
            current: 0,
            total: 0,
            message: `错误: ${syncError.message}`
          }
        })
        .eq('id', nextTask.id);

      return NextResponse.json({
        success: false,
        taskId: nextTask.id,
        error: syncError.message
      });
    }

  } catch (error: any) {
    console.error('Queue processor error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// 执行全量同步
async function executeFullSync(supabase: any, task: any) {
  const { site } = task;
  const results = {
    orders: { synced: 0, failed: 0 },
    products: { synced: 0, failed: 0 },
    total: 0
  };

  // 更新进度：开始同步订单
  await updateTaskProgress(supabase, task.id, {
    percentage: 10,
    message: '正在同步订单...'
  });

  // 同步订单
  try {
    const orderResult = await syncOrders(site, 'full', async (progress) => {
      // 更新进度回调
      await updateTaskProgress(supabase, task.id, {
        percentage: 10 + Math.floor(progress * 0.4), // 10-50%
        message: `正在同步订单... ${progress}%`
      });
    });
    results.orders = orderResult;
  } catch (error: any) {
    console.error('Order sync error:', error);
    results.orders.failed = -1;
  }

  // 更新进度：开始同步产品
  await updateTaskProgress(supabase, task.id, {
    percentage: 50,
    message: '正在同步产品...'
  });

  // 同步产品
  try {
    const productResult = await syncProducts(site, 'full', async (progress) => {
      // 更新进度回调
      await updateTaskProgress(supabase, task.id, {
        percentage: 50 + Math.floor(progress * 0.4), // 50-90%
        message: `正在同步产品... ${progress}%`
      });
    });
    results.products = productResult;
  } catch (error: any) {
    console.error('Product sync error:', error);
    results.products.failed = -1;
  }

  // 更新进度：完成
  await updateTaskProgress(supabase, task.id, {
    percentage: 100,
    message: '同步完成'
  });

  results.total = results.orders.synced + results.products.synced;
  return results;
}

// 执行增量同步
async function executeIncrementalSync(supabase: any, task: any) {
  const { site } = task;
  const results = {
    orders: { synced: 0, failed: 0 },
    products: { synced: 0, failed: 0 },
    total: 0
  };

  // 同步订单
  await updateTaskProgress(supabase, task.id, {
    percentage: 20,
    message: '正在增量同步订单...'
  });

  try {
    const orderResult = await syncOrders(site, 'incremental', async (progress) => {
      await updateTaskProgress(supabase, task.id, {
        percentage: 20 + Math.floor(progress * 0.3),
        message: `增量同步订单... ${progress}%`
      });
    });
    results.orders = orderResult;
  } catch (error: any) {
    console.error('Incremental order sync error:', error);
    results.orders.failed = -1;
  }

  // 同步产品
  await updateTaskProgress(supabase, task.id, {
    percentage: 50,
    message: '正在增量同步产品...'
  });

  try {
    const productResult = await syncProducts(site, 'incremental', async (progress) => {
      await updateTaskProgress(supabase, task.id, {
        percentage: 50 + Math.floor(progress * 0.4),
        message: `增量同步产品... ${progress}%`
      });
    });
    results.products = productResult;
  } catch (error: any) {
    console.error('Incremental product sync error:', error);
    results.products.failed = -1;
  }

  results.total = results.orders.synced + results.products.synced;
  return results;
}

// 执行SKU批量同步
async function executeSkuBatchSync(supabase: any, task: any) {
  // TODO: 实现SKU批量同步逻辑
  return {
    synced: 0,
    failed: 0,
    total: 0
  };
}

// 同步订单（调用现有API）
async function syncOrders(site: any, mode: string, progressCallback?: (progress: number) => Promise<void>) {
  // 构建完整的 URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');
  
  const response = await fetch(`${baseUrl}/api/sync/orders/incremental`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      siteId: site.id,
      mode,
      batchSize: 50
    })
  });

  if (!response.ok) {
    throw new Error(`Order sync failed: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    synced: result.results?.syncedOrders || 0,
    failed: result.results?.failedOrders || 0
  };
}

// 同步产品（调用现有API）
async function syncProducts(site: any, mode: string, progressCallback?: (progress: number) => Promise<void>) {
  // 构建完整的 URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');
  
  const response = await fetch(`${baseUrl}/api/sync/products/incremental`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      siteId: site.id,
      mode,
      includeVariations: true
    })
  });

  if (!response.ok) {
    throw new Error(`Product sync failed: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    synced: result.results?.syncedProducts || 0,
    failed: result.results?.failedProducts || 0
  };
}

// 更新任务进度
async function updateTaskProgress(supabase: any, taskId: string, progress: any) {
  try {
    await supabase
      .from('sync_tasks')
      .update({
        progress: {
          percentage: progress.percentage || 0,
          current: progress.current || 0,
          total: progress.total || 0,
          message: progress.message || ''
        }
      })
      .eq('id', taskId);
  } catch (error) {
    console.error('Failed to update task progress:', error);
  }
}