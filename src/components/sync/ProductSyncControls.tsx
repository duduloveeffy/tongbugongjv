import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { InventoryItem } from '@/lib/inventory-utils';
import { Package, RefreshCw, Settings, Info } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

// 使用共享组件
import { SiteSelector } from './shared/SiteSelector';
import { SyncProgressBar } from './shared/SyncProgressBar';
import { SyncStatusIndicator } from './shared/SyncStatusIndicator';
import { calculateBatchSyncNeeds } from '@/lib/sync-core';
import type { SiteInfo } from '@/lib/sync-core';

interface ProductSyncControlsProps {
  isEnabled: boolean;
  isLoading: boolean;
  progress: string;
  selectedSkusForSync: Set<string>;
  onToggle: (enabled: boolean) => void;
  onStartDetection: (skus: string[], siteId?: string) => void;
  onBatchSync: (shouldBeInStock: boolean, siteId?: string) => void;
  filteredData: InventoryItem[];
  sites?: SiteInfo[];
  selectedSiteId?: string | null;
  onSiteChange?: (siteId: string) => void;
  apiLatency?: {
    avg: number;
    min: number;
    max: number;
  } | null;
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
  sites,
  selectedSiteId,
  onSiteChange,
  apiLatency,
}: ProductSyncControlsProps) {
  const [batchSize, setBatchSize] = useState(-1); // -1 表示全部
  const [detectionProgress, setDetectionProgress] = useState(0);

  // 计算同步需求统计
  const syncNeeds = calculateBatchSyncNeeds(filteredData);
  const toInstockCount = Array.from(syncNeeds.values()).filter(n => n === 'to-instock').length;
  const toOutofstockCount = Array.from(syncNeeds.values()).filter(n => n === 'to-outofstock').length;
  const toQuantityCount = Array.from(syncNeeds.values()).filter(n => n === 'to-quantity').length;

  const handleStartDetection = () => {
    if (filteredData.length === 0) {
      toast.error('请先导入库存数据');
      return;
    }

    // 如果有站点选择功能，检查是否选择了站点
    if (sites && sites.length > 0 && !selectedSiteId) {
      toast.error('请先选择要检测的站点');
      return;
    }

    const actualBatchSize = batchSize === -1 ? filteredData.length : batchSize;
    const skus = filteredData.map(item => item.产品代码).slice(0, actualBatchSize);
    setDetectionProgress(0);
    onStartDetection(skus, selectedSiteId || undefined);
  };

  const handleBatchSync = (shouldBeInStock: boolean) => {
    if (selectedSkusForSync.size === 0) {
      toast.error('请先选择要同步的SKU');
      return;
    }

    // 如果有站点选择功能，检查是否选择了站点
    if (sites && sites.length > 0 && !selectedSiteId) {
      toast.error('请先选择要同步的站点');
      return;
    }

    onBatchSync(shouldBeInStock, selectedSiteId || undefined);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          单站点库存同步
        </CardTitle>
        <CardDescription>
          快速检测产品状态并同步库存信息到指定站点
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
            {/* 使用共享的站点选择器 */}
            {sites && sites.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <SiteSelector
                      sites={sites}
                      mode="single"
                      value={selectedSiteId || undefined}
                      onChange={(value) => onSiteChange?.(value as string)}
                      label="选择目标站点"
                      placeholder="请选择要同步的站点"
                    />
                  </div>
                  {apiLatency && (
                    <div className="text-sm text-muted-foreground pt-6">
                      <span className="font-medium">API延迟: </span>
                      <span className="text-blue-600 font-semibold">{apiLatency.avg}ms</span>
                      <span className="text-gray-500 ml-1 text-xs">
                        (最小: {apiLatency.min}ms, 最大: {apiLatency.max}ms)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 同步需求统计 */}
            {(toInstockCount > 0 || toOutofstockCount > 0 || toQuantityCount > 0) && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div>当前筛选数据中：</div>
                    <div className="flex gap-4 text-sm flex-wrap">
                      {toInstockCount > 0 && (
                        <span className="text-blue-600">
                          • {toInstockCount} 个产品建议同步为有货
                        </span>
                      )}
                      {toOutofstockCount > 0 && (
                        <span className="text-red-600">
                          • {toOutofstockCount} 个产品建议同步为无货
                        </span>
                      )}
                      {toQuantityCount > 0 && (
                        <span className="text-orange-600">
                          • {toQuantityCount} 个产品需同步库存数量
                        </span>
                      )}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* 检测数量限制 */}
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

            {/* 操作按钮 */}
            <div className="space-y-2">
              <Button
                onClick={handleStartDetection}
                disabled={isLoading || filteredData.length === 0}
                className="w-full"
              >
                {isLoading ? (
                  <SyncStatusIndicator status="syncing" message="检测中..." />
                ) : (
                  <>
                    <Package className="mr-2 h-4 w-4" />
                    开始产品检测 ({batchSize === -1 ? filteredData.length : Math.min(batchSize, filteredData.length)}个SKU)
                  </>
                )}
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

            {/* 使用共享的进度条组件 */}
            {isLoading && progress && (
              <SyncProgressBar
                value={detectionProgress}
                label={progress}
                isIndeterminate={detectionProgress === 0}
              />
            )}

            {/* 状态说明 */}
            <div className="space-y-1 text-muted-foreground text-xs border-t pt-3">
              <p className="font-medium mb-1">同步建议说明：</p>
              <p>• 🔴 红色按钮：显示有货但净库存≤0，建议同步为无货</p>
              <p>• 🔵 蓝色按钮：显示无货但净库存&gt;0，建议同步为有货</p>
              <p>• ⚪ 灰色按钮：状态正常，无需同步</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}