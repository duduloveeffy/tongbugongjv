'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';
import type { SyncNeed } from '@/lib/sync-core';

interface SyncStatusIndicatorProps {
  status?: 'success' | 'error' | 'warning' | 'pending' | 'syncing';
  syncNeed?: SyncNeed;
  stockStatus?: string;
  netStock?: number;
  message?: string;
  className?: string;
}

export function SyncStatusIndicator({
  status,
  syncNeed,
  stockStatus,
  netStock,
  message,
  className
}: SyncStatusIndicatorProps) {
  // 根据同步需求决定显示内容
  if (syncNeed && syncNeed !== 'none') {
    const isToInstock = syncNeed === 'to-instock';
    const isToOutofstock = syncNeed === 'to-outofstock';

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Badge
          variant={isToOutofstock ? 'destructive' : 'default'}
          className="flex items-center gap-1"
        >
          <AlertCircle className="h-3 w-3" />
          {isToInstock ? '需同步为有货' : '需同步为无货'}
        </Badge>
        {message && (
          <span className="text-xs text-muted-foreground">{message}</span>
        )}
      </div>
    );
  }

  // 根据状态显示不同的指示器
  switch (status) {
    case 'success':
      return (
        <div className={`flex items-center gap-2 text-green-600 ${className}`}>
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">{message || '同步成功'}</span>
        </div>
      );

    case 'error':
      return (
        <div className={`flex items-center gap-2 text-red-600 ${className}`}>
          <XCircle className="h-4 w-4" />
          <span className="text-sm">{message || '同步失败'}</span>
        </div>
      );

    case 'warning':
      return (
        <div className={`flex items-center gap-2 text-yellow-600 ${className}`}>
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{message || '需要注意'}</span>
        </div>
      );

    case 'pending':
      return (
        <div className={`flex items-center gap-2 text-gray-500 ${className}`}>
          <Clock className="h-4 w-4" />
          <span className="text-sm">{message || '待同步'}</span>
        </div>
      );

    case 'syncing':
      return (
        <div className={`flex items-center gap-2 text-blue-600 ${className}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{message || '同步中...'}</span>
        </div>
      );

    default:
      // 显示当前库存状态
      if (stockStatus) {
        const isInstock = stockStatus === 'instock';
        const stockText = isInstock ? '有货' : '无货';
        const variant = isInstock ? 'default' : 'secondary';

        return (
          <Badge variant={variant} className={className}>
            {stockText}
            {netStock !== undefined && ` (${netStock})`}
          </Badge>
        );
      }

      return null;
  }
}