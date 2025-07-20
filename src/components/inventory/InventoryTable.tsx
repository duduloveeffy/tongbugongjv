import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  calculateNetStock, 
  getStockStatusColor, 
  getSyncButtonColor, 
  getSyncButtonText, 
  type InventoryItem 
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
      <div className="text-center py-8 text-muted-foreground">
        暂无数据，请先上传库存文件
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="relative max-h-[600px] overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 bg-background z-10 shadow-sm border-b">
            <tr className="border-b transition-colors hover:bg-muted/50">
              {isProductDetectionEnabled && (
                <th className="w-12 bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
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
              <th className="min-w-[120px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">产品代码</th>
              <th className="min-w-[200px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">产品名称</th>
              <th className="min-w-[180px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">产品英文名称</th>
              <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">仓库</th>
              <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">可售库存</th>
              <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">净可售库存</th>
              <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">在途数量</th>
              <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">在途库存</th>
              <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">一级品类</th>
              {isSalesDetectionEnabled && (
                <>
                  <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">订单数</th>
                  <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">销售数量</th>
                  <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">30天订单数</th>
                  <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">30天销售数量</th>
                  <th className="min-w-[120px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">预测库存（在途）</th>
                </>
              )}
              {isProductDetectionEnabled && (
                <>
                  <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">上架状态</th>
                  <th className="min-w-[100px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">库存状态</th>
                  <th className="min-w-[120px] bg-background text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">同步操作</th>
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
                <tr key={`${item.产品代码}-${index}`} className="border-b transition-colors hover:bg-muted/50">
                  {isProductDetectionEnabled && (
                    <td className="p-2 align-middle whitespace-nowrap">
                      <Checkbox
                        checked={selectedSkusForSync.has(item.产品代码)}
                        onCheckedChange={(checked) => {
                          onSkuSelectionChange(item.产品代码, checked as boolean);
                        }}
                      />
                    </td>
                  )}
                  <td className="p-2 align-middle whitespace-nowrap font-mono">{item.产品代码}</td>
                  <td className="p-2 align-middle whitespace-nowrap">{item.产品名称}</td>
                  <td className="p-2 align-middle whitespace-nowrap">{item.产品英文名称}</td>
                  <td className="p-2 align-middle whitespace-nowrap">{item.仓库}</td>
                  <td className="p-2 align-middle whitespace-nowrap">{item.可售库存}</td>
                  <td className={`p-2 align-middle whitespace-nowrap ${getStockStatusColor(netStock)}`}>
                    {netStock}
                  </td>
                  <td className="p-2 align-middle whitespace-nowrap">{item.在途数量 || 0}</td>
                  <td className="p-2 align-middle whitespace-nowrap">{item.在途库存 || netStock}</td>
                  <td className="p-2 align-middle whitespace-nowrap">{item.一级品类}</td>
                  {isSalesDetectionEnabled && (
                    <>
                      <td className="p-2 align-middle whitespace-nowrap">
                        <Badge variant={item.salesData?.orderCount ? 'default' : 'secondary'}>
                          {item.salesData?.orderCount || 0}
                        </Badge>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap">
                        <Badge variant={item.salesData?.salesQuantity ? 'default' : 'secondary'}>
                          {item.salesData?.salesQuantity || 0}
                        </Badge>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap">
                        <Badge variant={item.salesData?.orderCount30d ? 'default' : 'secondary'}>
                          {item.salesData?.orderCount30d || 0}
                        </Badge>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap">
                        <Badge variant={item.salesData?.salesQuantity30d ? 'default' : 'secondary'}>
                          {item.salesData?.salesQuantity30d || 0}
                        </Badge>
                      </td>
                      <td className={`p-2 align-middle whitespace-nowrap ${predictedTransitQuantity < 0 ? 'text-red-600 font-medium' : ''}`}>
                        {predictedTransitQuantity}
                      </td>
                    </>
                  )}
                  {isProductDetectionEnabled && (
                    <>
                      <td className="p-2 align-middle whitespace-nowrap">
                        {item.productData ? (
                          <Badge variant={isOnline ? "default" : "secondary"}>
                            {isOnline ? "已上架" : "未上架"}
                          </Badge>
                        ) : (
                          <Badge variant="outline">未检测</Badge>
                        )}
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap">
                        {item.productData?.stockStatus && (
                          <Badge variant="outline">
                            {item.productData.stockStatus}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap">
                        <Button
                          size="sm"
                          disabled={isSyncing || !item.productData}
                          variant={getSyncButtonColor(isOnline, netStock) as any}
                          onClick={() => {
                            const shouldBeInStock = !isOnline || (isOnline && netStock <= 0 ? false : true);
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