import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET: 获取任务队列状态
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'all';
    const limit = parseInt(searchParams.get('limit') || '50');
    
    // 构建查询
    let query = supabase
      .from('sync_tasks')
      .select(`
        *,
        site:wc_sites(id, name, url)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    // 根据状态过滤
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    
    const { data: tasks, error } = await query;
    
    if (error) {
      throw error;
    }
    
    // 获取队列统计
    const { data: stats } = await supabase
      .from('sync_tasks')
      .select('status')
      .in('status', ['pending', 'processing', 'completed', 'failed', 'cancelled']);
    
    const queueStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: 0
    };
    
    if (stats) {
      stats.forEach(task => {
        queueStats[task.status as keyof typeof queueStats]++;
        queueStats.total++;
      });
    }
    
    return NextResponse.json({
      tasks,
      stats: queueStats
    });
    
  } catch (error: any) {
    console.error('Queue API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// POST: 添加任务到队列
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
      taskType = 'full',
      priority = 3,
      skuList = null,
      metadata = {}
    } = body;

    if (!siteId) {
      return NextResponse.json({ 
        error: 'Site ID is required' 
      }, { status: 400 });
    }

    // 检查是否已有相同的待处理任务
    const { data: existingTask } = await supabase
      .from('sync_tasks')
      .select('*')
      .eq('site_id', siteId)
      .eq('task_type', taskType)
      .in('status', ['pending', 'processing'])
      .single();
    
    if (existingTask) {
      return NextResponse.json({ 
        error: 'A similar task is already in queue',
        existingTaskId: existingTask.id
      }, { status: 409 });
    }

    // 创建新任务
    const { data: task, error } = await supabase
      .from('sync_tasks')
      .insert({
        site_id: siteId,
        task_type: taskType,
        sku_list: skuList,
        priority,
        status: 'pending',
        retry_count: 0,
        metadata,
        progress: {
          percentage: 0,
          current: 0,
          total: 0,
          message: '等待开始...'
        }
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // 立即触发处理器执行任务（不等待结果）
    console.log(`[Queue] 任务已创建，立即触发处理器...`);
    triggerProcessor().catch(err => {
      console.error('[Queue] 触发处理器失败:', err);
    });

    return NextResponse.json({
      success: true,
      task
    });

  } catch (error: any) {
    console.error('Queue POST error:', error);
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

// 异步触发处理器
async function triggerProcessor() {
  try {
    // 使用内部调用标记，绕过认证
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/sync/queue/processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-call': 'dispatcher'
      }
    });

    if (!response.ok) {
      console.error('[Queue] 处理器响应错误:', response.status);
    } else {
      const result = await response.json();
      console.log('[Queue] 处理器响应:', result);
    }
  } catch (error) {
    console.error('[Queue] 调用处理器异常:', error);
  }
}

// PATCH: 更新任务状态（取消任务）
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { taskId, action } = body;

    if (!taskId || !action) {
      return NextResponse.json({ 
        error: 'Task ID and action are required' 
      }, { status: 400 });
    }

    // 获取当前任务状态
    const { data: task, error: fetchError } = await supabase
      .from('sync_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      return NextResponse.json({ 
        error: 'Task not found' 
      }, { status: 404 });
    }

    // 处理不同的操作
    switch (action) {
      case 'cancel':
        // 只能取消 pending 或 processing 状态的任务
        if (!['pending', 'processing'].includes(task.status)) {
          return NextResponse.json({ 
            error: 'Can only cancel pending or processing tasks' 
          }, { status: 400 });
        }

        const updateData: any = {
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          error_message: 'Task cancelled by user'
        };
        
        const { error: updateError } = await supabase
          .from('sync_tasks')
          .update(updateData)
          .eq('id', taskId);

        if (updateError) {
          throw updateError;
        }

        return NextResponse.json({
          success: true,
          message: 'Task cancelled successfully'
        });

      case 'retry':
        // 只能重试失败的任务
        if (task.status !== 'failed') {
          return NextResponse.json({ 
            error: 'Can only retry failed tasks' 
          }, { status: 400 });
        }

        const { error: retryError } = await supabase
          .from('sync_tasks')
          .update({
            status: 'pending',
            retry_count: (task.retry_count || 0) + 1,
            error_message: null,
            started_at: null,
            completed_at: null,
            progress: {
              percentage: 0,
              current: 0,
              total: 0,
              message: '等待重试...'
            }
          })
          .eq('id', taskId);

        if (retryError) {
          throw retryError;
        }

        return NextResponse.json({
          success: true,
          message: 'Task queued for retry'
        });

      default:
        return NextResponse.json({ 
          error: 'Invalid action' 
        }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Queue PATCH error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// DELETE: 删除任务
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ 
        error: 'Task ID is required' 
      }, { status: 400 });
    }

    // 只能删除已完成、失败或取消的任务
    const { data: task } = await supabase
      .from('sync_tasks')
      .select('status')
      .eq('id', taskId)
      .single();

    if (!task) {
      return NextResponse.json({ 
        error: 'Task not found' 
      }, { status: 404 });
    }

    if (['pending', 'processing'].includes(task.status)) {
      return NextResponse.json({ 
        error: 'Cannot delete active tasks' 
      }, { status: 400 });
    }

    const { error } = await supabase
      .from('sync_tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully'
    });

  } catch (error: any) {
    console.error('Queue DELETE error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}