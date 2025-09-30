import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  executeIncrementalOrderSync,
  executeIncrementalProductSync,
  type SyncResult
} from '@/lib/sync-functions';

// 批量处理队列任务 - 专门用于批量同步
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return NextResponse.json({
        error: 'Supabase not configured'
      }, { status: 503 });
    }

    const body = await request.json();
    const { batchId, maxTasks = 10 } = body; // 移除 concurrency 参数

    // 获取所有待处理的任务（需要获取完整任务信息，不仅仅是ID）
    let query = supabase
      .from('sync_tasks')
      .select('*')  // 获取完整任务信息
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(maxTasks);

    // 如果指定了批次ID，只处理该批次的任务
    if (batchId) {
      query = query.eq('metadata->>batch_id', batchId);
    }

    const { data: pendingTasks, error: fetchError } = await query;

    if (fetchError || !pendingTasks || pendingTasks.length === 0) {
      return NextResponse.json({
        message: 'No pending tasks',
        processed: 0
      });
    }

    console.log(`[Batch Processor] Processing ${pendingTasks.length} tasks serially (one by one)`);

    // 串行处理任务，一次只处理一个
    const results = [];
    let taskIndex = 0;

    for (const task of pendingTasks) {
      taskIndex++;
      const startTime = Date.now();

      console.log(`[Batch Processor] Processing task ${taskIndex}/${pendingTasks.length}`);

      // 先标记当前任务为运行中
      await supabase
        .from('sync_tasks')
        .update({
          status: 'running',
          started_at: new Date().toISOString()
        })
        .eq('id', task.id);

      try {
        console.log(`[Task ${task.id}] Starting ${task.sync_type} sync for site ${task.site_id}`);

        // 根据任务类型直接调用对应的同步函数
        let syncResult: SyncResult;

        if (task.sync_type === 'orders') {
          syncResult = await executeIncrementalOrderSync(
            task.site_id,
            task.metadata?.mode || 'incremental',
            50, // batchSize
            task.id // taskId for progress tracking
          );
        } else if (task.sync_type === 'products') {
          syncResult = await executeIncrementalProductSync(
            task.site_id,
            task.metadata?.mode || 'incremental',
            50, // batchSize
            task.id // taskId for progress tracking
          );
        } else {
          throw new Error(`Unknown sync type: ${task.sync_type}`);
        }

        // 标记任务为完成
        await supabase
          .from('sync_tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            result: syncResult,
            duration_ms: Date.now() - startTime
          })
          .eq('id', task.id);

        const duration = Date.now() - startTime;
        console.log(`[Task ${task.id}] Completed successfully in ${duration}ms`);

        results.push({
          taskId: task.id,
          success: true,
          duration: duration,
          synced: task.sync_type === 'orders' ? syncResult.syncedOrders : syncResult.syncedProducts
        });

      } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error(`[Task ${task.id}] Failed after ${duration}ms:`, error.message);

        // 标记任务为失败
        await supabase
          .from('sync_tasks')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error.message,
            duration_ms: duration
          })
          .eq('id', task.id);

        results.push({
          taskId: task.id,
          success: false,
          error: error.message,
          duration: duration
        });
      }

      console.log(`[Batch Processor] Progress: ${taskIndex}/${pendingTasks.length} tasks completed`);
    }

    // 统计结果
    const processed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = results.length > 0 ? totalDuration / results.length : 0;

    console.log(`[Batch Processor] All tasks completed: ${processed} succeeded, ${failed} failed, avg duration: ${Math.round(avgDuration)}ms`);

    return NextResponse.json({
      success: true,
      message: `批量处理完成：${processed} 个成功，${failed} 个失败`,
      processed,
      failed,
      total: pendingTasks.length,
      avgDuration: Math.round(avgDuration),
      details: results
    });

  } catch (error: any) {
    console.error('Batch processor error:', error);
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}