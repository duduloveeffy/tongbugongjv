'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react';

interface SiteStats {
  site: string;
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

interface SiteRankingTableProps {
  data: SiteStats[];
  title?: string;
}

type SortField = 'orders' | 'quantity' | 'revenue';
type SortOrder = 'asc' | 'desc';

export function SiteRankingTable({ data, title = '站点排名' }: SiteRankingTableProps) {
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100">
                <TableHead className="font-semibold w-8 text-center">#</TableHead>
                <TableHead className="font-semibold text-center">站点</TableHead>
                <SortableHeader field="orders" label="订单数" />
                <SortableHeader field="quantity" label="销售量" />
                <SortableHeader field="revenue" label="销售额" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((item, index) => (
                <TableRow key={item.site} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-muted-foreground text-center">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium text-center">{item.site}</TableCell>

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
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
