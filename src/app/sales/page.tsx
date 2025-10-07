'use client';

import { PageLayout } from '@/components/layout/PageLayout';
import { DateRangePicker } from '@/components/sales/DateRangePicker';
import { SalesStatistics } from '@/components/sales/SalesStatistics';
import { SiteStatistics } from '@/components/sales/SiteStatistics';
import { CountryStatistics } from '@/components/sales/CountryStatistics';
import { useMultiSiteStore } from '@/store/multisite';
import { useCallback, useState, useEffect, useMemo } from 'react';
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
import { RefreshCwIcon, Download, BarChart3, Package, TrendingUp, TrendingDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { exportToExcel } from '@/lib/export-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  extractSpu,
  getSpuModeLabel,
  getSpuModeDescription,
  type SpuExtractionMode,
  type SpuExtractionConfig,
} from '@/lib/spu-utils';
import { defaultSpuMappings } from '@/config/spu-mappings';

interface SalesData {
  current: {
    totalOrders: number;
    totalRevenue: number;
    totalQuantity: number;
    bySite: Record<string, any>;
    bySku: Record<string, any>;
    byCountry: Record<string, any>;
  };
  compare?: {
    totalOrders: number;
    totalRevenue: number;
    totalQuantity: number;
    bySite: Record<string, any>;
    bySku: Record<string, any>;
    byCountry: Record<string, any>;
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
  // 默认只选择已完成和处理中状态
  const [orderStatuses, setOrderStatuses] = useState<string[]>([
    'completed', 'processing'
  ]);
  // SPU聚合模式
  const [spuMode, setSpuMode] = useState<SpuExtractionMode>('series');

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

      if (result.success) {
        setSalesData(result.data);
        if (result.data) {
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

  // 计算SPU聚合数据（支持时间对比）
  const spuData = useMemo(() => {
    if (!salesData?.current?.bySku) return null;

    const spuConfig: SpuExtractionConfig = {
      mode: spuMode,
      nameMapping: defaultSpuMappings,
    };

    // 处理当前期数据
    const currentSpuMap: Record<string, {
      spuName: string;
      skuCount: number;
      skus: Set<string>;
      productNames: Set<string>;
      orderCount: number;
      quantity: number;
      revenue: number;
      sites: Set<string>;
    }> = {};

    Object.values(salesData.current.bySku).forEach((item: any) => {
      const spuName = extractSpu(item.name || 'Unknown', spuConfig, item.sku);

      if (!currentSpuMap[spuName]) {
        currentSpuMap[spuName] = {
          spuName,
          skuCount: 0,
          skus: new Set(),
          productNames: new Set(),
          orderCount: 0,
          quantity: 0,
          revenue: 0,
          sites: new Set(),
        };
      }

      currentSpuMap[spuName].skus.add(item.sku);
      currentSpuMap[spuName].productNames.add(item.name);
      currentSpuMap[spuName].skuCount = currentSpuMap[spuName].skus.size;
      currentSpuMap[spuName].orderCount += item.orderCount;
      currentSpuMap[spuName].quantity += item.quantity;
      currentSpuMap[spuName].revenue += item.revenue;

      if (item.sites && Array.isArray(item.sites)) {
        item.sites.forEach((site: string) => {
          currentSpuMap[spuName].sites.add(site);
        });
      }
    });

    // 处理对比期数据（如果有）
    let compareSpuMap: Record<string, {
      orderCount: number;
      quantity: number;
      revenue: number;
    }> | null = null;

    if (salesData.compare?.bySku) {
      compareSpuMap = {};
      Object.values(salesData.compare.bySku).forEach((item: any) => {
        const spuName = extractSpu(item.name || 'Unknown', spuConfig, item.sku);

        if (!compareSpuMap![spuName]) {
          compareSpuMap![spuName] = {
            orderCount: 0,
            quantity: 0,
            revenue: 0,
          };
        }

        compareSpuMap![spuName].orderCount += item.orderCount;
        compareSpuMap![spuName].quantity += item.quantity;
        compareSpuMap![spuName].revenue += item.revenue;
      });
    }

    // 转换为数组并排序，添加对比数据
    const result = Object.values(currentSpuMap)
      .map(spu => ({
        ...spu,
        siteCount: spu.sites.size,
        productCount: spu.productNames.size,
        productNamesList: Array.from(spu.productNames),
        compareData: compareSpuMap?.[spu.spuName] || null,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return result;
  }, [salesData, spuMode]);

  // 导出函数
  const handleExportTimeSeries = () => {
    if (!salesData?.timeSeries) return;

    try {
      const exportData = salesData.timeSeries.map(item => {
        // 兼容两种数据格式：有对比期时使用 current，无对比期时直接使用
        const orders = item.current?.orders ?? item.orders ?? 0;
        const quantity = item.current?.quantity ?? item.quantity ?? 0;
        const revenue = item.current?.revenue ?? item.revenue ?? 0;

        return {
          日期: item.date,
          订单数: orders,
          销售量: quantity,
          销售额: revenue,
        };
      });

      exportToExcel(exportData, '销售趋势');
      toast.success('导出成功');
    } catch (error) {
      toast.error('导出失败');
    }
  };

  const handleExportSPU = () => {
    if (!spuData) return;

    try {
      const totalRevenue = spuData.reduce((sum, spu) => sum + spu.revenue, 0);

      const exportData = spuData.map((item, index) => {
        const percentage = totalRevenue > 0 ? (item.revenue / totalRevenue * 100).toFixed(1) : '0';
        const data: any = {
          排名: index + 1,
          'SPU名称': item.spuName,
          '产品数量': item.productCount,
          'SKU数量': item.skuCount,
          订单数: item.orderCount,
          销售量: item.quantity,
          销售额: item.revenue,
          占比: `${percentage}%`,
          站点数: item.siteCount,
          '包含的产品': item.productNamesList.join(' | '),
        };

        if (salesData?.compare && item.compareData) {
          const orderGrowth = item.compareData.orderCount > 0
            ? ((item.orderCount - item.compareData.orderCount) / item.compareData.orderCount * 100).toFixed(1)
            : 'N/A';
          const quantityGrowth = item.compareData.quantity > 0
            ? ((item.quantity - item.compareData.quantity) / item.compareData.quantity * 100).toFixed(1)
            : 'N/A';
          const revenueGrowth = item.compareData.revenue > 0
            ? ((item.revenue - item.compareData.revenue) / item.compareData.revenue * 100).toFixed(1)
            : 'N/A';

          data['订单数增长'] = `${orderGrowth}%`;
          data['销售量增长'] = `${quantityGrowth}%`;
          data['销售额增长'] = `${revenueGrowth}%`;
        }

        return data;
      });

      const modeLabel = getSpuModeLabel(spuMode);
      exportToExcel(exportData, `SPU销售明细_${modeLabel}`);
      toast.success('导出成功');
    } catch (error) {
      toast.error('导出失败');
    }
  };

  const handleExportSKU = () => {
    if (!salesData?.current?.bySku) return;

    try {
      const skuArray = Object.values(salesData.current.bySku)
        .sort((a: any, b: any) => b.revenue - a.revenue);

      const exportData = skuArray.map((item: any, index) => ({
        排名: index + 1,
        SKU: item.sku,
        产品名称: item.name,
        订单数: item.orderCount,
        销售量: item.quantity,
        销售额: item.revenue,
        站点数: item.sites?.length || 0,
      }));

      exportToExcel(exportData, 'SKU销售明细');
      toast.success('导出成功');
    } catch (error) {
      toast.error('导出失败');
    }
  };

  return (
    <TooltipProvider>
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
              compareBySite={salesData.compare?.bySite}
              isLoading={isLoading}
            />

            {/* Country Statistics */}
            {salesData.current.byCountry && Object.keys(salesData.current.byCountry).length > 0 && (
              <CountryStatistics
                current={salesData.current.byCountry}
                compare={salesData.compare?.byCountry}
                isLoading={isLoading}
              />
            )}

            {/* Time Series Chart (if available) */}
            {salesData.timeSeries && salesData.timeSeries.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>销售趋势</CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportTimeSeries}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      导出
                    </Button>
                  </div>
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
                      {salesData.timeSeries.map((item: any) => {
                        // 兼容两种数据格式：有对比期时使用 current，无对比期时直接使用
                        const orders = item.current?.orders ?? item.orders ?? 0;
                        const quantity = item.current?.quantity ?? item.quantity ?? 0;
                        const revenue = item.current?.revenue ?? item.revenue ?? 0;

                        return (
                          <TableRow key={item.date}>
                            <TableCell className="font-medium">{item.date}</TableCell>
                            <TableCell className="text-right">{formatNumber(orders)}</TableCell>
                            <TableCell className="text-right">{formatNumber(quantity)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(revenue)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Product Details with SPU/SKU Tabs */}
            {salesData.current.bySku && Object.keys(salesData.current.bySku).length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>产品销售明细</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="spu" className="w-full">
                    <TabsList className="mb-4">
                      <TabsTrigger value="spu" className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        SPU视图
                      </TabsTrigger>
                      <TabsTrigger value="sku" className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        SKU视图
                      </TabsTrigger>
                    </TabsList>

                    {/* SPU View */}
                    <TabsContent value="spu">
                      <div className="space-y-4">
                        {/* SPU聚合模式选择和导出按钮 */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <Label htmlFor="spu-mode" className="text-sm font-medium whitespace-nowrap">
                              聚合模式:
                            </Label>
                            <Select
                              value={spuMode}
                              onValueChange={(value) => setSpuMode(value as SpuExtractionMode)}
                            >
                              <SelectTrigger id="spu-mode" className="w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="series">
                                  <div className="flex flex-col items-start">
                                    <span className="font-medium">系列名称</span>
                                    <span className="text-xs text-muted-foreground">提取"-"之前</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="sku-prefix">
                                  <div className="flex flex-col items-start">
                                    <span className="font-medium">SKU前缀</span>
                                    <span className="text-xs text-muted-foreground">按SKU前缀聚合（推荐多语言）</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="before-comma">
                                  <div className="flex flex-col items-start">
                                    <span className="font-medium">逗号之前</span>
                                    <span className="text-xs text-muted-foreground">提取","之前完整描述</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="full">
                                  <div className="flex flex-col items-start">
                                    <span className="font-medium">完整名称</span>
                                    <span className="text-xs text-muted-foreground">不聚合，独立统计</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {spuData && (
                              <span className="text-sm text-muted-foreground">
                                聚合后 {spuData.length} 个SPU
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportSPU}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            导出SPU数据
                          </Button>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[60px]">排名</TableHead>
                              <TableHead>SPU名称</TableHead>
                              <TableHead className="text-right">产品数</TableHead>
                              <TableHead className="text-right">SKU数</TableHead>
                              <TableHead className="text-right">订单数</TableHead>
                              {salesData.compare && <TableHead className="text-right">订单增长</TableHead>}
                              <TableHead className="text-right">销售量</TableHead>
                              {salesData.compare && <TableHead className="text-right">销量增长</TableHead>}
                              <TableHead className="text-right">销售额</TableHead>
                              {salesData.compare && <TableHead className="text-right">销售额增长</TableHead>}
                              <TableHead className="text-right">占比</TableHead>
                              <TableHead className="text-right">站点数</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {spuData?.slice(0, 100).map((item, index) => {
                              const totalRevenue = spuData.reduce((sum, spu) => sum + spu.revenue, 0);
                              const percentage = totalRevenue > 0 ? (item.revenue / totalRevenue * 100).toFixed(1) : '0';

                              return (
                              <TableRow key={item.spuName}>
                                <TableCell className="font-medium">#{index + 1}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{item.spuName}</span>
                                    {item.productCount > 1 && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-xs text-muted-foreground cursor-help">
                                            包含 {item.productCount} 个产品
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-md">
                                          <div className="space-y-1">
                                            <p className="font-semibold text-xs">包含的产品:</p>
                                            {item.productNamesList.map((name, idx) => (
                                              <p key={idx} className="text-xs">• {name}</p>
                                            ))}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{item.productCount}</TableCell>
                                <TableCell className="text-right">{item.skuCount}</TableCell>
                                <TableCell className="text-right">{formatNumber(item.orderCount)}</TableCell>
                                {salesData.compare && (
                                  <TableCell className="text-right">
                                    {formatGrowth(item.orderCount, item.compareData?.orderCount)}
                                  </TableCell>
                                )}
                                <TableCell className="text-right">{formatNumber(item.quantity)}</TableCell>
                                {salesData.compare && (
                                  <TableCell className="text-right">
                                    {formatGrowth(item.quantity, item.compareData?.quantity)}
                                  </TableCell>
                                )}
                                <TableCell className="text-right">{formatCurrency(item.revenue)}</TableCell>
                                {salesData.compare && (
                                  <TableCell className="text-right">
                                    {formatGrowth(item.revenue, item.compareData?.revenue)}
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
                                <TableCell className="text-right">{item.siteCount}</TableCell>
                              </TableRow>
                            );
                            })}
                          </TableBody>
                        </Table>
                        {spuData && spuData.length > 100 && (
                          <p className="text-sm text-muted-foreground mt-4 text-center">
                            仅显示前100个SPU，共{spuData.length}个SPU有销售
                          </p>
                        )}
                      </div>
                    </TabsContent>

                    {/* SKU View */}
                    <TabsContent value="sku">
                      <div className="space-y-4">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportSKU}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            导出SKU数据
                          </Button>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[60px]">排名</TableHead>
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
                              .map((item: any, index) => (
                                <TableRow key={item.sku}>
                                  <TableCell className="font-medium">#{index + 1}</TableCell>
                                  <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                                  <TableCell className="max-w-[200px] truncate" title={item.name}>{item.name}</TableCell>
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
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </>
          )
        ) : null}
        </div>
      </PageLayout>
    </TooltipProvider>
  );
}