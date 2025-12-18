'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface OverviewStatsProps {
  title: string;
  stats: {
    orders: number;
    quantity: number;
    revenue: number;
  };
  previousStats: {
    orders: number;
    quantity: number;
    revenue: number;
  };
  growth: {
    orders: number;
    quantity: number;
    revenue: number;
  };
  /** 对比周期标签，默认"上月" */
  periodLabel?: string;
}

export function OverviewStats({ title, stats, previousStats, growth, periodLabel = '上月' }: OverviewStatsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('zh-CN').format(value);
  };

  const formatGrowth = (value: number) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="h-3 w-3" />;
    if (value < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const getTrendColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getGrowthBadge = (value: number, label: string) => {
    const color = value > 0 ? 'bg-green-100 text-green-700' : value < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700';
    return (
      <Badge variant="secondary" className={`${color} flex items-center gap-1`}>
        {getTrendIcon(value)}
        <span className="text-xs">{label}</span>
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          {/* 订单数 */}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">订单数</div>
            <div className="text-2xl font-bold">{formatNumber(stats.orders)}</div>
            <div className="flex items-center gap-2">
              {getGrowthBadge(growth.orders, formatGrowth(growth.orders))}
              <span className="text-xs text-muted-foreground">
                {periodLabel}: {formatNumber(previousStats.orders)}
              </span>
            </div>
          </div>

          {/* 销售量 */}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">销售量</div>
            <div className="text-2xl font-bold">{formatNumber(stats.quantity)}</div>
            <div className="flex items-center gap-2">
              {getGrowthBadge(growth.quantity, formatGrowth(growth.quantity))}
              <span className="text-xs text-muted-foreground">
                {periodLabel}: {formatNumber(previousStats.quantity)}
              </span>
            </div>
          </div>

          {/* 销售额 */}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">销售额</div>
            <div className="text-2xl font-bold">{formatCurrency(stats.revenue)}</div>
            <div className="flex items-center gap-2">
              {getGrowthBadge(growth.revenue, formatGrowth(growth.revenue))}
              <span className="text-xs text-muted-foreground">
                {periodLabel}: {formatCurrency(previousStats.revenue)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
