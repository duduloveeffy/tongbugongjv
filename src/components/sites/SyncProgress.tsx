'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Package,
  ShoppingCart,
  Clock,
  TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';

interface SyncTask {
  id: string;
  site_id: string;
  site_name: string;
  status: 'pending' | 'running' | 'completed' | 'completed_with_errors' | 'failed';
  sync_type: string;
  progress?: {
    orders?: {
      total: number;
      synced: number;
      status: string;
    };
    products?: {
      total: number;
      synced: number;
      status: string;
    };
  };
  created_at: string;
  started_at?: string;
  completed_at?: string;
  results?: any;
  error_message?: string;
}

export function SyncProgress({ taskId, onComplete }: { taskId: string; onComplete?: () => void }) {
  const [task, setTask] = useState<SyncTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;

    const fetchTaskStatus = async () => {
      try {
        const response = await fetch(`/api/sync/async/status?taskId=${taskId}`);
        const data = await response.json();
        
        if (data.success && data.task) {
          setTask(data.task);
          setIsLoading(false);
          
          // Check if completed
          if (data.task.status === 'completed' || 
              data.task.status === 'completed_with_errors' || 
              data.task.status === 'failed') {
            if (onComplete) {
              onComplete();
            }
            return true; // Stop polling
          }
        }
        return false; // Continue polling
      } catch (error) {
        console.error('Failed to fetch task status:', error);
        return false;
      }
    };

    // Initial fetch
    fetchTaskStatus();

    // Set up polling
    const interval = setInterval(async () => {
      const completed = await fetchTaskStatus();
      if (completed) {
        clearInterval(interval);
      }
    }, 2000); // Poll every 2 seconds for real-time updates

    // Cleanup
    return () => clearInterval(interval);
  }, [taskId, onComplete]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'completed_with_errors':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: 'secondary',
      running: 'default',
      completed: 'success',
      completed_with_errors: 'warning',
      failed: 'destructive'
    };
    
    const labels: Record<string, string> = {
      pending: '等待中',
      running: '运行中',
      completed: '已完成',
      completed_with_errors: '完成(有错误)',
      failed: '失败'
    };

    return (
      <Badge variant={variants[status] || 'default'}>
        {labels[status] || status}
      </Badge>
    );
  };

  const calculateProgress = () => {
    if (!task?.progress) return 0;
    
    let totalItems = 0;
    let syncedItems = 0;
    
    if (task.progress.orders) {
      totalItems += task.progress.orders.total || 0;
      syncedItems += task.progress.orders.synced || 0;
    }
    
    if (task.progress.products) {
      totalItems += task.progress.products.total || 0;
      syncedItems += task.progress.products.synced || 0;
    }
    
    if (totalItems === 0) return 0;
    return Math.round((syncedItems / totalItems) * 100);
  };

  const getElapsedTime = () => {
    if (!task) return '';
    
    const start = task.started_at ? new Date(task.started_at) : new Date(task.created_at);
    const end = task.completed_at ? new Date(task.completed_at) : new Date();
    const elapsed = end.getTime() - start.getTime();
    
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}分${seconds}秒`;
    }
    return `${seconds}秒`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!task) {
    return null;
  }

  const overallProgress = calculateProgress();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon(task.status)}
            同步进度
          </CardTitle>
          {getStatusBadge(task.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">整体进度</span>
            <span className="font-medium">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Orders Progress */}
        {task.progress?.orders && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">订单同步</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {task.progress.orders.synced} / {task.progress.orders.total}
              </span>
            </div>
            <Progress 
              value={
                task.progress.orders.total > 0 
                  ? (task.progress.orders.synced / task.progress.orders.total) * 100 
                  : 0
              } 
              className="h-1.5" 
            />
          </div>
        )}

        {/* Products Progress */}
        {task.progress?.products && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">产品同步</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {task.progress.products.synced} / {task.progress.products.total}
              </span>
            </div>
            <Progress 
              value={
                task.progress.products.total > 0 
                  ? (task.progress.products.synced / task.progress.products.total) * 100 
                  : 0
              } 
              className="h-1.5" 
            />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">开始时间</p>
            <p className="text-sm font-medium">
              {format(new Date(task.created_at), 'HH:mm:ss')}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">已用时间</p>
            <p className="text-sm font-medium">{getElapsedTime()}</p>
          </div>
        </div>

        {/* Auto-incremental sync note */}
        {task.results?.auto_incremental_sync && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-md">
            <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs text-blue-700 dark:text-blue-300">
              已自动执行增量同步以捕获同步期间的变化
            </span>
          </div>
        )}

        {/* Error Message */}
        {task.error_message && (
          <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-md">
            <p className="text-sm text-red-700 dark:text-red-300">
              错误: {task.error_message}
            </p>
          </div>
        )}

        {/* Results Summary */}
        {task.status === 'completed' && task.results && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-2">同步结果</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {task.results.orders && (
                <div>
                  <span className="text-muted-foreground">订单: </span>
                  <span className="font-medium">{task.results.orders.synced || 0}</span>
                </div>
              )}
              {task.results.products && (
                <div>
                  <span className="text-muted-foreground">产品: </span>
                  <span className="font-medium">{task.results.products.synced || 0}</span>
                  {task.results.products.variations > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (+{task.results.products.variations} 变体)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}