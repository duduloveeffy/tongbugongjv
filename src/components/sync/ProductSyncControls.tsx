import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InventoryItem } from '@/lib/inventory-utils';
import { Package, RefreshCw, Settings } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface ProductSyncControlsProps {
  isEnabled: boolean;
  isLoading: boolean;
  progress: string;
  selectedSkusForSync: Set<string>;
  onToggle: (enabled: boolean) => void;
  onStartDetection: (skus: string[]) => void;
  onBatchSync: (shouldBeInStock: boolean) => void;
  filteredData: InventoryItem[];
}

export function ProductSyncControls({
  isEnabled,
  isLoading,
  progress,
  selectedSkusForSync,
  onToggle,
  onStartDetection,
  onBatchSync,
  filteredData,
}: ProductSyncControlsProps) {
  const [batchSize, setBatchSize] = useState(-1); // -1 表示全部

  const handleStartDetection = () => {
    if (filteredData.length === 0) {
      toast.error('请先导入库存数据');
      return;
    }

    const actualBatchSize = batchSize === -1 ? filteredData.length : batchSize;
    const skus = filteredData.map(item => item.产品代码).slice(0, actualBatchSize);
    onStartDetection(skus);
  };

  const handleBatchSync = (shouldBeInStock: boolean) => {
    if (selectedSkusForSync.size === 0) {
      toast.error('请先选择要同步的SKU');
      return;
    }
    onBatchSync(shouldBeInStock);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          库存同步设置
        </CardTitle>
        <CardDescription>
          检测产品上架状态并同步库存状态
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="product-sync"
            checked={isEnabled}
            onCheckedChange={onToggle}
          />
          <Label htmlFor="product-sync">启用库存同步功能</Label>
        </div>

        {isEnabled && (
          <div className="space-y-4 border-t pt-4">
            <div>
              <Label htmlFor="detection-batch-size">检测数量限制</Label>
              <Select value={batchSize.toString()} onValueChange={(value) => setBatchSize(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">
                    全部 ({filteredData.length}个SKU)
                  </SelectItem>
                  <SelectItem value="50">前50个SKU</SelectItem>
                  <SelectItem value="100">前100个SKU</SelectItem>
                  <SelectItem value="200">前200个SKU</SelectItem>
                  <SelectItem value="500">前500个SKU</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Button 
                onClick={handleStartDetection}
                disabled={isLoading || filteredData.length === 0}
                className="w-full"
              >
                <Package className="mr-2 h-4 w-4" />
                {isLoading ? '检测中...' : `开始上架检测 (${batchSize === -1 ? filteredData.length : Math.min(batchSize, filteredData.length)}个SKU)`}
              </Button>

              {selectedSkusForSync.size > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handleBatchSync(true)}
                    disabled={isLoading}
                    variant="default"
                    size="sm"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    批量同步为有货 ({selectedSkusForSync.size})
                  </Button>
                  <Button
                    onClick={() => handleBatchSync(false)}
                    disabled={isLoading}
                    variant="destructive"
                    size="sm"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    批量同步为无货 ({selectedSkusForSync.size})
                  </Button>
                </div>
              )}
            </div>

            {isLoading && progress && (
              <div className="rounded bg-muted p-3 text-muted-foreground text-sm">
                {progress}
              </div>
            )}

            <div className="space-y-1 text-muted-foreground text-xs">
              <p>• 🔴 红色按钮：有货但净库存≤0，建议同步为无货</p>
              <p>• 🔵 蓝色按钮：无货但净库存&gt;0，建议同步为有货</p>
              <p>• ⚪ 灰色按钮：状态正常，可手动切换</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}