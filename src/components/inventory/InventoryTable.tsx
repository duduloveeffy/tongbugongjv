import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  type InventoryItem, 
  calculateNetStock, 
  getStockStatusColor, 
  getSyncButtonColor, 
  getSyncButtonText 
} from '@/lib/inventory-utils';
import { type SortConfig, type SortField, useInventoryStore } from '@/store/inventory';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useState, lazy, Suspense } from 'react';

// 懒加载趋势图组件
const SalesTrendChart = lazy(() => 
  import('@/components/sales/SalesTrendChart').then(mod => ({ default: mod.SalesTrendChart }))
);

// 导入简单趋势指示器
import { SimpleTrendIndicator } from '@/components/sales/SimpleTrendIndicator';

interface InventoryTableProps {
  data: InventoryItem[];
  selectedSkusForSync: Set<string>;
  syncingSkus: Set<string>;
  onSkuSelectionChange: (sku: string, checked: boolean) => void;
  onSyncSku: (sku: string, shouldBeInStock: boolean) => void;
  isProductDetectionEnabled: boolean;
  isSalesDetectionEnabled: boolean;
}

export function InventoryTable({
  data,
  selectedSkusForSync,
  syncingSkus,
  onSkuSelectionChange,
  onSyncSku,
  isProductDetectionEnabled,
  isSalesDetectionEnabled,
}: InventoryTableProps) {
  const { sortConfig, setSortConfig } = useInventoryStore();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  const handleSort = (field: SortField) => {
    if (sortConfig?.field === field) {
      // 切换排序方向
      setSortConfig({
        field,
        direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'
      });
    } else {
      // 新的排序字段
      setSortConfig({
        field,
        direction: 'desc'
      });
    }
  };
  
  const toggleRowExpansion = (sku: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(sku)) {
      newExpanded.delete(sku);
    } else {
      newExpanded.add(sku);
    }
    setExpandedRows(newExpanded);
  };
  
  const getSortIcon = (field: SortField) => {
    if (sortConfig?.field !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4" />
      : <ArrowDown className="ml-2 h-4 w-4" />;
  };
  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        暂无数据，请先上传库存文件
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="relative max-h-[600px] overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-20 border-b bg-background shadow-sm">
            <tr className="border-b transition-colors hover:bg-muted/50">
              {isProductDetectionEnabled && (
                <th className="sticky left-0 z-30 h-10 w-12 whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  <Checkbox
                    checked={data.length > 0 && data.every(item => selectedSkusForSync.has(item.产品代码))}
                    onCheckedChange={(checked) => {
                      data.forEach(item => {
                        onSkuSelectionChange(item.产品代码, checked as boolean);
                      });
                    }}
                  />
                </th>
              )}
              <th className={`sticky ${isProductDetectionEnabled ? 'left-12' : 'left-0'} z-30 h-10 min-w-[120px] whitespace-nowrap bg-background px-0 text-left align-middle font-medium text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                <Button
                  variant="ghost"
                  className="h-full w-full justify-start px-2 font-medium"
                  onClick={() => handleSort('产品代码')}
                >
                  产品代码
                  {getSortIcon('产品代码')}
                </Button>
              </th>
              <th className={`sticky ${isProductDetectionEnabled ? 'left-[168px]' : 'left-[120px]'} z-30 h-10 min-w-[200px] whitespace-nowrap bg-background px-0 text-left align-middle font-medium text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                <Button
                  variant="ghost"
                  className="h-full w-full justify-start px-2 font-medium"
                  onClick={() => handleSort('产品名称')}
                >
                  产品名称
                  {getSortIcon('产品名称')}
                </Button>
              </th>
              <th className="h-10 min-w-[180px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">产品英文名称</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">仓库</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">可售库存</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-0 text-left align-middle font-medium text-foreground">
                <Button
                  variant="ghost"
                  className="h-full w-full justify-start px-2 font-medium"
                  onClick={() => handleSort('净可售库存')}
                >
                  净可售库存
                  {getSortIcon('净可售库存')}
                </Button>
              </th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">在途数量</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-0 text-left align-middle font-medium text-foreground">
                <Button
                  variant="ghost"
                  className="h-full w-full justify-start px-2 font-medium"
                  onClick={() => handleSort('在途库存')}
                >
                  在途库存
                  {getSortIcon('在途库存')}
                </Button>
              </th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">一级品类</th>
              {isSalesDetectionEnabled && (
                <>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-0 text-left align-middle font-medium text-foreground">
                    <Button
                      variant="ghost"
                      className="h-full w-full justify-start px-2 font-medium"
                      onClick={() => handleSort('订单数')}
                    >
                      订单数
                      {getSortIcon('订单数')}
                    </Button>
                  </th>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-0 text-left align-middle font-medium text-foreground">
                    <Button
                      variant="ghost"
                      className="h-full w-full justify-start px-2 font-medium"
                      onClick={() => handleSort('销售数量')}
                    >
                      销售数量
                      {getSortIcon('销售数量')}
                    </Button>
                  </th>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-0 text-left align-middle font-medium text-foreground">
                    <Button
                      variant="ghost"
                      className="h-full w-full justify-start px-2 font-medium"
                      onClick={() => handleSort('30天订单数')}
                    >
                      30天订单数
                      {getSortIcon('30天订单数')}
                    </Button>
                  </th>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-0 text-left align-middle font-medium text-foreground">
                    <Button
                      variant="ghost"
                      className="h-full w-full justify-start px-2 font-medium"
                      onClick={() => handleSort('30天销售数量')}
                    >
                      30天销售数量
                      {getSortIcon('30天销售数量')}
                    </Button>
                  </th>
                  <th className="h-10 min-w-[120px] whitespace-nowrap bg-background px-0 text-left align-middle font-medium text-foreground">
                    <Button
                      variant="ghost"
                      className="h-full w-full justify-start px-2 font-medium"
                      onClick={() => handleSort('预测库存（在途）')}
                    >
                      预测库存（在途）
                      {getSortIcon('预测库存（在途）')}
                    </Button>
                  </th>
                </>
              )}
              {isProductDetectionEnabled && (
                <>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">上架状态</th>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">库存状态</th>
                  <th className="h-10 min-w-[120px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">同步操作</th>
                </>
              )}
              {/* 趋势缩略图列 */}
              {isSalesDetectionEnabled && (
                <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">趋势</th>
              )}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {data.map((item, index) => {
              const netStock = calculateNetStock(item);
              const isOnline = item.productData?.isOnline || false;
              const isSyncing = syncingSkus.has(item.产品代码);
              const sales30d = item.salesData?.salesQuantity30d || 0;
              const transitStock = item.在途库存 || netStock;
              const predictedTransitQuantity = transitStock - sales30d;
              const isExpanded = expandedRows.has(item.产品代码);
              
              return (
                <React.Fragment key={`${item.产品代码}-${index}`}>
                  <tr className="group border-b transition-colors hover:bg-muted/50">
                  {isProductDetectionEnabled && (
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-background p-2 align-middle shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-muted/50">
                      <Checkbox
                        checked={selectedSkusForSync.has(item.产品代码)}
                        onCheckedChange={(checked) => {
                          onSkuSelectionChange(item.产品代码, checked as boolean);
                        }}
                      />
                    </td>
                  )}
                  <td className={`sticky ${isProductDetectionEnabled ? 'left-12' : 'left-0'} z-10 whitespace-nowrap bg-background p-2 align-middle font-mono shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-muted/50`}>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => toggleRowExpansion(item.产品代码)}
                        title="展开销售趋势图"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                      {item.产品代码}
                    </div>
                  </td>
                  <td className={`sticky ${isProductDetectionEnabled ? 'left-[168px]' : 'left-[120px]'} z-10 whitespace-nowrap bg-background p-2 align-middle shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-muted/50`}>
                    {item.产品名称}
                  </td>
                  <td className="whitespace-nowrap p-2 align-middle">{item.产品英文名称}</td>
                  <td className="whitespace-nowrap p-2 align-middle">
                    {item.warehouseDetails && item.warehouseDetails.length > 1 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted">{item.仓库}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <div className="space-y-1">
                              <p className="font-semibold mb-2">全部仓库：</p>
                              {item.warehouseDetails.map((detail, idx) => (
                                <div key={idx} className="text-sm">
                                  {detail.warehouse}
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      item.仓库
                    )}
                  </td>
                  <td className="whitespace-nowrap p-2 align-middle">
                    {item.warehouseDetails && item.warehouseDetails.length > 0 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted">{item.可售库存}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <div className="space-y-1">
                              <p className="font-semibold mb-2">仓库库存明细：</p>
                              {item.warehouseDetails.map((detail, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                  <span>{detail.warehouse}：</span>
                                  <span className="ml-4">可售 {detail.sellableStock}</span>
                                </div>
                              ))}
                              <div className="border-t mt-2 pt-2 font-semibold flex justify-between">
                                <span>合计：</span>
                                <span>{item.可售库存}</span>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      item.可售库存
                    )}
                  </td>
                  <td className={`whitespace-nowrap p-2 align-middle ${getStockStatusColor(netStock)}`}>
                    {item.warehouseDetails && item.warehouseDetails.length > 0 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted">{netStock}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <div className="space-y-1">
                              <p className="font-semibold mb-2">仓库净可售明细：</p>
                              {item.warehouseDetails.map((detail, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                  <span>{detail.warehouse}：</span>
                                  <span className={`ml-4 ${getStockStatusColor(detail.netStock)}`}>
                                    净可售 {detail.netStock}
                                  </span>
                                </div>
                              ))}
                              <div className="border-t mt-2 pt-2 font-semibold flex justify-between">
                                <span>合计：</span>
                                <span className={getStockStatusColor(netStock)}>{netStock}</span>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      netStock
                    )}
                  </td>
                  <td className="whitespace-nowrap p-2 align-middle" title={`SKU: ${item.产品代码}`}>
                    {item.在途数量 || 0}
                  </td>
                  <td className="whitespace-nowrap p-2 align-middle" title={`净可售: ${netStock} + 在途: ${item.在途数量 || 0}`}>
                    {item.在途库存 || netStock}
                  </td>
                  <td className="whitespace-nowrap p-2 align-middle">{item.一级品类}</td>
                  {isSalesDetectionEnabled && (
                    <>
                      <td className="whitespace-nowrap p-2 align-middle">
                        <Badge variant={item.salesData?.orderCount ? 'default' : 'secondary'}>
                          {item.salesData?.orderCount || 0}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap p-2 align-middle">
                        <Badge variant={item.salesData?.salesQuantity ? 'default' : 'secondary'}>
                          {item.salesData?.salesQuantity || 0}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap p-2 align-middle">
                        <Badge variant={item.salesData?.orderCount30d ? 'default' : 'secondary'}>
                          {item.salesData?.orderCount30d || 0}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap p-2 align-middle">
                        <Badge variant={item.salesData?.salesQuantity30d ? 'default' : 'secondary'}>
                          {item.salesData?.salesQuantity30d || 0}
                        </Badge>
                      </td>
                      <td className={`whitespace-nowrap p-2 align-middle ${predictedTransitQuantity < 0 ? "font-medium text-red-600" : ''}`}>
                        {predictedTransitQuantity}
                      </td>
                    </>
                  )}
                  {isProductDetectionEnabled && (
                    <>
                      <td className="whitespace-nowrap p-2 align-middle">
                        {item.productData ? (
                          <Badge variant={isOnline ? "default" : "secondary"}>
                            {isOnline ? "已上架" : "未上架"}
                          </Badge>
                        ) : (
                          <Badge variant="outline">未检测</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-2 align-middle">
                        {item.productData?.stockStatus && (
                          <Badge variant="outline">
                            {item.productData.stockStatus}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-2 align-middle">
                        <Button
                          size="sm"
                          disabled={isSyncing || !item.productData}
                          variant={getSyncButtonColor(isOnline, netStock, item.productData?.stockStatus) as any}
                          onClick={() => {
                            // 根据当前库存状态切换：如果当前是有货(instock)则切换为无货，反之亦然
                            const currentStockStatus = item.productData?.stockStatus || 'outofstock';
                            const shouldBeInStock = currentStockStatus === 'outofstock';
                            onSyncSku(item.产品代码, shouldBeInStock);
                          }}
                        >
                          {isSyncing ? '同步中...' : getSyncButtonText(isOnline, netStock, item.productData?.stockStatus)}
                        </Button>
                      </td>
                    </>
                  )}
                  {/* 趋势指示器 */}
                  {isSalesDetectionEnabled && (
                    <td className="whitespace-nowrap p-2 align-middle">
                      <SimpleTrendIndicator 
                        sku={item.产品代码}
                        salesData={item.salesData}
                        onClick={() => toggleRowExpansion(item.产品代码)}
                      />
                    </td>
                  )}
                </tr>
                {/* 展开的趋势图行 */}
                {isExpanded && (
                  <tr>
                    <td colSpan={20} className="p-4 border-b bg-muted/20">
                      <Suspense 
                        fallback={
                          <div className="flex items-center justify-center h-96">
                            <Loader2 className="h-8 w-8 animate-spin" />
                          </div>
                        }
                      >
                        <SalesTrendChart 
                          sku={item.产品代码}
                          category={item.一级品类}
                          onClose={() => toggleRowExpansion(item.产品代码)}
                        />
                      </Suspense>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}