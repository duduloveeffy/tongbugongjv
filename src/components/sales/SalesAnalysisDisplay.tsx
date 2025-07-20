import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Package, DollarSign, ShoppingCart } from 'lucide-react';

interface SalesAnalysis {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  topProducts: Array<{
    sku: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  ordersByStatus: Record<string, number>;
  dailySales: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
}

interface SalesAnalysisDisplayProps {
  salesAnalysis: SalesAnalysis | null;
  isLoading: boolean;
}

export function SalesAnalysisDisplay({ salesAnalysis, isLoading }: SalesAnalysisDisplayProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            销量分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            正在分析销量数据...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!salesAnalysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            销量分析
          </CardTitle>
          <CardDescription>
            暂无销量数据，请先获取订单数据
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const statusLabels: Record<string, string> = {
    completed: '已完成',
    processing: '处理中',
    pending: '待支付',
    'on-hold': '暂停',
    cancelled: '已取消',
    refunded: '已退款',
    failed: '失败',
  };

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总订单数</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesAnalysis.totalOrders.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总收入</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{salesAnalysis.totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均订单价值</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{salesAnalysis.averageOrderValue.toFixed(2)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">热销产品</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesAnalysis.topProducts.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* 订单状态分布 */}
      <Card>
        <CardHeader>
          <CardTitle>订单状态分布</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(salesAnalysis.ordersByStatus).map(([status, count]) => (
              <Badge key={status} variant="outline" className="px-3 py-1">
                {statusLabels[status] || status}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 热销产品排行 */}
      <Card>
        <CardHeader>
          <CardTitle>热销产品排行 (Top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>排名</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>产品名称</TableHead>
                <TableHead>销量</TableHead>
                <TableHead>收入</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesAnalysis.topProducts.slice(0, 10).map((product, index) => (
                <TableRow key={product.sku}>
                  <TableCell className="font-medium">#{index + 1}</TableCell>
                  <TableCell className="font-mono">{product.sku}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.quantity}</TableCell>
                  <TableCell>€{product.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 每日销量趋势 */}
      {salesAnalysis.dailySales.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>每日销量趋势 (最近7天)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>订单数</TableHead>
                  <TableHead>收入</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesAnalysis.dailySales.slice(-7).map((day) => (
                  <TableRow key={day.date}>
                    <TableCell>{day.date}</TableCell>
                    <TableCell>{day.orders}</TableCell>
                    <TableCell>€{day.revenue.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}