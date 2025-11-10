'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown } from 'lucide-react';

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

type MetricType = 'orders' | 'quantity' | 'revenue';

export function SalesTrendOverview({ timeSeries, hasCompare = false }: SalesTrendOverviewProps) {
  const [metricType, setMetricType] = useState<MetricType>('quantity');

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

  // Get metric configuration
  const getMetricConfig = (type: MetricType) => {
    switch (type) {
      case 'orders':
        return {
          label: '订单数',
          currentKey: 'currentOrders',
          compareKey: 'compareOrders',
          color: '#3b82f6', // blue
          compareColor: '#f97316', // orange
          formatter: (value: number) => value.toLocaleString('zh-CN'),
        };
      case 'quantity':
        return {
          label: '销售量',
          currentKey: 'currentQuantity',
          compareKey: 'compareQuantity',
          color: '#10b981', // green
          compareColor: '#f97316', // orange
          formatter: (value: number) => value.toLocaleString('zh-CN'),
        };
      case 'revenue':
        return {
          label: '销售额',
          currentKey: 'currentRevenue',
          compareKey: 'compareRevenue',
          color: '#8b5cf6', // purple
          compareColor: '#f97316', // orange
          formatter: (value: number) => {
            return new Intl.NumberFormat('de-DE', {
              style: 'currency',
              currency: 'EUR',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(value);
          },
        };
    }
  };

  const config = getMetricConfig(metricType);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600">{entry.name}:</span>
            <span className="font-medium">{config.formatter(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Metric Selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={metricType === 'orders' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMetricType('orders')}
          >
            订单数
          </Button>
          <Button
            variant={metricType === 'quantity' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMetricType('quantity')}
          >
            销售量
          </Button>
          <Button
            variant={metricType === 'revenue' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMetricType('revenue')}
          >
            销售额
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="flex gap-4 text-sm">
          <div className="text-right">
            <div className="text-muted-foreground">总计</div>
            <div className="font-medium">
              {metricType === 'orders' && stats.total.orders.toLocaleString('zh-CN')}
              {metricType === 'quantity' && stats.total.quantity.toLocaleString('zh-CN')}
              {metricType === 'revenue' && config.formatter(stats.total.revenue)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-muted-foreground">日均</div>
            <div className="font-medium">
              {metricType === 'orders' && stats.avg.orders.toLocaleString('zh-CN')}
              {metricType === 'quantity' && stats.avg.quantity.toLocaleString('zh-CN')}
              {metricType === 'revenue' && config.formatter(stats.avg.revenue)}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 60 }}
          >
            <defs>
              <linearGradient id={`gradient-${metricType}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={config.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={config.color} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

            <XAxis
              dataKey="date"
              angle={-45}
              textAnchor="end"
              height={60}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
            />

            <YAxis
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              tickFormatter={config.formatter}
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend
              verticalAlign="top"
              height={36}
              iconType="line"
              wrapperStyle={{ paddingBottom: '10px' }}
            />

            {/* Current Period Area + Line */}
            <Area
              type="monotone"
              dataKey={config.currentKey}
              fill={`url(#gradient-${metricType})`}
              stroke="none"
              name={`当前期${config.label}`}
            />
            <Line
              type="monotone"
              dataKey={config.currentKey}
              stroke={config.color}
              strokeWidth={2}
              dot={{ r: 4, fill: config.color }}
              activeDot={{ r: 6 }}
              name={`当前期${config.label}`}
            />

            {/* Compare Period Line (if available) */}
            {hasCompare && (
              <Line
                type="monotone"
                dataKey={config.compareKey}
                stroke={config.compareColor}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: config.compareColor }}
                activeDot={{ r: 5 }}
                name={`对比期${config.label}`}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Growth Indicators (if compare data available) */}
      {hasCompare && (
        <div className="flex items-center gap-4 text-sm pt-2 border-t">
          <span className="text-muted-foreground">整体趋势:</span>
          {metricType === 'orders' && stats.total.orders > 0 && (
            <div className="flex items-center gap-1">
              {chartData[chartData.length - 1]?.growthOrders !== null && (
                <>
                  {(chartData[chartData.length - 1]?.growthOrders ?? 0) >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  <span
                    className={
                      (chartData[chartData.length - 1]?.growthOrders ?? 0) >= 0
                        ? 'text-green-600 font-medium'
                        : 'text-red-600 font-medium'
                    }
                  >
                    {Math.abs(chartData[chartData.length - 1]?.growthOrders ?? 0).toFixed(1)}%
                  </span>
                </>
              )}
            </div>
          )}
          {metricType === 'quantity' && stats.total.quantity > 0 && (
            <div className="flex items-center gap-1">
              {chartData[chartData.length - 1]?.growthQuantity !== null && (
                <>
                  {(chartData[chartData.length - 1]?.growthQuantity ?? 0) >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  <span
                    className={
                      (chartData[chartData.length - 1]?.growthQuantity ?? 0) >= 0
                        ? 'text-green-600 font-medium'
                        : 'text-red-600 font-medium'
                    }
                  >
                    {Math.abs(chartData[chartData.length - 1]?.growthQuantity ?? 0).toFixed(1)}%
                  </span>
                </>
              )}
            </div>
          )}
          {metricType === 'revenue' && stats.total.revenue > 0 && (
            <div className="flex items-center gap-1">
              {chartData[chartData.length - 1]?.growthRevenue !== null && (
                <>
                  {(chartData[chartData.length - 1]?.growthRevenue ?? 0) >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  <span
                    className={
                      (chartData[chartData.length - 1]?.growthRevenue ?? 0) >= 0
                        ? 'text-green-600 font-medium'
                        : 'text-red-600 font-medium'
                    }
                  >
                    {Math.abs(chartData[chartData.length - 1]?.growthRevenue ?? 0).toFixed(1)}%
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
