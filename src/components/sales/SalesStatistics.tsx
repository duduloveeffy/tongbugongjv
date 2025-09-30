'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpIcon, ArrowDownIcon, TrendingUpIcon, PackageIcon, ShoppingCartIcon, DollarSignIcon } from 'lucide-react';

interface SalesStatisticsProps {
  current: {
    totalOrders: number;
    totalRevenue: number;
    totalQuantity: number;
  };
  compare?: {
    totalOrders: number;
    totalRevenue: number;
    totalQuantity: number;
  } | null;
  growth?: {
    orders: string | null;
    revenue: string | null;
    quantity: string | null;
  } | null;
  isLoading?: boolean;
}

export function SalesStatistics({
  current,
  compare,
  growth,
  isLoading = false,
}: SalesStatisticsProps) {
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

  const GrowthIndicator = ({ value }: { value: string | null }) => {
    if (!value) return null;
    const numValue = parseFloat(value);
    const isPositive = numValue > 0;
    const color = isPositive ? 'text-green-600' : numValue < 0 ? 'text-red-600' : 'text-gray-500';
    const Icon = isPositive ? ArrowUpIcon : numValue < 0 ? ArrowDownIcon : TrendingUpIcon;

    return (
      <div className={`flex items-center gap-1 ${color}`}>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">{Math.abs(numValue).toFixed(1)}%</span>
      </div>
    );
  };

  const stats = [
    {
      title: '总订单数',
      value: current.totalOrders,
      compareValue: compare?.totalOrders,
      growth: growth?.orders,
      icon: ShoppingCartIcon,
      formatter: formatNumber,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: '总销售额',
      value: current.totalRevenue,
      compareValue: compare?.totalRevenue,
      growth: growth?.revenue,
      icon: DollarSignIcon,
      formatter: formatCurrency,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: '总销售量',
      value: current.totalQuantity,
      compareValue: compare?.totalQuantity,
      growth: growth?.quantity,
      icon: PackageIcon,
      formatter: formatNumber,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="text-2xl font-bold">
                  {stat.formatter(stat.value)}
                </div>
                {growth && (
                  <div className="flex items-center justify-between">
                    <GrowthIndicator value={stat.growth} />
                    {compare && stat.compareValue !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        前期: {stat.formatter(stat.compareValue)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}