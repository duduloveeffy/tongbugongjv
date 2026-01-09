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
  vapsoloRetailStats?: BrandStats;
  vapsoloWholesaleStats?: BrandStats;
  spacexvapeStats: BrandStats;
  otherStats: BrandStats;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b'];
const VAPSOLO_COLORS = ['#60a5fa', '#818cf8']; // 零售蓝、批发紫

export function BrandComparison({
  allSitesStats,
  vapsoloStats,
  vapsoloRetailStats,
  vapsoloWholesaleStats,
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

  // 准备柱状图数据 - 包含 Vapsolo 零售/批发细分
  const barChartData = [
    {
      name: 'Vapsolo总计',
      订单数: vapsoloStats.orders,
      销售量: vapsoloStats.quantity,
      销售额: vapsoloStats.revenue,
    },
    {
      name: 'vapsolo零售站',
      订单数: vapsoloRetailStats?.orders || 0,
      销售量: vapsoloRetailStats?.quantity || 0,
      销售额: vapsoloRetailStats?.revenue || 0,
    },
    {
      name: 'vapsolo批发站',
      订单数: vapsoloWholesaleStats?.orders || 0,
      销售量: vapsoloWholesaleStats?.quantity || 0,
      销售额: vapsoloWholesaleStats?.revenue || 0,
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

  // 柱状图颜色配置
  const barColors = ['#3b82f6', '#60a5fa', '#818cf8', '#10b981', '#f59e0b'];

  // 准备饼图数据 - 品牌级别占比
  const getPieData = (metric: 'orders' | 'quantity' | 'revenue') => {
    const data = [
      { name: 'Vapsolo', value: vapsoloStats[metric] },
      { name: '集合站1', value: spacexvapeStats[metric] },
      { name: '集合站2', value: otherStats[metric] },
    ];
    return data.filter(d => d.value > 0);
  };

  // 准备 Vapsolo 零售/批发饼图数据
  const getVapsoloPieData = (metric: 'orders' | 'quantity' | 'revenue') => {
    if (!vapsoloRetailStats || !vapsoloWholesaleStats) return [];
    const data = [
      { name: '零售站', value: vapsoloRetailStats[metric] },
      { name: '批发站', value: vapsoloWholesaleStats[metric] },
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
    <Card className="brand-comparison-card print-chart-card">
      <CardHeader>
        <CardTitle className="text-lg">品牌站点对比</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* 数据对比卡片 - 简化版，详细数据已在上方展示 */}
          <div className="grid grid-cols-3 gap-4">
            {/* Vapsolo */}
            <div className="space-y-3 p-4 border rounded-lg bg-blue-50">
              <div className="font-semibold text-blue-900">Vapsolo（总计）</div>
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

          {/* 可视化图表 */}
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
            <div className="grid grid-cols-2 gap-4 brand-charts-grid print:gap-2">
              {/* 柱状图 - 包含 Vapsolo 零售/批发 */}
              <div className="bg-white border rounded-lg p-4 print:p-2 bar-chart-container">
                <div className="text-sm font-medium text-muted-foreground mb-2">
                  {getMetricLabel(activeTab)}对比（含 Vapsolo 零售/批发）
                </div>
                <div className="chart-height-280" style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={11} angle={-15} textAnchor="end" height={50} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      formatter={(value: number) => formatValue(value, activeTab)}
                    />
                    <Bar
                      dataKey={getMetricLabel(activeTab)}
                      radius={[4, 4, 0, 0]}
                    >
                      {barChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={barColors[index]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-2 mt-2 text-xs print:gap-1 print:text-[8pt]">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded print:w-2 print:h-2" style={{ backgroundColor: '#3b82f6' }}></span>
                    Vapsolo总计
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded print:w-2 print:h-2" style={{ backgroundColor: '#60a5fa' }}></span>
                    vapsolo零售站
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded print:w-2 print:h-2" style={{ backgroundColor: '#818cf8' }}></span>
                    vapsolo批发站
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded print:w-2 print:h-2" style={{ backgroundColor: '#10b981' }}></span>
                    集合站1
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded print:w-2 print:h-2" style={{ backgroundColor: '#f59e0b' }}></span>
                    集合站2
                  </span>
                </div>
              </div>

              {/* 双饼图：品牌占比 + Vapsolo 零售/批发占比 */}
              <div className="bg-white border rounded-lg p-4 print:p-2 pie-charts-container">
                <div className="grid grid-cols-2 gap-2 print:gap-1">
                  {/* 品牌占比饼图 */}
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1 text-center print:text-[9pt]">
                      品牌{getMetricLabel(activeTab)}占比
                    </div>
                    <div className="chart-height-110" style={{ width: '100%', height: 110 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getPieData(activeTab)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                          outerRadius={35}
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
                    <div className="flex flex-wrap justify-center gap-2 text-xs print:gap-1 print:text-[8pt]">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }}></span>
                        Vapsolo
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }}></span>
                        集合站1
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }}></span>
                        集合站2
                      </span>
                    </div>
                  </div>

                  {/* Vapsolo 零售/批发饼图 */}
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1 text-center print:text-[9pt]">
                      Vapsolo 零售/批发
                    </div>
                    <div className="chart-height-110" style={{ width: '100%', height: 110 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getVapsoloPieData(activeTab)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                          outerRadius={35}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {getVapsoloPieData(activeTab).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={VAPSOLO_COLORS[index % VAPSOLO_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatValue(value, activeTab)} />
                      </PieChart>
                    </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 text-xs print:gap-1 print:text-[8pt]">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#60a5fa' }}></span>
                        零售站
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#818cf8' }}></span>
                        批发站
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
