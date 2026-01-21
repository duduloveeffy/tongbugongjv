import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Package, ShoppingCart, TrendingUp, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import type { InventoryItem } from '@/lib/inventory-utils';
import { useMemo } from 'react';

interface SalesAnalysisTableProps {
  data: InventoryItem[];
  isLoading: boolean;
}

export function SalesAnalysisTable({ data, isLoading }: SalesAnalysisTableProps) {
  // Calculate sales statistics from inventory data with salesData
  const salesStats = useMemo(() => {
    if (!data || data.length === 0) {
      return null;
    }

    // Filter items with sales data
    const itemsWithSales = data.filter(item => item.salesData && item.salesData.salesQuantityDaysN > 0);

    // Calculate totals
    const totalSales30d = data.reduce((sum, item) => sum + (item.salesData?.salesQuantityDaysN || 0), 0);
    const totalOrders30d = data.reduce((sum, item) => sum + (item.salesData?.orderCountDaysN || 0), 0);

    // Get top selling products
    const topProducts = [...itemsWithSales]
      .sort((a, b) => (b.salesData?.salesQuantityDaysN || 0) - (a.salesData?.salesQuantityDaysN || 0))
      .slice(0, 20);

    // Count SKUs by sales status
    const skusWithSales = itemsWithSales.length;
    const skusWithoutSales = data.length - skusWithSales;

    return {
      totalSKUs: data.length,
      skusWithSales,
      skusWithoutSales,
      totalSales30d,
      totalOrders30d,
      topProducts,
      averageSalesPerSKU: skusWithSales > 0 ? (totalSales30d / skusWithSales).toFixed(1) : '0'
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            销量分析结果
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            正在分析销量数据...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!salesStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            销量分析结果
          </CardTitle>
          <CardDescription>
            请先执行销量检测以获取数据
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getSalesStatus = (item: InventoryItem) => {
    const sales30d = item.salesData?.salesQuantityDaysN || 0;
    const netStock = item.净可售库存 || 0;

    if (sales30d === 0) return { label: '无销量', color: 'secondary' as const };
    if (netStock <= 0) return { label: '缺货', color: 'destructive' as const };
    if (netStock < sales30d) return { label: '库存不足', color: 'outline' as const };
    if (netStock > sales30d * 3) return { label: '库存过多', color: 'default' as const };
    return { label: '正常', color: 'secondary' as const };
  };

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">检测SKU总数</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{salesStats.totalSKUs}</div>
            <p className="text-muted-foreground text-xs">已分析产品</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">有销量SKU</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-green-600">{salesStats.skusWithSales}</div>
            <p className="text-muted-foreground text-xs">
              占比 {((salesStats.skusWithSales / salesStats.totalSKUs) * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">30天总销量</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{salesStats.totalSales30d.toLocaleString()}</div>
            <p className="text-muted-foreground text-xs">所有SKU合计</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">平均销量</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{salesStats.averageSalesPerSKU}</div>
            <p className="text-muted-foreground text-xs">每个有销量SKU</p>
          </CardContent>
        </Card>
      </div>

      {/* 销量状态分布 */}
      <Card>
        <CardHeader>
          <CardTitle>销量状态分布</CardTitle>
          <CardDescription>基于30天销量和当前库存的分析</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              无销量: {salesStats.skusWithoutSales}
            </Badge>
            <Badge variant="destructive">
              缺货: {data.filter(item => (item.salesData?.salesQuantityDaysN || 0) > 0 && (item.净可售库存 || 0) <= 0).length}
            </Badge>
            <Badge variant="outline">
              库存不足: {data.filter(item => {
                const sales = item.salesData?.salesQuantityDaysN || 0;
                const stock = item.净可售库存 || 0;
                return sales > 0 && stock > 0 && stock < sales;
              }).length}
            </Badge>
            <Badge variant="secondary">
              正常: {data.filter(item => {
                const sales = item.salesData?.salesQuantityDaysN || 0;
                const stock = item.净可售库存 || 0;
                return sales > 0 && stock >= sales && stock <= sales * 3;
              }).length}
            </Badge>
            <Badge variant="default">
              库存过多: {data.filter(item => {
                const sales = item.salesData?.salesQuantityDaysN || 0;
                const stock = item.净可售库存 || 0;
                return sales > 0 && stock > sales * 3;
              }).length}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* 热销产品排行 */}
      {salesStats.topProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>热销产品排行 (Top 20)</CardTitle>
            <CardDescription>按30天销量排序</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">排名</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>产品名称</TableHead>
                  <TableHead className="text-right">30天销量</TableHead>
                  <TableHead className="text-right">30天订单数</TableHead>
                  <TableHead className="text-right">净可售库存</TableHead>
                  <TableHead className="text-right">库存可售天数</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesStats.topProducts.map((item, index) => {
                  const status = getSalesStatus(item);
                  const dailySales = (item.salesData?.salesQuantityDaysN || 0) / 30;
                  const stockDays = dailySales > 0 ? Math.floor((item.净可售库存 || 0) / dailySales) : 999;

                  return (
                    <TableRow key={item.产品代码}>
                      <TableCell className="font-medium">#{index + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{item.产品代码}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={item.产品名称}>
                        {item.产品名称}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {item.salesData?.salesQuantityDaysN || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.salesData?.orderCountDaysN || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.净可售库存 || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {stockDays > 365 ? '365+' : stockDays}天
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.color}>
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 无销量产品提示 */}
      {salesStats.skusWithoutSales > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <AlertCircle className="h-5 w-5" />
              无销量产品提示
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-orange-800">
              共有 <strong>{salesStats.skusWithoutSales}</strong> 个SKU在过去30天内没有销量记录。
              这些产品可能需要：
            </p>
            <ul className="mt-2 space-y-1 text-sm text-orange-700">
              <li>• 检查是否为新上架产品</li>
              <li>• 确认SKU编码是否正确</li>
              <li>• 评估是否需要促销活动</li>
              <li>• 考虑是否下架处理</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}