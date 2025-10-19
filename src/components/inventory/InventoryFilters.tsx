import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { type InventoryItem, exportToExcel } from '@/lib/inventory-utils';
import { Download, Filter, Search, Trash2, TrendingUp } from 'lucide-react';
import { CategoryMultiSelect } from './CategoryMultiSelect';

interface InventoryFiltersProps {
  skuFilters: string;
  categoryFilter?: string;  // 保留以兼容
  categoryFilters?: string[];  // 新增：多个品类筛选
  inventoryData: InventoryItem[];  // 新增：用于提取可用品类
  excludeSkuPrefixes: string;
  excludeWarehouses: string;  // 新增：要排除的仓库列表
  isMergedMode: boolean;
  hideZeroStock?: boolean;
  hideNormalStatus?: boolean;
  showNeedSync?: boolean;  // 新增：只显示需要同步的产品
  onSkuFiltersChange: (value: string) => void;
  onCategoryFilterChange?: (value: string) => void;  // 保留以兼容
  onCategoryFiltersChange?: (value: string[]) => void;  // 新增：多个品类变更
  onExcludeSkuPrefixesChange: (value: string) => void;
  onExcludeWarehousesChange: (value: string) => void;  // 新增：排除仓库变更
  onMergedModeChange: (value: boolean) => void;
  onHideZeroStockChange?: (value: boolean) => void;
  onHideNormalStatusChange?: (value: boolean) => void;
  onShowNeedSyncChange?: (value: boolean) => void;  // 新增：建议同步变更
  onClearData: () => void;
  filteredData: InventoryItem[];
  isLoading: boolean;
  // 销量检测相关
  isSalesDetectionEnabled?: boolean;
  isSalesLoading?: boolean;
  salesProgress?: string;
  onStartSalesDetection?: () => void;
}

export function InventoryFilters({
  skuFilters,
  categoryFilter,
  categoryFilters = [],
  inventoryData,
  excludeSkuPrefixes,
  excludeWarehouses,
  isMergedMode,
  hideZeroStock = false,
  hideNormalStatus = false,
  showNeedSync = false,
  onSkuFiltersChange,
  onCategoryFilterChange,
  onCategoryFiltersChange,
  onExcludeSkuPrefixesChange,
  onExcludeWarehousesChange,
  onMergedModeChange,
  onHideZeroStockChange,
  onHideNormalStatusChange,
  onShowNeedSyncChange,
  onClearData,
  filteredData,
  isLoading,
  isSalesDetectionEnabled = false,
  isSalesLoading = false,
  salesProgress = '',
  onStartSalesDetection,
}: InventoryFiltersProps) {
  const handleExport = () => {
    if (filteredData.length === 0) {
      return;
    }
    exportToExcel(filteredData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          数据筛选与操作
        </CardTitle>
        <CardDescription>
          筛选库存数据，支持多个SKU用逗号分隔
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="sku-filter">SKU筛选</Label>
            <Input
              id="sku-filter"
              placeholder="输入SKU，多个用逗号分隔"
              value={skuFilters}
              onChange={(e) => onSkuFiltersChange(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="category-filter">品类筛选（多选）</Label>
            <CategoryMultiSelect
              inventoryData={inventoryData}
              selectedCategories={categoryFilters}
              onCategoriesChange={onCategoryFiltersChange || (() => {})}
              placeholder="选择或输入品类..."
            />
          </div>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="exclude-sku-prefixes">排除SKU前缀</Label>
            <Input
              id="exclude-sku-prefixes"
              placeholder="输入要排除的SKU前缀，多个用逗号分隔（如：AK-H，AK-G）"
              value={excludeSkuPrefixes}
              onChange={(e) => onExcludeSkuPrefixesChange(e.target.value)}
              className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
            />
            <p className="text-xs text-muted-foreground mt-1">将从结果中过滤掉以这些前缀开头的产品</p>
          </div>
          <div>
            <Label htmlFor="exclude-warehouses">排除仓库（合并前生效）</Label>
            <Input
              id="exclude-warehouses"
              placeholder="输入要排除的仓库，多个用逗号分隔（如：深圳仓-1，测试仓）"
              value={excludeWarehouses}
              onChange={(e) => onExcludeWarehousesChange(e.target.value)}
              className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900"
              disabled={!isMergedMode}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isMergedMode ? '合并前将排除这些仓库的数据' : '仅在合并模式下生效'}
            </p>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Switch
              id="merge-mode"
              checked={isMergedMode}
              onCheckedChange={onMergedModeChange}
            />
            <Label htmlFor="merge-mode">合并相同SKU的多仓库数据</Label>
          </div>

          {onHideZeroStockChange && (
            <div className="flex items-center space-x-2">
              <Switch
                id="hide-zero-stock"
                checked={hideZeroStock}
                onCheckedChange={onHideZeroStockChange}
              />
              <Label htmlFor="hide-zero-stock">隐藏零库存产品</Label>
            </div>
          )}

          {onHideNormalStatusChange && (
            <div className="flex items-center space-x-2">
              <Switch
                id="hide-normal-status"
                checked={hideNormalStatus}
                onCheckedChange={onHideNormalStatusChange}
              />
              <Label htmlFor="hide-normal-status">隐藏状态正常的产品</Label>
            </div>
          )}

          {onShowNeedSyncChange && (
            <div className="flex items-center space-x-2">
              <Switch
                id="show-need-sync"
                checked={showNeedSync}
                onCheckedChange={onShowNeedSyncChange}
              />
              <Label htmlFor="show-need-sync" className="text-orange-600 font-medium">
                🔄 只显示建议同步的产品
              </Label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={handleExport}
            disabled={filteredData.length === 0 || isLoading}
            variant="outline"
          >
            <Download className="mr-2 h-4 w-4" />
            导出Excel ({filteredData.length}条)
          </Button>
          {isSalesDetectionEnabled && onStartSalesDetection && (
            <Button 
              onClick={onStartSalesDetection}
              disabled={filteredData.length === 0 || isSalesLoading || isLoading}
              variant="default"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              {isSalesLoading ? '检测中...' : `销量检测 (${filteredData.length}个SKU)`}
            </Button>
          )}
          <Button 
            onClick={onClearData}
            disabled={isLoading}
            variant="destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            清空数据
          </Button>
        </div>
        
        {isSalesLoading && salesProgress && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-blue-700">
              <TrendingUp className="h-4 w-4 animate-pulse" />
              <span className="font-medium text-sm">{salesProgress}</span>
            </div>
            {/* 解析进度百分比 */}
            {(() => {
              const percentageMatch = salesProgress.match(/\((\d+)%\)/);
              const percentage = percentageMatch && percentageMatch[1] ? Number.parseInt(percentageMatch[1]) : 0;
              return percentage > 0 ? (
                <div className="space-y-2">
                  <Progress value={percentage} className="h-2" />
                  <div className="text-right text-blue-600 text-xs">{percentage}%</div>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}