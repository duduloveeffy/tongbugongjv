'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  PlayCircle, 
  PauseCircle, 
  XCircle, 
  RefreshCw, 
  Trash2, 
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Ban
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SyncTask {
  id: string;
  site_id: string;
  site?: {
    id: string;
    name: string;
    url: string;
  };
  task_type: 'full' | 'incremental' | 'sku_batch';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  progress?: {
    percentage: number;
    current: number;
    total: number;
    message: string;
  };
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  retry_count: number;
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

interface TaskQueueMonitorProps {
  onClose?: () => void;
}

export function TaskQueueMonitor({ onClose }: TaskQueueMonitorProps) {
  const [tasks, setTasks] = useState<SyncTask[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 获取任务队列
  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/sync/queue');
      if (!response.ok) throw new Error('Failed to fetch queue');
      
      const data = await response.json();
      setTasks(data.tasks || []);
      setStats(data.stats || {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total: 0
      });
    } catch (error: any) {
      console.error('Failed to fetch queue:', error);
      toast.error('获取任务队列失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 处理队列中的任务
  const processQueue = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      const response = await fetch('/api/sync/queue/processor', {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to process queue');
      
      const result = await response.json();
      
      if (result.success) {
        toast.success('任务处理成功');
      } else if (result.message === 'No pending tasks') {
        toast.info('没有待处理的任务');
      } else if (result.message === 'Max concurrent tasks reached') {
        toast.warning('已达到最大并发数限制');
      }
      
      // 刷新队列
      await fetchQueue();
    } catch (error: any) {
      console.error('Failed to process queue:', error);
      toast.error('处理任务失败');
    } finally {
      setIsProcessing(false);
    }
  };

  // 取消任务
  const cancelTask = async (taskId: string) => {
    try {
      const response = await fetch('/api/sync/queue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId,
          action: 'cancel'
        })
      });
      
      if (!response.ok) throw new Error('Failed to cancel task');
      
      toast.success('任务已取消');
      await fetchQueue();
    } catch (error: any) {
      console.error('Failed to cancel task:', error);
      toast.error('取消任务失败');
    }
  };

  // 重试任务
  const retryTask = async (taskId: string) => {
    try {
      const response = await fetch('/api/sync/queue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId,
          action: 'retry'
        })
      });
      
      if (!response.ok) throw new Error('Failed to retry task');
      
      toast.success('任务已加入重试队列');
      await fetchQueue();
    } catch (error: any) {
      console.error('Failed to retry task:', error);
      toast.error('重试任务失败');
    }
  };

  // 删除任务
  const deleteTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/sync/queue?taskId=${taskId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete task');
      
      toast.success('任务已删除');
      await fetchQueue();
    } catch (error: any) {
      console.error('Failed to delete task:', error);
      toast.error('删除任务失败');
    }
  };

  // 自动刷新
  useEffect(() => {
    fetchQueue();
    
    if (autoRefresh) {
      const interval = setInterval(fetchQueue, 3000); // 每3秒刷新一次
      return () => clearInterval(interval);
    }
  }, [fetchQueue, autoRefresh]);

  // 自动处理队列
  useEffect(() => {
    if (stats.pending > 0 && stats.processing < 2) {
      // 有待处理任务且处理中的任务少于2个时，自动处理
      const timer = setTimeout(() => {
        processQueue();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [stats.pending, stats.processing]);

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      case 'cancelled':
        return <Ban className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  // 获取状态颜色
  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'processing':
        return 'default';
      case 'completed':
        return 'outline';
      case 'failed':
        return 'destructive';
      case 'cancelled':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // 获取任务类型标签
  const getTaskTypeLabel = (type: string) => {
    switch (type) {
      case 'full':
        return '全量同步';
      case 'incremental':
        return '增量同步';
      case 'sku_batch':
        return 'SKU批量';
      default:
        return type;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>同步任务队列</CardTitle>
            <CardDescription>管理和监控同步任务执行状态</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? <PauseCircle className="h-4 w-4 mr-1" /> : <PlayCircle className="h-4 w-4 mr-1" />}
              {autoRefresh ? '暂停刷新' : '自动刷新'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchQueue}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                关闭
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* 队列统计 */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-sm text-muted-foreground">等待中</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
            <div className="text-sm text-muted-foreground">处理中</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-muted-foreground">已完成</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-sm text-muted-foreground">失败</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">{stats.cancelled}</div>
            <div className="text-sm text-muted-foreground">已取消</div>
          </div>
        </div>

        {/* 任务列表 */}
        <ScrollArea className="h-[400px] w-full">
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  暂无同步任务
                </AlertDescription>
              </Alert>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(task.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {task.site?.name || 'Unknown Site'}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getTaskTypeLabel(task.task_type)}
                        </Badge>
                        <Badge variant={getStatusVariant(task.status)} className="text-xs">
                          {task.status}
                        </Badge>
                        {task.retry_count > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            重试 {task.retry_count}
                          </Badge>
                        )}
                      </div>
                      
                      {/* 进度条 */}
                      {task.status === 'processing' && task.progress && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>{task.progress.message}</span>
                            <span>{task.progress.percentage}%</span>
                          </div>
                          <Progress value={task.progress.percentage} className="h-2" />
                        </div>
                      )}
                      
                      {/* 错误信息 */}
                      {task.error_message && (
                        <div className="mt-1 text-xs text-red-600">
                          {task.error_message}
                        </div>
                      )}
                      
                      {/* 时间信息 */}
                      <div className="mt-1 text-xs text-muted-foreground">
                        创建于: {format(new Date(task.created_at), 'HH:mm:ss')}
                        {task.started_at && ` | 开始于: ${format(new Date(task.started_at), 'HH:mm:ss')}`}
                        {task.completed_at && ` | 完成于: ${format(new Date(task.completed_at), 'HH:mm:ss')}`}
                      </div>
                    </div>
                  </div>
                  
                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1">
                    {['pending', 'processing'].includes(task.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelTask(task.id)}
                        title="取消任务"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {task.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => retryTask(task.id)}
                        title="重试任务"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    {['completed', 'failed', 'cancelled'].includes(task.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTask(task.id)}
                        title="删除任务"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* 手动处理按钮 */}
        {stats.pending > 0 && (
          <div className="mt-4 flex justify-center">
            <Button
              onClick={processQueue}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  手动处理队列
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}