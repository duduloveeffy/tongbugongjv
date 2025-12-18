'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { LineChartIcon, BarChart3 } from 'lucide-react';

interface DailyTrend {
  date: string;
  orders: number;
  quantity: number;
  revenue: number;
}

type BrandVariant = 'default' | 'vapsolo' | 'spacexvape' | 'other';

interface DailyTrendChartProps {
  currentData: DailyTrend[];
  previousData: DailyTrend[];
  title?: string;
  variant?: BrandVariant;
  /** 是否为紧凑模式（减少高度） */
  compact?: boolean;
}

const variantStyles: Record<BrandVariant, { border: string; titleColor: string; primaryColor: string }> = {
  default: { border: '', titleColor: '', primaryColor: '#8884d8' },
  vapsolo: { border: 'border-l-4 border-l-blue-500', titleColor: 'text-blue-700', primaryColor: '#3b82f6' },
  spacexvape: { border: 'border-l-4 border-l-green-500', titleColor: 'text-green-700', primaryColor: '#10b981' },
  other: { border: 'border-l-4 border-l-amber-500', titleColor: 'text-amber-700', primaryColor: '#f59e0b' },
};

export function DailyTrendChart({
  currentData,
  previousData,
  title = '日趋势对比',
  variant = 'default',
  compact = false,
}: DailyTrendChartProps) {
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [showComparison, setShowComparison] = useState(true);
  const styles = variantStyles[variant];
  const chartHeight = compact ? 180 : 250;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('zh-CN').format(value);
  };

  // 合并本周和上周数据，按日期对齐
  const mergedData = currentData.map((current, index) => {
    const previous = previousData[index] || { orders: 0, quantity: 0, revenue: 0 };
    return {
      date: current.date.split('-')[2] || '', // 只显示日期（去掉年月）
      本周订单: current.orders,
      本周销量: current.quantity,
      本周销售额: current.revenue,
      上周订单: previous.orders,
      上周销量: previous.quantity,
      上周销售额: previous.revenue,
    };
  });

  return (
    <Card className={`${styles.border} print-chart-card`}>
      <CardHeader className={compact ? 'pb-2' : ''}>
        <div className="flex items-center justify-between">
          <CardTitle className={`text-lg ${styles.titleColor}`}>{title}</CardTitle>
          <div className="flex items-center gap-2 no-print">
            <Button
              size="sm"
              variant={showComparison ? 'default' : 'outline'}
              onClick={() => setShowComparison(!showComparison)}
            >
              {showComparison ? '显示对比' : '仅本周'}
            </Button>
            <div className="flex border rounded-md">
              <Button
                size="sm"
                variant={chartType === 'line' ? 'default' : 'ghost'}
                className="rounded-r-none"
                onClick={() => setChartType('line')}
              >
                <LineChartIcon className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant={chartType === 'bar' ? 'default' : 'ghost'}
                className="rounded-l-none"
                onClick={() => setChartType('bar')}
              >
                <BarChart3 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-6">
          {/* 订单数趋势 */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">订单数趋势</h3>
            <ResponsiveContainer width="100%" height={chartHeight}>
              {chartType === 'line' ? (
                <LineChart data={mergedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatNumber(value)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="本周订单"
                    stroke={styles.primaryColor}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  {showComparison && (
                    <Line
                      type="monotone"
                      dataKey="上周订单"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3 }}
                    />
                  )}
                </LineChart>
              ) : (
                <BarChart data={mergedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatNumber(value)} />
                  <Legend />
                  <Bar dataKey="本周订单" fill={styles.primaryColor} />
                  {showComparison && <Bar dataKey="上周订单" fill="#82ca9d" />}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* 销售量趋势 */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">销售量趋势</h3>
            <ResponsiveContainer width="100%" height={chartHeight}>
              {chartType === 'line' ? (
                <LineChart data={mergedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatNumber(value)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="本周销量"
                    stroke={styles.primaryColor}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  {showComparison && (
                    <Line
                      type="monotone"
                      dataKey="上周销量"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3 }}
                    />
                  )}
                </LineChart>
              ) : (
                <BarChart data={mergedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatNumber(value)} />
                  <Legend />
                  <Bar dataKey="本周销量" fill={styles.primaryColor} />
                  {showComparison && <Bar dataKey="上周销量" fill="#82ca9d" />}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* 销售额趋势 */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">销售额趋势</h3>
            <ResponsiveContainer width="100%" height={chartHeight}>
              {chartType === 'line' ? (
                <LineChart data={mergedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="本周销售额"
                    stroke={styles.primaryColor}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  {showComparison && (
                    <Line
                      type="monotone"
                      dataKey="上周销售额"
                      stroke="#ff7c7c"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3 }}
                    />
                  )}
                </LineChart>
              ) : (
                <BarChart data={mergedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="本周销售额" fill={styles.primaryColor} />
                  {showComparison && <Bar dataKey="上周销售额" fill="#ff7c7c" />}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
