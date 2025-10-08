'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface SiteTypeComparisonProps {
  allSitesStats: {
    orders: number;
    quantity: number;
    revenue: number;
  };
  retailStats: {
    orders: number;
    quantity: number;
    revenue: number;
  };
  wholesaleStats: {
    orders: number;
    quantity: number;
    revenue: number;
  };
}

export function SiteTypeComparison({
  allSitesStats,
  retailStats,
  wholesaleStats,
}: SiteTypeComparisonProps) {
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

  // 准备图表数据
  const chartData = [
    {
      name: '零售站点',
      订单数: retailStats.orders,
      销售量: retailStats.quantity,
      销售额: retailStats.revenue,
    },
    {
      name: '批发站点',
      订单数: wholesaleStats.orders,
      销售量: wholesaleStats.quantity,
      销售额: wholesaleStats.revenue,
    },
  ];

  // 计算占比
  const calculatePercentage = (value: number, total: number) => {
    if (total === 0) return '0.0%';
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">站点类型对比</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* 数据对比表格 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 零售站点 */}
            <div className="space-y-3 p-4 border rounded-lg bg-blue-50">
              <div className="font-semibold text-blue-900">零售站点</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">订单数:</span>
                  <span className="font-medium">
                    {formatNumber(retailStats.orders)} ({calculatePercentage(retailStats.orders, allSitesStats.orders)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售量:</span>
                  <span className="font-medium">
                    {formatNumber(retailStats.quantity)} ({calculatePercentage(retailStats.quantity, allSitesStats.quantity)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售额:</span>
                  <span className="font-medium">
                    {formatCurrency(retailStats.revenue)} ({calculatePercentage(retailStats.revenue, allSitesStats.revenue)})
                  </span>
                </div>
              </div>
            </div>

            {/* 批发站点 */}
            <div className="space-y-3 p-4 border rounded-lg bg-green-50">
              <div className="font-semibold text-green-900">批发站点</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">订单数:</span>
                  <span className="font-medium">
                    {formatNumber(wholesaleStats.orders)} ({calculatePercentage(wholesaleStats.orders, allSitesStats.orders)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售量:</span>
                  <span className="font-medium">
                    {formatNumber(wholesaleStats.quantity)} ({calculatePercentage(wholesaleStats.quantity, allSitesStats.quantity)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售额:</span>
                  <span className="font-medium">
                    {formatCurrency(wholesaleStats.revenue)} ({calculatePercentage(wholesaleStats.revenue, allSitesStats.revenue)})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 可视化对比图表 */}
          <div className="bg-white border rounded-lg p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === '销售额') return formatCurrency(value);
                    return formatNumber(value);
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="订单数" fill="#8884d8" />
                <Bar yAxisId="left" dataKey="销售量" fill="#82ca9d" />
                <Bar yAxisId="right" dataKey="销售额" fill="#ffc658" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
