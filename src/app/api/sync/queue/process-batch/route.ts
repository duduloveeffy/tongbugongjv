import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

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
    const { batchId, maxTasks = 10 } = body;

    // 获取所有待处理的任务
    let query = supabase
      .from('sync_tasks')
      .select('id')
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

    // 并发调用处理器处理多个任务
    const processPromises = pendingTasks.map(async (task) => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
                       (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');

        const response = await fetch(`${baseUrl}/api/sync/queue/processor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          throw new Error(`Processor returned ${response.status}`);
        }

        const result = await response.json();
        return {
          taskId: task.id,
          success: result.success,
          error: result.error
        };
      } catch (error: any) {
        return {
          taskId: task.id,
          success: false,
          error: error.message
        };
      }
    });

    // 等待所有任务处理完成
    const results = await Promise.allSettled(processPromises);

    // 统计结果
    const processed = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

    return NextResponse.json({
      success: true,
      message: `批量处理完成：${processed} 个成功，${failed} 个失败`,
      processed,
      failed,
      total: pendingTasks.length
    });

  } catch (error: any) {
    console.error('Batch processor error:', error);
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}