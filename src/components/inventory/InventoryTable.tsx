import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  type InventoryItem, 
  calculateNetStock, 
  getStockStatusColor, 
  getSyncButtonColor, 
  getSyncButtonText 
} from '@/lib/inventory-utils';

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
              <th className={`sticky ${isProductDetectionEnabled ? 'left-12' : 'left-0'} z-30 h-10 min-w-[120px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                产品代码
              </th>
              <th className={`sticky ${isProductDetectionEnabled ? 'left-[168px]' : 'left-[120px]'} z-30 h-10 min-w-[200px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                产品名称
              </th>
              <th className="h-10 min-w-[180px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">产品英文名称</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">仓库</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">可售库存</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">净可售库存</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">在途数量</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">在途库存</th>
              <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">一级品类</th>
              {isSalesDetectionEnabled && (
                <>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">订单数</th>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">销售数量</th>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">30天订单数</th>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">30天销售数量</th>
                  <th className="h-10 min-w-[120px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">预测库存（在途）</th>
                </>
              )}
              {isProductDetectionEnabled && (
                <>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">上架状态</th>
                  <th className="h-10 min-w-[100px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">库存状态</th>
                  <th className="h-10 min-w-[120px] whitespace-nowrap bg-background px-2 text-left align-middle font-medium text-foreground">同步操作</th>
                </>
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
              
              return (
                <tr key={`${item.产品代码}-${index}`} className="group border-b transition-colors hover:bg-muted/50">
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
                    {item.产品代码}
                  </td>
                  <td className={`sticky ${isProductDetectionEnabled ? 'left-[168px]' : 'left-[120px]'} z-10 whitespace-nowrap bg-background p-2 align-middle shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-muted/50`}>
                    {item.产品名称}
                  </td>
                  <td className="whitespace-nowrap p-2 align-middle">{item.产品英文名称}</td>
                  <td className="whitespace-nowrap p-2 align-middle">{item.仓库}</td>
                  <td className="whitespace-nowrap p-2 align-middle">{item.可售库存}</td>
                  <td className={`whitespace-nowrap p-2 align-middle ${getStockStatusColor(netStock)}`}>
                    {netStock}
                  </td>
                  <td className="whitespace-nowrap p-2 align-middle">{item.在途数量 || 0}</td>
                  <td className="whitespace-nowrap p-2 align-middle">{item.在途库存 || netStock}</td>
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
                          variant={getSyncButtonColor(isOnline, netStock) as any}
                          onClick={() => {
                            const shouldBeInStock = !isOnline || (!(isOnline && netStock <= 0 ));
                            onSyncSku(item.产品代码, shouldBeInStock);
                          }}
                        >
                          {isSyncing ? '同步中...' : getSyncButtonText(isOnline, netStock)}
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}