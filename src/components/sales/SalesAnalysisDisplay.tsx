import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Package, ShoppingCart, TrendingUp, RefreshCw } from 'lucide-react';

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
  onRefresh?: () => void;
}

export function SalesAnalysisDisplay({ salesAnalysis, isLoading, onRefresh }: SalesAnalysisDisplayProps) {
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
          <div className="py-4 text-center text-muted-foreground">
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                销量分析
              </CardTitle>
              <CardDescription className="mt-2">
                暂无销量数据，请先获取订单数据
              </CardDescription>
            </div>
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                加载Supabase数据
              </Button>
            )}
          </div>
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
      {/* 刷新按钮 */}
      {onRefresh && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
        </div>
      )}
      
      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">总订单数</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{salesAnalysis.totalOrders.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">总收入</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">€{salesAnalysis.totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">平均订单价值</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">€{salesAnalysis.averageOrderValue.toFixed(2)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">热销产品</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{salesAnalysis.topProducts.length}</div>
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