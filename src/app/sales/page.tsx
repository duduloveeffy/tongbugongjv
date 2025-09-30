'use client';

import { PageLayout } from '@/components/layout/PageLayout';
import { DateRangePicker } from '@/components/sales/DateRangePicker';
import { SalesStatistics } from '@/components/sales/SalesStatistics';
import { SiteStatistics } from '@/components/sales/SiteStatistics';
import { useMultiSiteStore } from '@/store/multisite';
import { useCallback, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RefreshCwIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SalesData {
  current: {
    totalOrders: number;
    totalRevenue: number;
    totalQuantity: number;
    bySite: Record<string, any>;
    bySku: Record<string, any>;
  };
  compare?: {
    totalOrders: number;
    totalRevenue: number;
    totalQuantity: number;
    bySite: Record<string, any>;
    bySku: Record<string, any>;
  } | null;
  growth?: {
    orders: string | null;
    revenue: string | null;
    quantity: string | null;
  } | null;
  timeSeries?: any[] | null;
  period?: {
    current: { start: string; end: string };
    compare?: { start: string; end: string } | null;
  };
}

export default function SalesPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [dateRange, setDateRange] = useState<{
    start: string;
    end: string;
    compareStart?: string;
    compareEnd?: string;
  }>({ start: '', end: '' });
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  // 包含更多状态，特别是您数据库中实际存在的状态
  // 包含所有可能的订单状态
  const [orderStatuses, setOrderStatuses] = useState<string[]>([
    'processing', 'completed', 'pending', 'on-hold', 'cancelled', 'refunded', 'failed'
  ]);

  // Multisite store
  const { sites, fetchSites } = useMultiSiteStore();

  // Fetch sites on mount
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Initialize selected sites
  useEffect(() => {
    if (sites.length > 0 && selectedSites.length === 0) {
      setSelectedSites(sites.filter(s => s.enabled).map(s => s.id));
    }
  }, [sites]);

  // Fetch sales data
  const fetchSalesData = useCallback(async () => {
    if (!dateRange.start || !dateRange.end) {
      toast.error('请选择日期范围');
      return;
    }

    if (selectedSites.length === 0) {
      toast.error('请至少选择一个站点');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/sales/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteIds: selectedSites,
          statuses: orderStatuses,
          dateStart: dateRange.start,
          dateEnd: dateRange.end,
          compareStart: dateRange.compareStart,
          compareEnd: dateRange.compareEnd,
          groupBy,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      console.log('[Sales Page] API Response:', result);
      console.log('[Sales Page] Data received:', result.data);

      if (result.success) {
        setSalesData(result.data);
        // 添加调试信息
        if (result.data) {
          console.log('[Sales Page] Current stats:', result.data.current);
          const orderCount = result.data.current?.totalOrders || 0;
          if (orderCount === 0) {
            toast.warning('查询成功，但没有找到符合条件的订单');
          } else {
            toast.success(`成功加载 ${orderCount} 个订单的销售数据`);
          }
        } else {
          toast.warning('数据加载成功，但返回数据为空');
        }
      } else {
        throw new Error(result.error || '加载失败');
      }
    } catch (error: any) {
      console.error('Failed to fetch sales data:', error);
      toast.error(error.message || '加载销售数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, selectedSites, orderStatuses, groupBy]);

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

  return (
    <PageLayout
      title="销量分析"
      description="查看订单销售数据，支持多站点聚合和时间对比分析"
    >
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>筛选条件</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date Range Picker */}
            <DateRangePicker
              onDateRangeChange={setDateRange}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
            />

            {/* Site Selection */}
            <div>
              <Label>选择站点</Label>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {sites.map((site) => (
                  <div key={site.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={site.id}
                      checked={selectedSites.includes(site.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSites([...selectedSites, site.id]);
                        } else {
                          setSelectedSites(selectedSites.filter(id => id !== site.id));
                        }
                      }}
                      disabled={!site.enabled}
                    />
                    <Label
                      htmlFor={site.id}
                      className={`text-sm ${!site.enabled ? 'text-muted-foreground' : ''}`}
                    >
                      {site.name}
                    </Label>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedSites(sites.filter(s => s.enabled).map(s => s.id))}
                >
                  全选
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedSites([])}
                >
                  清空
                </Button>
              </div>
            </div>

            {/* Order Status */}
            <div>
              <Label>订单状态</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {['completed', 'processing', 'pending', 'on-hold', 'cancelled', 'refunded', 'failed'].map((status) => (
                  <div key={status} className="flex items-center space-x-2">
                    <Checkbox
                      id={status}
                      checked={orderStatuses.includes(status)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setOrderStatuses([...orderStatuses, status]);
                        } else {
                          setOrderStatuses(orderStatuses.filter(s => s !== status));
                        }
                      }}
                    />
                    <Label htmlFor={status} className="text-sm">
                      {status === 'completed' ? '已完成' :
                       status === 'processing' ? '处理中' :
                       status === 'pending' ? '待处理' :
                       status === 'on-hold' ? '暂停' :
                       status === 'cancelled' ? '已取消' :
                       status === 'refunded' ? '已退款' :
                       status === 'failed' ? '失败' : status}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Refresh Button */}
            <div className="flex justify-end">
              <Button onClick={fetchSalesData} disabled={isLoading}>
                <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                刷新数据
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Statistics or No Data Message */}
        {salesData ? (
          salesData.current?.totalOrders === 0 ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  <p className="text-lg mb-2">没有找到符合条件的订单</p>
                  <p className="text-sm">请检查：</p>
                  <ul className="text-sm mt-2 space-y-1">
                    <li>• 选择的日期范围是否正确</li>
                    <li>• 是否选择了至少一个站点</li>
                    <li>• 订单状态筛选是否太严格</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          ) : (
          <>
            {/* Summary Statistics */}
            <SalesStatistics
              current={salesData.current}
              compare={salesData.compare}
              growth={salesData.growth}
              isLoading={isLoading}
            />

            {/* Site Statistics */}
            <SiteStatistics
              bySite={salesData.current.bySite}
              isLoading={isLoading}
            />

            {/* Time Series Chart (if available) */}
            {salesData.timeSeries && salesData.timeSeries.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>销售趋势</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead className="text-right">订单数</TableHead>
                        <TableHead className="text-right">销售量</TableHead>
                        <TableHead className="text-right">销售额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesData.timeSeries.map((item) => (
                        <TableRow key={item.date}>
                          <TableCell>{item.date}</TableCell>
                          <TableCell className="text-right">{formatNumber(item.orders)}</TableCell>
                          <TableCell className="text-right">{formatNumber(item.quantity)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* SKU Details */}
            {salesData.current.bySku && Object.keys(salesData.current.bySku).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>SKU销售明细</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>产品名称</TableHead>
                        <TableHead className="text-right">订单数</TableHead>
                        <TableHead className="text-right">销售量</TableHead>
                        <TableHead className="text-right">销售额</TableHead>
                        <TableHead className="text-right">站点数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.values(salesData.current.bySku)
                        .sort((a: any, b: any) => b.revenue - a.revenue)
                        .slice(0, 100)
                        .map((item: any) => (
                          <TableRow key={item.sku}>
                            <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell className="text-right">{formatNumber(item.orderCount)}</TableCell>
                            <TableCell className="text-right">{formatNumber(item.quantity)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.revenue)}</TableCell>
                            <TableCell className="text-right">{item.sites.length}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  {Object.keys(salesData.current.bySku).length > 100 && (
                    <p className="text-sm text-muted-foreground mt-4 text-center">
                      仅显示前100个SKU，共{Object.keys(salesData.current.bySku).length}个SKU有销售
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
          )
        ) : null}
      </div>
    </PageLayout>
  );
}