'use client';

import { useState } from 'react';
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface BrandStats {
  orders: number;
  quantity: number;
  revenue: number;
}

interface BrandComparisonProps {
  allSitesStats: BrandStats;
  vapsoloStats: BrandStats;
  spacexvapeStats: BrandStats;
  otherStats: BrandStats;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b'];

export function BrandComparison({
  allSitesStats,
  vapsoloStats,
  spacexvapeStats,
  otherStats,
}: BrandComparisonProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'quantity' | 'revenue'>('revenue');

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

  // 计算占比
  const calculatePercentage = (value: number, total: number) => {
    if (total === 0) return '0.0%';
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  // 准备柱状图数据
  const barChartData = [
    {
      name: 'Vapsolo',
      订单数: vapsoloStats.orders,
      销售量: vapsoloStats.quantity,
      销售额: vapsoloStats.revenue,
    },
    {
      name: '集合站1',
      订单数: spacexvapeStats.orders,
      销售量: spacexvapeStats.quantity,
      销售额: spacexvapeStats.revenue,
    },
    {
      name: '集合站2',
      订单数: otherStats.orders,
      销售量: otherStats.quantity,
      销售额: otherStats.revenue,
    },
  ];

  // 准备饼图数据
  const getPieData = (metric: 'orders' | 'quantity' | 'revenue') => {
    const data = [
      { name: 'Vapsolo', value: vapsoloStats[metric] },
      { name: '集合站1', value: spacexvapeStats[metric] },
      { name: '集合站2', value: otherStats[metric] },
    ];
    return data.filter(d => d.value > 0);
  };

  const getMetricLabel = (metric: 'orders' | 'quantity' | 'revenue') => {
    switch (metric) {
      case 'orders': return '订单数';
      case 'quantity': return '销售量';
      case 'revenue': return '销售额';
    }
  };

  const formatValue = (value: number, metric: 'orders' | 'quantity' | 'revenue') => {
    if (metric === 'revenue') return formatCurrency(value);
    return formatNumber(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">品牌站点对比</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* 数据对比卡片 */}
          <div className="grid grid-cols-3 gap-4">
            {/* Vapsolo */}
            <div className="space-y-3 p-4 border rounded-lg bg-blue-50">
              <div className="font-semibold text-blue-900">Vapsolo</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">订单数:</span>
                  <span className="font-medium">
                    {formatNumber(vapsoloStats.orders)} ({calculatePercentage(vapsoloStats.orders, allSitesStats.orders)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售量:</span>
                  <span className="font-medium">
                    {formatNumber(vapsoloStats.quantity)} ({calculatePercentage(vapsoloStats.quantity, allSitesStats.quantity)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售额:</span>
                  <span className="font-medium">
                    {formatCurrency(vapsoloStats.revenue)} ({calculatePercentage(vapsoloStats.revenue, allSitesStats.revenue)})
                  </span>
                </div>
              </div>
            </div>

            {/* 集合站1 */}
            <div className="space-y-3 p-4 border rounded-lg bg-green-50">
              <div className="font-semibold text-green-900">集合站1</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">订单数:</span>
                  <span className="font-medium">
                    {formatNumber(spacexvapeStats.orders)} ({calculatePercentage(spacexvapeStats.orders, allSitesStats.orders)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售量:</span>
                  <span className="font-medium">
                    {formatNumber(spacexvapeStats.quantity)} ({calculatePercentage(spacexvapeStats.quantity, allSitesStats.quantity)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售额:</span>
                  <span className="font-medium">
                    {formatCurrency(spacexvapeStats.revenue)} ({calculatePercentage(spacexvapeStats.revenue, allSitesStats.revenue)})
                  </span>
                </div>
              </div>
            </div>

            {/* 集合站2 */}
            <div className="space-y-3 p-4 border rounded-lg bg-amber-50">
              <div className="font-semibold text-amber-900">集合站2</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">订单数:</span>
                  <span className="font-medium">
                    {formatNumber(otherStats.orders)} ({calculatePercentage(otherStats.orders, allSitesStats.orders)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售量:</span>
                  <span className="font-medium">
                    {formatNumber(otherStats.quantity)} ({calculatePercentage(otherStats.quantity, allSitesStats.quantity)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">销售额:</span>
                  <span className="font-medium">
                    {formatCurrency(otherStats.revenue)} ({calculatePercentage(otherStats.revenue, allSitesStats.revenue)})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 可视化图表 - 只显示销售额，打印时隐藏Tab切换 */}
          <div>
            {/* Tab 切换按钮 - 打印时隐藏 */}
            <div className="no-print mb-4">
              <div className="grid w-full grid-cols-3 bg-muted p-1 rounded-lg">
                {(['orders', 'quantity', 'revenue'] as const).map((metric) => (
                  <button
                    key={metric}
                    onClick={() => setActiveTab(metric)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === metric
                        ? 'bg-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {getMetricLabel(metric)}
                  </button>
                ))}
              </div>
            </div>

            {/* 图表内容 */}
            <div className="grid grid-cols-2 gap-4">
              {/* 柱状图 */}
              <div className="bg-white border rounded-lg p-4">
                <div className="text-sm font-medium text-muted-foreground mb-2">
                  {getMetricLabel(activeTab)}对比
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      formatter={(value: number) => formatValue(value, activeTab)}
                    />
                    <Bar
                      dataKey={getMetricLabel(activeTab)}
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 饼图 */}
              <div className="bg-white border rounded-lg p-4">
                <div className="text-sm font-medium text-muted-foreground mb-2">
                  {getMetricLabel(activeTab)}占比
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={getPieData(activeTab)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getPieData(activeTab).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatValue(value, activeTab)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
