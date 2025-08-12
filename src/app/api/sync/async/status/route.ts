import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET: Check sync task status
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const siteId = searchParams.get('siteId');

    if (!taskId && !siteId) {
      return NextResponse.json({ 
        error: 'Task ID or Site ID is required' 
      }, { status: 400 });
    }

    // Build query based on parameters
    const baseQuery = supabase.from('sync_tasks').select('*');
    
    const { data, error } = await (async () => {
      if (taskId) {
        return baseQuery.eq('id', taskId).single();
      } else if (siteId) {
        // Get latest task for site
        return baseQuery
          .eq('site_id', siteId)
          .order('created_at', { ascending: false })
          .limit(5); // Get last 5 tasks
      }
      return baseQuery;
    })();

    if (error) {
      // If table doesn't exist, return appropriate message
      if (error.code === '42P01') {
        return NextResponse.json({
          success: true,
          tasks: [],
          message: 'No sync tasks found'
        });
      }
      
      return NextResponse.json({ 
        error: 'Failed to fetch task status',
        details: error.message 
      }, { status: 500 });
    }

    // Format response
    if (taskId && data) {
      // Single task response
      const task = data;
      const isRunning = task.status === 'running' || task.status === 'pending';
      const isCompleted = task.status === 'completed' || task.status === 'completed_with_errors';
      
      return NextResponse.json({
        success: true,
        task: {
          id: task.id,
          siteId: task.site_id,
          siteName: task.site_name,
          status: task.status,
          isRunning,
          isCompleted,
          progress: task.progress || {},
          results: task.results || {},
          errorMessage: task.error_message,
          createdAt: task.created_at,
          startedAt: task.started_at,
          completedAt: task.completed_at,
          duration: task.completed_at && task.started_at 
            ? new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()
            : null
        }
      });
    } else {
      // Multiple tasks response
      const tasks = Array.isArray(data) ? data : [data];
      
      return NextResponse.json({
        success: true,
        tasks: tasks.map(task => ({
          id: task.id,
          siteId: task.site_id,
          siteName: task.site_name,
          status: task.status,
          isRunning: task.status === 'running' || task.status === 'pending',
          isCompleted: task.status === 'completed' || task.status === 'completed_with_errors',
          progress: task.progress || {},
          results: task.results || {},
          errorMessage: task.error_message,
          createdAt: task.created_at,
          startedAt: task.started_at,
          completedAt: task.completed_at,
          duration: task.completed_at && task.started_at 
            ? new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()
            : null
        }))
      });
    }

  } catch (error: any) {
    console.error('Get sync status error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to get sync status',
      success: false 
    }, { status: 500 });
  }
}

// DELETE: Cancel a sync task
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ 
        error: 'Task ID is required' 
      }, { status: 400 });
    }

    // Update task status to cancelled
    const { error } = await supabase
      .from('sync_tasks')
      .update({ 
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        error_message: 'Task cancelled by user'
      })
      .eq('id', taskId)
      .eq('status', 'running'); // Only cancel if still running

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to cancel task',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Task cancelled successfully'
    });

  } catch (error: any) {
    console.error('Cancel sync task error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to cancel task',
      success: false 
    }, { status: 500 });
  }
}