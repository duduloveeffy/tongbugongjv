'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, TrendingUp, TrendingDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { exportToExcel } from '@/lib/export-utils';
import { toast } from 'sonner';

interface SiteData {
  orderCount: number;
  revenue: number;
  quantity: number;
  siteName: string;
}

interface SiteStatisticsProps {
  bySite: Record<string, SiteData>;
  compareBySite?: Record<string, SiteData> | null;
  isLoading?: boolean;
}

export function SiteStatistics({ bySite, compareBySite, isLoading = false }: SiteStatisticsProps) {
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

  const formatGrowth = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return null;

    const growth = ((current - previous) / previous) * 100;
    const isPositive = growth > 0;
    const isZero = Math.abs(growth) < 0.01;

    if (isZero) {
      return <span className="text-muted-foreground">—</span>;
    }

    return (
      <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
        {isPositive ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
        {' '}
        {isPositive ? '+' : ''}{growth.toFixed(1)}%
      </span>
    );
  };

  const sites = Object.entries(bySite).map(([siteId, data]) => {
    const compareData = compareBySite?.[siteId];
    return {
      id: siteId,
      ...data,
      compareData,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = sites.reduce((sum, site) => sum + site.revenue, 0);

  const handleExport = () => {
    try {
      const exportData = sites.map((site, index) => {
        const percentage = totalRevenue > 0 ? (site.revenue / totalRevenue * 100).toFixed(1) : '0';
        const data: any = {
          排名: index + 1,
          站点名称: site.siteName,
          订单数: site.orderCount,
          销售量: site.quantity,
          销售额: site.revenue,
          占比: `${percentage}%`,
        };

        if (compareBySite && site.compareData) {
          const orderGrowth = site.compareData.orderCount > 0
            ? ((site.orderCount - site.compareData.orderCount) / site.compareData.orderCount * 100).toFixed(1)
            : 'N/A';
          const quantityGrowth = site.compareData.quantity > 0
            ? ((site.quantity - site.compareData.quantity) / site.compareData.quantity * 100).toFixed(1)
            : 'N/A';
          const revenueGrowth = site.compareData.revenue > 0
            ? ((site.revenue - site.compareData.revenue) / site.compareData.revenue * 100).toFixed(1)
            : 'N/A';

          data['订单数增长'] = `${orderGrowth}%`;
          data['销售量增长'] = `${quantityGrowth}%`;
          data['销售额增长'] = `${revenueGrowth}%`;
        }

        return data;
      });

      exportToExcel(exportData, '站点销售统计');
      toast.success('导出成功');
    } catch (error) {
      toast.error('导出失败');
    }
  };

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
        <div className="flex items-center justify-between">
          <CardTitle>站点销售统计</CardTitle>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            导出
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>站点</TableHead>
              <TableHead className="text-right">订单数</TableHead>
              {compareBySite && <TableHead className="text-right">订单增长</TableHead>}
              <TableHead className="text-right">销售量</TableHead>
              {compareBySite && <TableHead className="text-right">销量增长</TableHead>}
              <TableHead className="text-right">销售额</TableHead>
              {compareBySite && <TableHead className="text-right">销售额增长</TableHead>}
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
                  {compareBySite && (
                    <TableCell className="text-right">
                      {formatGrowth(site.orderCount, site.compareData?.orderCount)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">{formatNumber(site.quantity)}</TableCell>
                  {compareBySite && (
                    <TableCell className="text-right">
                      {formatGrowth(site.quantity, site.compareData?.quantity)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">{formatCurrency(site.revenue)}</TableCell>
                  {compareBySite && (
                    <TableCell className="text-right">
                      {formatGrowth(site.revenue, site.compareData?.revenue)}
                    </TableCell>
                  )}
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