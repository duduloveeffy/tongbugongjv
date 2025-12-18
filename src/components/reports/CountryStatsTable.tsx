'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react';

interface CountryStats {
  country: string;
  orders: number;
  quantity: number;
  revenue: number;
  previousOrders: number;
  previousQuantity: number;
  previousRevenue: number;
  ordersGrowth: number;
  quantityGrowth: number;
  revenueGrowth: number;
}

type BrandVariant = 'default' | 'vapsolo' | 'spacexvape' | 'other';

interface CountryStatsTableProps {
  data: CountryStats[];
  title?: string;
  variant?: BrandVariant;
}

type SortField = 'orders' | 'quantity' | 'revenue';
type SortOrder = 'asc' | 'desc';

const variantStyles: Record<BrandVariant, { header: string; border: string; titleColor: string }> = {
  default: { header: 'bg-gray-100', border: '', titleColor: '' },
  vapsolo: { header: 'bg-blue-50', border: 'border-l-4 border-l-blue-500', titleColor: 'text-blue-700' },
  spacexvape: { header: 'bg-green-50', border: 'border-l-4 border-l-green-500', titleColor: 'text-green-700' },
  other: { header: 'bg-amber-50', border: 'border-l-4 border-l-amber-500', titleColor: 'text-amber-700' },
};

export function CountryStatsTable({ data, title = '国家统计', variant = 'default' }: CountryStatsTableProps) {
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const styles = variantStyles[variant];

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    return (aValue - bValue) * multiplier;
  });

  const getGrowthIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="h-3 w-3 text-green-600" />;
    if (value < 0) return <TrendingDown className="h-3 w-3 text-red-600" />;
    return null;
  };

  const getGrowthColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <TableHead className="cursor-pointer hover:bg-gray-50 text-center" onClick={() => handleSort(field)}>
      <div className="flex items-center justify-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
        {sortField === field && (
          <span className="text-xs text-blue-600">
            {sortOrder === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </TableHead>
  );

  // 计算合计
  const totals = data.reduce(
    (acc, item) => ({
      orders: acc.orders + item.orders,
      quantity: acc.quantity + item.quantity,
      revenue: acc.revenue + item.revenue,
      previousOrders: acc.previousOrders + item.previousOrders,
      previousQuantity: acc.previousQuantity + item.previousQuantity,
      previousRevenue: acc.previousRevenue + item.previousRevenue,
    }),
    { orders: 0, quantity: 0, revenue: 0, previousOrders: 0, previousQuantity: 0, previousRevenue: 0 }
  );

  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  return (
    <Card className={styles.border}>
      <CardHeader>
        <CardTitle className={`text-lg ${styles.titleColor}`}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className={styles.header}>
                <TableHead className="font-semibold w-8 text-center">#</TableHead>
                <TableHead className="font-semibold text-center">国家</TableHead>
                <SortableHeader field="orders" label="订单数" />
                <SortableHeader field="quantity" label="销售量" />
                <SortableHeader field="revenue" label="销售额" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((item, index) => (
                <TableRow key={item.country} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-muted-foreground text-center">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium text-center">{item.country}</TableCell>

                  {/* 订单数 + 增长率 */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-medium">{formatNumber(item.orders)}</span>
                      {item.ordersGrowth !== 0 && (
                        <div className="flex items-center gap-1">
                          {getGrowthIcon(item.ordersGrowth)}
                          <span className={`text-xs ${getGrowthColor(item.ordersGrowth)}`}>
                            {formatGrowth(item.ordersGrowth)}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* 销售量 + 增长率 */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-medium">{formatNumber(item.quantity)}</span>
                      {item.quantityGrowth !== 0 && (
                        <div className="flex items-center gap-1">
                          {getGrowthIcon(item.quantityGrowth)}
                          <span className={`text-xs ${getGrowthColor(item.quantityGrowth)}`}>
                            {formatGrowth(item.quantityGrowth)}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* 销售额 + 增长率 */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-medium">{formatCurrency(item.revenue)}</span>
                      {item.revenueGrowth !== 0 && (
                        <div className="flex items-center gap-1">
                          {getGrowthIcon(item.revenueGrowth)}
                          <span className={`text-xs ${getGrowthColor(item.revenueGrowth)}`}>
                            {formatGrowth(item.revenueGrowth)}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {/* 合计行 */}
              <TableRow className="bg-gray-50 font-semibold border-t-2">
                <TableCell colSpan={2} className="text-center">合计</TableCell>

                {/* 订单合计 + 增长率 */}
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span>{formatNumber(totals.orders)}</span>
                    {calculateGrowth(totals.orders, totals.previousOrders) !== 0 && (
                      <div className="flex items-center gap-1">
                        {getGrowthIcon(calculateGrowth(totals.orders, totals.previousOrders))}
                        <span className={`text-xs ${getGrowthColor(calculateGrowth(totals.orders, totals.previousOrders))}`}>
                          {formatGrowth(calculateGrowth(totals.orders, totals.previousOrders))}
                        </span>
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* 销量合计 + 增长率 */}
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span>{formatNumber(totals.quantity)}</span>
                    {calculateGrowth(totals.quantity, totals.previousQuantity) !== 0 && (
                      <div className="flex items-center gap-1">
                        {getGrowthIcon(calculateGrowth(totals.quantity, totals.previousQuantity))}
                        <span className={`text-xs ${getGrowthColor(calculateGrowth(totals.quantity, totals.previousQuantity))}`}>
                          {formatGrowth(calculateGrowth(totals.quantity, totals.previousQuantity))}
                        </span>
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* 销售额合计 + 增长率 */}
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span>{formatCurrency(totals.revenue)}</span>
                    {calculateGrowth(totals.revenue, totals.previousRevenue) !== 0 && (
                      <div className="flex items-center gap-1">
                        {getGrowthIcon(calculateGrowth(totals.revenue, totals.previousRevenue))}
                        <span className={`text-xs ${getGrowthColor(calculateGrowth(totals.revenue, totals.previousRevenue))}`}>
                          {formatGrowth(calculateGrowth(totals.revenue, totals.previousRevenue))}
                        </span>
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
