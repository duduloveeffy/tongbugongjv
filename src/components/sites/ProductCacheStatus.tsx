'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Package,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Database,
  Trash2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { toast } from 'sonner';

interface ProductCacheStatusProps {
  siteId: string;
  siteName: string;
  isEnabled: boolean;
  compact?: boolean;
}

interface SyncStatus {
  site_id: string;
  sync_status: 'idle' | 'syncing' | 'completed' | 'error';
  total_products: number;
  synced_products: number;
  sync_progress: number;
  last_sync_at: string | null;
  last_sync_duration_ms: number | null;
  sync_error: string | null;
}

export function ProductCacheStatus({
  siteId,
  siteName,
  isEnabled,
  compact = false,
}: ProductCacheStatusProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [cacheCount, setCacheCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Fetch sync status
  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/sync/products-cache?siteId=${siteId}`);
      const data = await response.json();

      if (data.success) {
        setStatus(data.data.status);
        setCacheCount(data.data.cacheCount);

        // Update syncing state based on status
        if (data.data.status.sync_status === 'syncing') {
          setSyncing(true);
        } else {
          setSyncing(false);
        }
      }
    } catch (error) {
      console.error('Failed to fetch cache status:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and periodic refresh
  useEffect(() => {
    fetchStatus();

    // Refresh more frequently when syncing
    const interval = setInterval(
      fetchStatus,
      syncing ? 2000 : 30000 // 2s when syncing, 30s otherwise
    );

    return () => clearInterval(interval);
  }, [siteId, syncing]);

  // Handle manual sync
  const handleSync = async () => {
    if (!isEnabled) {
      toast.error('请先启用站点');
      return;
    }

    setSyncing(true);

    try {
      const response = await fetch('/api/sync/products-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message || '产品缓存同步已启动');
        // Start polling for status
        fetchStatus();
      } else {
        toast.error(data.error || '同步失败');
        setSyncing(false);
      }
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error('同步请求失败');
      setSyncing(false);
    }
  };

  // Handle clear cache
  const handleClearCache = async () => {
    if (!confirm(`确定要清除 ${siteName} 的产品缓存吗？`)) {
      return;
    }

    setClearing(true);

    try {
      // For now, we'll clear by re-syncing
      // In the future, could add a dedicated clear endpoint
      toast.info('清除缓存中...');
      await handleSync();
    } finally {
      setClearing(false);
    }
  };

  // Get status icon and color
  const getStatusDisplay = () => {
    if (!status) return null;

    switch (status.sync_status) {
      case 'syncing':
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          color: 'blue' as const,
          text: '同步中',
        };
      case 'completed':
        return {
          icon: <CheckCircle className="h-4 w-4" />,
          color: 'green' as const,
          text: '已完成',
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          color: 'red' as const,
          text: '错误',
        };
      default:
        return {
          icon: <Database className="h-4 w-4" />,
          color: 'gray' as const,
          text: '空闲',
        };
    }
  };

  // Format cache age
  const getCacheAge = () => {
    if (!status?.last_sync_at) return '从未同步';

    try {
      const date = new Date(status.last_sync_at);
      return formatDistanceToNow(date, {
        addSuffix: true,
        locale: zhCN,
      });
    } catch {
      return '未知';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  const statusDisplay = getStatusDisplay();

  // Compact view for table row
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {statusDisplay && (
            <div className={`text-${statusDisplay.color}-500`}>
              {statusDisplay.icon}
            </div>
          )}
          <span className="text-sm font-medium">{cacheCount}</span>
          <span className="text-xs text-muted-foreground">产品</span>
        </div>

        {status?.sync_status === 'syncing' && status.sync_progress > 0 && (
          <div className="w-16">
            <Progress value={status.sync_progress} className="h-1.5" />
          </div>
        )}

        <Button
          onClick={handleSync}
          size="icon"
          variant="ghost"
          disabled={!isEnabled || syncing}
          title="同步产品缓存"
          className="h-7 w-7"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    );
  }

  // Full view
  return (
    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">产品缓存状态</span>
          {statusDisplay && (
            <Badge variant={statusDisplay.color as any}>
              {statusDisplay.text}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleClearCache}
            size="sm"
            variant="ghost"
            disabled={clearing || syncing}
            title="清除缓存"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleSync}
            size="sm"
            variant={cacheCount === 0 ? 'default' : 'outline'}
            disabled={!isEnabled || syncing}
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                同步中...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                {cacheCount === 0 ? '初始化缓存' : '刷新缓存'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">缓存产品</div>
          <div className="font-medium text-lg">{cacheCount}</div>
        </div>
        <div>
          <div className="text-muted-foreground">总产品数</div>
          <div className="font-medium text-lg">
            {status?.total_products || '-'}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">最后同步</div>
          <div className="font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {getCacheAge()}
          </div>
        </div>
      </div>

      {/* Sync Progress */}
      {status?.sync_status === 'syncing' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              同步进度: {status.synced_products}/{status.total_products}
            </span>
            <span className="font-medium">{status.sync_progress.toFixed(1)}%</span>
          </div>
          <Progress value={status.sync_progress} className="h-2" />
        </div>
      )}

      {/* Error Message */}
      {status?.sync_error && (
        <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>{status.sync_error}</div>
        </div>
      )}

      {/* Last Sync Details */}
      {status?.last_sync_at && status.last_sync_duration_ms && (
        <div className="text-xs text-muted-foreground">
          上次同步耗时: {(status.last_sync_duration_ms / 1000).toFixed(1)}秒
        </div>
      )}
    </div>
  );
}