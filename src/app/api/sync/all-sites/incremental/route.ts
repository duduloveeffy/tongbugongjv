import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// POST: 为所有启用的站点创建增量同步任务
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
      priority = 4, // 默认优先级
    } = body;

    // 1. 获取所有启用的站点
    const { data: sites, error: sitesError } = await supabase
      .from('wc_sites')
      .select('*')
      .eq('enabled', true)
      .order('last_sync_at', { ascending: true, nullsFirst: true }); // 优先同步很久没同步的

    if (sitesError) {
      console.error('Failed to fetch sites:', sitesError);
      return NextResponse.json({
        error: 'Failed to fetch sites',
        details: sitesError.message
      }, { status: 500 });
    }

    if (!sites || sites.length === 0) {
      return NextResponse.json({
        error: 'No enabled sites found'
      }, { status: 404 });
    }

    // 2. 检查是否有正在进行的批量同步任务（防止重复点击）
    const { data: recentBatchTasks } = await supabase
      .from('sync_tasks')
      .select('id, metadata')
      .eq('metadata->>batch_type', 'all_sites_incremental')
      .in('status', ['pending', 'processing'])
      .limit(1);

    if (recentBatchTasks && recentBatchTasks.length > 0) {
      return NextResponse.json({
        error: '已有批量同步任务正在进行中，请等待完成后再试',
        existingBatchId: recentBatchTasks[0].metadata?.batch_id || undefined
      }, { status: 409 });
    }

    // 3. 生成批次ID用于关联这次批量同步
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 4. 为每个站点创建任务
    const taskPromises = sites.map(async (site, index) => {
      // 检查是否已有待处理的任务
      const { data: existingTask } = await supabase
        .from('sync_tasks')
        .select('id')
        .eq('site_id', site.id)
        .eq('task_type', 'incremental')
        .in('status', ['pending', 'processing'])
        .single();

      if (existingTask) {
        return {
          siteId: site.id,
          siteName: site.name,
          status: 'skipped',
          reason: 'Task already in queue',
          existingTaskId: existingTask.id
        };
      }

      // 创建新任务
      const { data: task, error: taskError } = await supabase
        .from('sync_tasks')
        .insert({
          site_id: site.id,
          task_type: 'incremental',
          priority: priority, // 使用整数优先级，所有任务相同优先级
          status: 'pending',
          retry_count: 0,
          metadata: {
            batch_id: batchId,
            batch_type: 'all_sites_incremental',
            source: 'bulk_sync',
            site_name: site.name,
            last_sync_at: site.last_sync_at,
            batch_index: index // 在metadata中保存顺序信息
          },
          progress: {
            percentage: 0,
            current: 0,
            total: 0,
            message: '等待开始增量同步...'
          }
        })
        .select('id')
        .single();

      if (taskError) {
        console.error(`Failed to create task for site ${site.name}:`, taskError);
        return {
          siteId: site.id,
          siteName: site.name,
          status: 'failed',
          error: taskError.message
        };
      }

      return {
        siteId: site.id,
        siteName: site.name,
        status: 'created',
        taskId: task.id
      };
    });

    // 5. 等待所有任务创建完成
    const results = await Promise.allSettled(taskPromises);

    // 6. 处理结果
    const taskResults = results.map(result =>
      result.status === 'fulfilled' ? result.value : {
        status: 'error',
        error: result.reason?.message || 'Unknown error'
      }
    );

    // 7. 统计结果
    const stats = {
      total: sites.length,
      eligible: sites.length,
      created: taskResults.filter(r => r.status === 'created').length,
      skipped: taskResults.filter(r => r.status === 'skipped').length,
      failed: taskResults.filter(r => r.status === 'failed').length,
    };

    // 8. 记录批量同步日志
    try {
      await supabase.from('sync_logs').insert({
        sync_type: 'batch_incremental',
        batch_id: batchId,
        success: stats.created > 0,
        details: {
          stats,
          results: taskResults,
          settings: { priority }
        },
        synced_at: new Date().toISOString()
      });
    } catch (logError) {
      console.error('Failed to save sync log:', logError);
    }

    return NextResponse.json({
      success: true,
      batchId,
      stats,
      results: taskResults,
      message: `已为 ${stats.created} 个站点创建增量同步任务`
    });

  } catch (error: any) {
    console.error('Bulk incremental sync error:', error);
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

// GET: 获取批量同步状态
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return NextResponse.json({
        error: 'Supabase not configured'
      }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({
        error: 'Batch ID is required'
      }, { status: 400 });
    }

    // 查询批次内的所有任务
    const { data: tasks, error } = await supabase
      .from('sync_tasks')
      .select(`
        *,
        site:wc_sites(id, name, url)
      `)
      .eq('metadata->>batch_id', batchId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch batch tasks:', error);
      return NextResponse.json({
        error: 'Failed to fetch batch tasks',
        details: error.message
      }, { status: 500 });
    }

    // 计算批次统计
    const stats = {
      total: tasks?.length || 0,
      pending: tasks?.filter(t => t.status === 'pending').length || 0,
      processing: tasks?.filter(t => t.status === 'processing').length || 0,
      completed: tasks?.filter(t => t.status === 'completed').length || 0,
      failed: tasks?.filter(t => t.status === 'failed').length || 0,
      cancelled: tasks?.filter(t => t.status === 'cancelled').length || 0,
    };

    // 计算总体进度
    const overallProgress = stats.total > 0
      ? Math.round(((stats.completed + stats.failed + stats.cancelled) / stats.total) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      batchId,
      stats,
      overallProgress,
      tasks,
      isComplete: stats.pending === 0 && stats.processing === 0
    });

  } catch (error: any) {
    console.error('Batch status error:', error);
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}