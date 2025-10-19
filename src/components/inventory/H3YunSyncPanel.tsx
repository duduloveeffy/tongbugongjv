'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Database, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useH3YunStore } from '@/store/h3yun';
import type { InventoryItem } from '@/lib/inventory-utils';

interface H3YunSyncPanelProps {
  onDataLoad?: (data: InventoryItem[], headers: string[]) => void;
}

interface H3YunConfigDisplay {
  isConfigured: boolean;
  config?: {
    engineCode: string;
    engineSecret: string;
    inventorySchemaCode: string;
    warehouseSchemaCode: string;
  };
  error?: string;
}

export function H3YunSyncPanel({ onDataLoad }: H3YunSyncPanelProps) {
  const {
    warehouseMappings,
    isSyncing,
    setIsSyncing,
    syncProgress,
    setSyncProgress,
    setLastSyncTime,
    lastSyncTime,
  } = useH3YunStore();

  const [configStatus, setConfigStatus] = useState<H3YunConfigDisplay>({
    isConfigured: false,
  });
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // 加载配置信息
  useEffect(() => {
    fetchConfigStatus();
  }, []);

  const fetchConfigStatus = async () => {
    setIsLoadingConfig(true);
    try {
      const response = await fetch('/api/h3yun/config');
      const data = await response.json();
      setConfigStatus(data);
    } catch (error) {
      console.error('[H3YunSyncPanel] 获取配置失败:', error);
      setConfigStatus({
        isConfigured: false,
        error: '无法获取配置信息',
      });
    } finally {
      setIsLoadingConfig(false);
    }
  };

  // 同步库存数据
  const handleSync = async () => {
    if (!configStatus.isConfigured) {
      toast.error('氚云 ERP 配置未完成，请联系管理员');
      return;
    }

    setIsSyncing(true);
    setSyncProgress({ current: 0, total: 0, status: '正在连接氚云ERP...' });

    try {
      const response = await fetch('/api/h3yun/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseMappings,
          enableSkuMapping: false, // 固定为 false，不使用 SKU 映射
          // pageSize 使用后端默认值 500
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error || '同步失败';
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.success && result.data) {
        toast.success(
          `同步成功！获取 ${result.data.length} 条库存记录`
        );
        setLastSyncTime(new Date().toISOString());
        onDataLoad?.(result.data, result.headers || []);
      } else {
        throw new Error('同步失败：未返回有效数据');
      }
    } catch (error) {
      console.error('[H3YunSyncPanel] 同步失败:', error);
      toast.error(
        error instanceof Error ? error.message : '同步失败，请稍后重试'
      );
    } finally {
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 0, status: '' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          氚云 ERP 同步
        </CardTitle>
        <CardDescription>从氚云 ERP 系统同步库存数据</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 配置信息展示 */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">配置信息</h3>

          {isLoadingConfig ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              加载配置中...
            </div>
          ) : configStatus.isConfigured ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Engine Code
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {configStatus.config?.engineCode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Engine Secret
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {configStatus.config?.engineSecret}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  库存表
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {configStatus.config?.inventorySchemaCode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  仓库表
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {configStatus.config?.warehouseSchemaCode}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                {configStatus.error || '配置未完成，请联系管理员'}
              </span>
            </div>
          )}
        </div>

        {/* 配置状态 */}
        {configStatus.isConfigured && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">氚云 ERP 已配置</span>
          </div>
        )}

        {/* 同步进度 */}
        {isSyncing && syncProgress.status && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {syncProgress.status}
            </p>
            {syncProgress.total > 0 && (
              <div className="space-y-1">
                <Progress
                  value={(syncProgress.current / syncProgress.total) * 100}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {syncProgress.current} / {syncProgress.total}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 最后同步时间 */}
        {lastSyncTime && (
          <p className="text-xs text-muted-foreground">
            最后同步：{new Date(lastSyncTime).toLocaleString('zh-CN')}
          </p>
        )}

        {/* 同步按钮 */}
        <Button
          onClick={handleSync}
          disabled={isSyncing || !configStatus.isConfigured}
          className="w-full"
        >
          <Database className="mr-2 h-4 w-4" />
          {isSyncing ? '同步中...' : '同步库存'}
        </Button>
      </CardContent>
    </Card>
  );
}
