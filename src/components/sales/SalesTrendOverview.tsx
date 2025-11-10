'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface TimeSeriesItem {
  date: string;
  // Without compare period
  orders?: number;
  quantity?: number;
  revenue?: number;
  // With compare period
  current?: {
    orders: number;
    quantity: number;
    revenue: number;
  };
  compare?: {
    orders: number;
    quantity: number;
    revenue: number;
  };
  growth?: {
    orders: string | null;
    quantity: string | null;
    revenue: string | null;
  };
}

interface SalesTrendOverviewProps {
  timeSeries: TimeSeriesItem[];
  hasCompare?: boolean;
}

interface VisibleMetrics {
  orders: boolean;
  quantity: boolean;
  revenue: boolean;
}

export function SalesTrendOverview({ timeSeries, hasCompare = false }: SalesTrendOverviewProps) {
  // 控制三个指标的显示/隐藏，默认全部显示
  const [visibleMetrics, setVisibleMetrics] = useState<VisibleMetrics>({
    orders: true,
    quantity: true,
    revenue: true,
  });

  // Transform data for chart
  const chartData = useMemo(() => {
    return timeSeries.map(item => {
      if (hasCompare && item.current && item.compare) {
        // With compare period
        return {
          date: item.date,
          currentOrders: item.current.orders,
          currentQuantity: item.current.quantity,
          currentRevenue: item.current.revenue,
          compareOrders: item.compare.orders,
          compareQuantity: item.compare.quantity,
          compareRevenue: item.compare.revenue,
          growthOrders: item.growth?.orders ? parseFloat(item.growth.orders) : null,
          growthQuantity: item.growth?.quantity ? parseFloat(item.growth.quantity) : null,
          growthRevenue: item.growth?.revenue ? parseFloat(item.growth.revenue) : null,
        };
      } else {
        // Without compare period
        return {
          date: item.date,
          currentOrders: item.orders ?? 0,
          currentQuantity: item.quantity ?? 0,
          currentRevenue: item.revenue ?? 0,
        };
      }
    });
  }, [timeSeries, hasCompare]);

  // Calculate summary statistics
  const stats = useMemo(() => {
    const total = chartData.reduce((acc, item) => {
      acc.orders += item.currentOrders;
      acc.quantity += item.currentQuantity;
      acc.revenue += item.currentRevenue;
      return acc;
    }, { orders: 0, quantity: 0, revenue: 0 });

    const avg = {
      orders: Math.round(total.orders / chartData.length),
      quantity: Math.round(total.quantity / chartData.length),
      revenue: Math.round(total.revenue / chartData.length),
    };

    return { total, avg };
  }, [chartData]);

  // Currency formatter
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Number formatter
  const formatNumber = (value: number) => {
    return value.toLocaleString('zh-CN');
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => {
          // Determine formatter based on dataKey
          const isRevenue = entry.dataKey.includes('Revenue');
          const formatter = isRevenue ? formatCurrency : formatNumber;

          return (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-600">{entry.name}:</span>
              <span className="font-medium">{formatter(entry.value)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Handle checkbox change
  const handleMetricToggle = (metric: keyof VisibleMetrics, checked: boolean) => {
    setVisibleMetrics(prev => ({ ...prev, [metric]: checked }));
  };

  return (
    <div className="space-y-4">
      {/* Controls and Stats */}
      <div className="flex items-start justify-between gap-4">
        {/* Metric Visibility Controls */}
        <div className="flex flex-col gap-3">
          <Label className="text-sm font-medium">显示指标：</Label>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="metric-orders"
                checked={visibleMetrics.orders}
                onCheckedChange={(checked) => handleMetricToggle('orders', !!checked)}
              />
              <Label
                htmlFor="metric-orders"
                className="text-sm font-normal cursor-pointer flex items-center gap-2"
              >
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                订单数
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="metric-quantity"
                checked={visibleMetrics.quantity}
                onCheckedChange={(checked) => handleMetricToggle('quantity', !!checked)}
              />
              <Label
                htmlFor="metric-quantity"
                className="text-sm font-normal cursor-pointer flex items-center gap-2"
              >
                <div className="w-3 h-3 rounded-full bg-green-500" />
                销售量
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="metric-revenue"
                checked={visibleMetrics.revenue}
                onCheckedChange={(checked) => handleMetricToggle('revenue', !!checked)}
              />
              <Label
                htmlFor="metric-revenue"
                className="text-sm font-normal cursor-pointer flex items-center gap-2"
              >
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                销售额
              </Label>
            </div>
          </div>
        </div>

        {/* Summary Stats - Grid Layout */}
        <div className="grid grid-cols-3 gap-6 text-sm">
          {/* Orders */}
          <div className="text-center">
            <div className="text-muted-foreground mb-1">订单数</div>
            <div className="font-bold text-lg">{formatNumber(stats.total.orders)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              平均 {formatNumber(stats.avg.orders)}
            </div>
          </div>

          {/* Quantity */}
          <div className="text-center">
            <div className="text-muted-foreground mb-1">销售量</div>
            <div className="font-bold text-lg">{formatNumber(stats.total.quantity)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              平均 {formatNumber(stats.avg.quantity)}
            </div>
          </div>

          {/* Revenue */}
          <div className="text-center">
            <div className="text-muted-foreground mb-1">销售额</div>
            <div className="font-bold text-lg">{formatCurrency(stats.total.revenue)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              平均 {formatCurrency(stats.avg.revenue)}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 60, left: 10, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

            <XAxis
              dataKey="date"
              angle={-45}
              textAnchor="end"
              height={60}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
            />

            {/* Left Y-Axis: Orders & Quantity */}
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              tickFormatter={formatNumber}
              label={{
                value: '订单数 / 销售量',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 12 },
              }}
            />

            {/* Right Y-Axis: Revenue */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              tickFormatter={formatCurrency}
              label={{
                value: '销售额',
                angle: 90,
                position: 'insideRight',
                style: { fontSize: 12 },
              }}
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend
              verticalAlign="top"
              height={36}
              iconType="line"
              wrapperStyle={{ paddingBottom: '10px' }}
            />

            {/* ========== Current Period Lines ========== */}

            {/* Orders - Blue */}
            {visibleMetrics.orders && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="currentOrders"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4, fill: '#3b82f6' }}
                activeDot={{ r: 6 }}
                name="当前期订单数"
              />
            )}

            {/* Quantity - Green */}
            {visibleMetrics.quantity && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="currentQuantity"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 4, fill: '#10b981' }}
                activeDot={{ r: 6 }}
                name="当前期销售量"
              />
            )}

            {/* Revenue - Purple (Right Axis) */}
            {visibleMetrics.revenue && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="currentRevenue"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 4, fill: '#8b5cf6' }}
                activeDot={{ r: 6 }}
                name="当前期销售额"
              />
            )}

            {/* ========== Compare Period Lines (Dashed) ========== */}

            {hasCompare && visibleMetrics.orders && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="compareOrders"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: '#f97316' }}
                activeDot={{ r: 5 }}
                name="对比期订单数"
              />
            )}

            {hasCompare && visibleMetrics.quantity && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="compareQuantity"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: '#f97316' }}
                activeDot={{ r: 5 }}
                name="对比期销售量"
              />
            )}

            {hasCompare && visibleMetrics.revenue && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="compareRevenue"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: '#f97316' }}
                activeDot={{ r: 5 }}
                name="对比期销售额"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Note about dual Y-axis */}
      <div className="text-xs text-muted-foreground text-center pt-2 border-t">
        💡 提示：图表使用双Y轴 —— 左侧显示订单数和销售量，右侧显示销售额（单位：欧元）
      </div>
    </div>
  );
}
