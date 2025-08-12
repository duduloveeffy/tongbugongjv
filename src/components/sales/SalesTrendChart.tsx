'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrendingUp, TrendingDown, Minus, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface SalesTrendChartProps {
  sku: string;
  category?: string;
  onClose?: () => void;
}

interface TrendData {
  period_date: string;
  period_label: string;
  sku_sales?: number;
  sku_orders?: number;
  category_sales?: number;
  category_orders?: number;
}

type Period = 'day' | 'week' | 'month';
type TimeRange = 7 | 30 | 90 | 180 | 365;
type MetricType = 'orders' | 'sales';

export function SalesTrendChart({ sku, category, onClose }: SalesTrendChartProps) {
  const [period, setPeriod] = useState<Period>('day');
  const [timeRange, setTimeRange] = useState<TimeRange>(30);
  const [showCategory, setShowCategory] = useState(true);
  const [metricType, setMetricType] = useState<MetricType>('orders');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skuData, setSkuData] = useState<any>(null);
  const [categoryData, setCategoryData] = useState<any>(null);
  const [skuInfo, setSkuInfo] = useState<any>(null);

  // 加载数据
  useEffect(() => {
    loadData();
  }, [sku, category, period, timeRange]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 并行请求SKU趋势和品类趋势
      const [skuResponse, categoryResponse, infoResponse] = await Promise.all([
        // SKU趋势
        fetch('/api/sales/trends/sku', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku,
            period,
            daysBack: timeRange,
          }),
        }),
        // 品类趋势（如果有品类）
        category
          ? fetch('/api/sales/trends/category', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                category,
                period,
                daysBack: timeRange,
              }),
            })
          : Promise.resolve(null),
        // SKU信息和排名
        fetch(`/api/sales/trends/sku?sku=${sku}`),
      ]);

      if (!skuResponse.ok) {
        throw new Error('Failed to fetch SKU trends');
      }

      const skuResult = await skuResponse.json();
      setSkuData(skuResult.data);

      const infoResult = await infoResponse.json();
      if (infoResult.success) {
        setSkuInfo(infoResult.data);
      }

      if (categoryResponse && categoryResponse.ok) {
        const categoryResult = await categoryResponse.json();
        setCategoryData(categoryResult.data);
      }
    } catch (err: any) {
      console.error('Failed to load trend data:', err);
      setError(err.message || 'Failed to load data');
      toast.error('加载趋势数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 合并SKU和品类数据
  const chartData = useMemo(() => {
    if (!skuData?.trends) return [];

    const data = skuData.trends.map((point: any) => {
      const result: TrendData = {
        period_date: point.period_date,
        period_label: point.period_label,
        sku_sales: point.sales_quantity,
        sku_orders: point.order_count,
      };

      // 添加品类数据
      if (showCategory && categoryData?.trends) {
        const categoryPoint = categoryData.trends.find(
          (cp: any) => cp.period_date === point.period_date
        );
        if (categoryPoint) {
          result.category_sales = categoryPoint.sales_quantity; // 不缩放品类数据
          result.category_orders = categoryPoint.order_count;
        }
      }

      return result;
    });

    return data;
  }, [skuData, categoryData, showCategory]);

  // 渲染趋势图标
  const renderTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-500">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            SKU {sku} 销售趋势
            {skuData?.stats && renderTrendIcon(skuData.stats.trend)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* 时间维度选择 */}
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">按天</SelectItem>
                <SelectItem value="week">按周</SelectItem>
                <SelectItem value="month">按月</SelectItem>
              </SelectContent>
            </Select>

            {/* 时间范围选择 */}
            <Select
              value={String(timeRange)}
              onValueChange={(v) => setTimeRange(Number(v) as TimeRange)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7天</SelectItem>
                <SelectItem value="30">30天</SelectItem>
                <SelectItem value="90">3个月</SelectItem>
                <SelectItem value="180">6个月</SelectItem>
                <SelectItem value="365">1年</SelectItem>
              </SelectContent>
            </Select>

            {/* 指标类型切换 */}
            <div className="flex rounded-md shadow-sm">
              <Button
                variant={metricType === 'orders' ? 'default' : 'outline'}
                size="sm"
                className="rounded-r-none"
                onClick={() => setMetricType('orders')}
              >
                订单数
              </Button>
              <Button
                variant={metricType === 'sales' ? 'default' : 'outline'}
                size="sm"
                className="rounded-l-none"
                onClick={() => setMetricType('sales')}
              >
                销售数量
              </Button>
            </div>

            {/* 品类对比开关 */}
            {category && (
              <Button
                variant={showCategory ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowCategory(!showCategory)}
              >
                {showCategory ? '隐藏' : '显示'}品类对比
              </Button>
            )}

            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                关闭
              </Button>
            )}
          </div>
        </div>

        {/* 统计信息 */}
        <div className="flex gap-4 mt-4">
          {skuData?.stats && (
            <>
              <Badge variant="secondary">
                总销量: {skuData.stats.totalSales}
              </Badge>
              <Badge variant="secondary">
                总订单: {skuData.stats.totalOrders}
              </Badge>
              <Badge variant="secondary">
                日均: {skuData.stats.avgDailySales}
              </Badge>
            </>
          )}
          {skuInfo?.rank && (
            <>
              <Badge variant="outline">
                品类排名: {skuInfo.rank.category_rank}/{skuInfo.rank.total_skus_in_category}
              </Badge>
              <Badge variant="outline">
                百分位: {skuInfo.rank.percentile}%
              </Badge>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="period_label"
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              yAxisId="left" 
              label={{ 
                value: showCategory ? (metricType === 'orders' ? `${category}订单数` : `${category}销售数量`) : '数量', 
                angle: -90, 
                position: 'insideLeft' 
              }} 
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              label={{ 
                value: metricType === 'orders' ? 'SKU订单数' : 'SKU销售数量', 
                angle: 90, 
                position: 'insideRight' 
              }}
            />
            <Tooltip />
            <Legend />

            {/* 根据指标类型显示不同的数据 */}
            {metricType === 'orders' ? (
              <>
                {/* SKU订单线 - 右Y轴 */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="sku_orders"
                  stroke="#8884d8"
                  strokeWidth={2}
                  name="SKU订单数"
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />

                {/* 品类订单线 - 左Y轴 */}
                {showCategory && category && (
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="category_orders"
                    stroke="#ffc658"
                    fill="#ffc658"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    name={`${category}订单数`}
                  />
                )}
              </>
            ) : (
              <>
                {/* SKU销售数量线 - 右Y轴 */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="sku_sales"
                  stroke="#82ca9d"
                  strokeWidth={2}
                  name="SKU销售数量"
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />

                {/* 品类销售数量线 - 左Y轴 */}
                {showCategory && category && (
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="category_sales"
                    stroke="#ff7300"
                    fill="#ff7300"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    name={`${category}销售数量`}
                  />
                )}
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* 品类对比说明 - 已移除，不再需要缩放说明 */}
      </CardContent>
    </Card>
  );
}