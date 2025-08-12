'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { InventoryItem } from '@/lib/inventory-utils';

interface CategorySyncButtonProps {
  inventoryData: InventoryItem[];
  className?: string;
}

export function CategorySyncButton({ inventoryData, className }: CategorySyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (inventoryData.length === 0) {
      toast.warning('没有库存数据可同步');
      return;
    }

    setIsSyncing(true);
    try {
      const response = await fetch('/api/categories/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryData }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`成功同步 ${result.synced} 个品类映射`);
        console.log('品类同步结果:', result);
      } else {
        throw new Error('同步失败');
      }
    } catch (error) {
      console.error('品类映射同步失败:', error);
      toast.error('品类映射同步失败');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={isSyncing || inventoryData.length === 0}
      className={className}
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
      {isSyncing ? '同步中...' : '同步品类映射'}
    </Button>
  );
}