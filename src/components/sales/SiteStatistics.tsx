'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SiteStatisticsProps {
  bySite: Record<string, {
    orderCount: number;
    revenue: number;
    quantity: number;
    siteName: string;
  }>;
  isLoading?: boolean;
}

export function SiteStatistics({ bySite, isLoading = false }: SiteStatisticsProps) {
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

  const sites = Object.entries(bySite).map(([siteId, data]) => ({
    id: siteId,
    ...data,
  })).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = sites.reduce((sum, site) => sum + site.revenue, 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>站点销售统计</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>站点销售统计</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-4">暂无数据</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>站点销售统计</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>站点</TableHead>
              <TableHead className="text-right">订单数</TableHead>
              <TableHead className="text-right">销售量</TableHead>
              <TableHead className="text-right">销售额</TableHead>
              <TableHead className="text-right">占比</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((site) => {
              const percentage = totalRevenue > 0 ? (site.revenue / totalRevenue * 100).toFixed(1) : '0';
              return (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">{site.siteName}</TableCell>
                  <TableCell className="text-right">{formatNumber(site.orderCount)}</TableCell>
                  <TableCell className="text-right">{formatNumber(site.quantity)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(site.revenue)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span>{percentage}%</span>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-medium bg-gray-50">
              <TableCell>合计</TableCell>
              <TableCell className="text-right">
                {formatNumber(sites.reduce((sum, site) => sum + site.orderCount, 0))}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(sites.reduce((sum, site) => sum + site.quantity, 0))}
              </TableCell>
              <TableCell className="text-right">{formatCurrency(totalRevenue)}</TableCell>
              <TableCell className="text-right">100.0%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}