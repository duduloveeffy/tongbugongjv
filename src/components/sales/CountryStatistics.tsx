'use client';

import { useState, Fragment, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, TrendingUp, TrendingDown, ChevronRight, ChevronDown, Loader2, BarChart3, LineChartIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getCountryName } from '@/lib/country-utils';
import { exportToExcel } from '@/lib/export-utils';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface CountryData {
  country: string;
  orderCount: number;
  revenue: number;
  quantity: number;
  siteCount: number;
  skuCount: number;
}

interface TrendDataPoint {
  date: string;
  orders: number;
  quantity: number;
  revenue: number;
}

type TimeRange = 'current' | '3months' | '6months' | '12months' | 'all';
type GroupBy = 'current' | 'day' | 'week' | 'month';

const timeRangeLabels: Record<TimeRange, string> = {
  current: '当前筛选期',
  '3months': '最近3个月',
  '6months': '最近6个月',
  '12months': '最近12个月',
  all: '所有时间',
};

const groupByLabels: Record<GroupBy, string> = {
  current: '当前维度',
  day: '按天',
  week: '按周',
  month: '按月',
};

interface CountryStatisticsProps {
  current: Record<string, CountryData>;
  compare?: Record<string, CountryData> | null;
  isLoading?: boolean;
  // 用于查询趋势的上下文参数
  dateRange: { start: string; end: string };
  groupBy: 'day' | 'week' | 'month';
  selectedSites: string[];
  orderStatuses: string[];
}

export function CountryStatistics({
  current,
  compare,
  isLoading = false,
  dateRange,
  groupBy,
  selectedSites,
  orderStatuses,
}: CountryStatisticsProps) {
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<TrendDataPoint[] | null>(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [timeRange, setTimeRange] = useState<TimeRange>('current');
  const [trendGroupBy, setTrendGroupBy] = useState<GroupBy>('current');
  const [totalStats, setTotalStats] = useState({ orders: 0, quantity: 0, revenue: 0 });
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

  // 转换为数组并排序
  const countries = Object.values(current)
    .map(country => {
      const compareData = compare?.[country.country];
      return {
        ...country,
        countryName: getCountryName(country.country),
        compareData,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = countries.reduce((sum, country) => sum + country.revenue, 0);

  // 加载国家趋势数据
  const loadCountryTrend = async (countryCode: string) => {
    setLoadingTrend(true);
    try {
      // 计算日期范围
      let start: string = dateRange.start;
      let end: string = dateRange.end;
      let actualGroupBy = groupBy;

      if (timeRange !== 'current') {
        const now = new Date();
        end = now.toISOString().split('T')[0] || '';

        // 创建新的 Date 对象来计算起始日期，避免修改 now
        let startDate: Date;
        switch (timeRange) {
          case '3months':
            startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 3);
            start = startDate.toISOString().split('T')[0] || '';
            break;
          case '6months':
            startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 6);
            start = startDate.toISOString().split('T')[0] || '';
            break;
          case '12months':
            startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 12);
            start = startDate.toISOString().split('T')[0] || '';
            break;
          case 'all':
            start = '2020-01-01'; // 假设数据从2020年开始
            break;
        }
      }

      if (trendGroupBy !== 'current') {
        actualGroupBy = trendGroupBy as 'day' | 'week' | 'month';
      }

      const response = await fetch('/api/sales/country-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: countryCode,
          siteIds: selectedSites,
          statuses: orderStatuses,
          dateStart: start,
          dateEnd: end,
          groupBy: actualGroupBy,
        }),
      });

      if (!response.ok) {
        // 捕获 Vercel 超时错误 (504 Gateway Timeout)
        if (response.status === 504) {
          toast.error('Vercel 查询超时，数据量过大，建议缩小时间范围后重试以及寻找管理员查询问题。', { duration: 10000 });
          setTrendData([]);
          return;
        }
        throw new Error('Failed to fetch country trends');
      }

      const result = await response.json();
      if (result.success) {
        setTrendData(result.data.trends);
        setTotalStats({
          orders: result.data.trends.reduce((sum: number, t: TrendDataPoint) => sum + t.orders, 0),
          quantity: result.data.trends.reduce((sum: number, t: TrendDataPoint) => sum + t.quantity, 0),
          revenue: result.data.trends.reduce((sum: number, t: TrendDataPoint) => sum + t.revenue, 0),
        });
      } else {
        throw new Error(result.error || 'Failed to load trends');
      }
    } catch (error: any) {
      console.error('Failed to load country trends:', error);
      // 如果是网络错误或超时，显示更具体的提示
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        toast.error('Vercel 查询超时，数据量过大，建议缩小时间范围后重试以及寻找管理员查询问题。', { duration: 10000 });
      } else {
        toast.error('加载趋势数据失败');
      }
      setTrendData(null);
    } finally {
      setLoadingTrend(false);
    }
  };

  // 处理国家行点击 - 展开/收起趋势数据
  const handleCountryClick = (countryCode: string) => {
    // 如果点击的是当前展开的国家，则收起
    if (expandedCountry === countryCode) {
      setExpandedCountry(null);
      setTrendData(null); // 清空数据，释放内存
      setTimeRange('current'); // 重置筛选条件
      setTrendGroupBy('current');
    } else {
      // 展开新国家
      setExpandedCountry(countryCode);
      setTrendData(null);
      setTimeRange('current'); // 重置为默认值
      setTrendGroupBy('current');
    }
  };

  // 响应式加载趋势数据
  useEffect(() => {
    if (expandedCountry) {
      loadCountryTrend(expandedCountry);
    }
  }, [expandedCountry, timeRange, trendGroupBy, selectedSites, orderStatuses]);

  // 导出单个国家的趋势数据
  const handleExportCountryTrend = (countryName: string, countryCode: string) => {
    if (!trendData || trendData.length === 0) {
      toast.error('暂无趋势数据可导出');
      return;
    }

    try {
      const exportData = trendData.map(item => ({
        日期: item.date,
        订单数: item.orders,
        销售量: item.quantity,
        销售额: item.revenue,
      }));

      exportToExcel(
        exportData,
        `${countryName}销售趋势_${timeRangeLabels[timeRange]}_${groupByLabels[trendGroupBy]}`
      );
      toast.success('导出成功');
    } catch (error) {
      toast.error('导出失败');
    }
  };

  // 禁用按天+长时间范围（数据点过多）
  const isDayDisabled = (timeRange === '12months' || timeRange === 'all') && trendGroupBy === 'day';

  const handleExport = () => {
    try {
      const exportData = countries.map((item, index) => {
        const data: any = {
          排名: index + 1,
          国家代码: item.country,
          国家名称: item.countryName,
          订单数: item.orderCount,
          销售量: item.quantity,
          销售额: item.revenue,
          站点数: item.siteCount,
          SKU数: item.skuCount,
          占比: `${(item.revenue / totalRevenue * 100).toFixed(1)}%`,
        };

        if (compare) {
          const orderGrowth = item.compareData
            ? ((item.orderCount - item.compareData.orderCount) / item.compareData.orderCount * 100).toFixed(1)
            : 'N/A';
          const quantityGrowth = item.compareData
            ? ((item.quantity - item.compareData.quantity) / item.compareData.quantity * 100).toFixed(1)
            : 'N/A';
          const revenueGrowth = item.compareData
            ? ((item.revenue - item.compareData.revenue) / item.compareData.revenue * 100).toFixed(1)
            : 'N/A';

          data['订单数增长'] = `${orderGrowth}%`;
          data['销售量增长'] = `${quantityGrowth}%`;
          data['销售额增长'] = `${revenueGrowth}%`;
        }

        return data;
      });

      exportToExcel(exportData, '国家销售统计');
      toast.success('导出成功');
    } catch (error) {
      toast.error('导出失败');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>国家销售统计</CardTitle>
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

  if (countries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>国家销售统计</CardTitle>
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
          <CardTitle>国家销售统计</CardTitle>
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
              <TableHead className="w-[60px]">排名</TableHead>
              <TableHead>国家</TableHead>
              <TableHead className="text-right">订单数</TableHead>
              {compare && <TableHead className="text-right">订单增长</TableHead>}
              <TableHead className="text-right">销售量</TableHead>
              {compare && <TableHead className="text-right">销量增长</TableHead>}
              <TableHead className="text-right">销售额</TableHead>
              {compare && <TableHead className="text-right">销售额增长</TableHead>}
              <TableHead className="text-right">站点数</TableHead>
              <TableHead className="text-right">SKU数</TableHead>
              <TableHead className="text-right">占比</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {countries.slice(0, 20).map((country, index) => {
              const percentage = totalRevenue > 0 ? (country.revenue / totalRevenue * 100).toFixed(1) : '0';
              const isExpanded = expandedCountry === country.country;

              return (
                <Fragment key={country.country}>
                  <TableRow
                    onClick={() => handleCountryClick(country.country)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <TableCell className="font-medium">#{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-blue-600 flex-shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        }
                        <div className="flex flex-col">
                          <span className="font-medium">{country.countryName}</span>
                          <span className="text-xs text-muted-foreground">{country.country}</span>
                        </div>
                      </div>
                    </TableCell>
                  <TableCell className="text-right">{formatNumber(country.orderCount)}</TableCell>
                  {compare && (
                    <TableCell className="text-right">
                      {formatGrowth(country.orderCount, country.compareData?.orderCount)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">{formatNumber(country.quantity)}</TableCell>
                  {compare && (
                    <TableCell className="text-right">
                      {formatGrowth(country.quantity, country.compareData?.quantity)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">{formatCurrency(country.revenue)}</TableCell>
                  {compare && (
                    <TableCell className="text-right">
                      {formatGrowth(country.revenue, country.compareData?.revenue)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">{country.siteCount}</TableCell>
                  <TableCell className="text-right">{country.skuCount}</TableCell>
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

                {/* 展开行：趋势详情 */}
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={compare ? 11 : 8} className="bg-gray-50 p-6">
                      {loadingTrend ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                          <span className="ml-3 text-sm text-muted-foreground">
                            正在加载 {country.countryName} 的趋势数据...
                          </span>
                        </div>
                      ) : trendData && trendData.length > 0 ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-sm text-gray-900">
                              {country.countryName} 销售趋势
                            </h4>
                          </div>

                          {/* 控制面板 */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {/* 时间范围选择 */}
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">时间范围:</span>
                              <Select
                                value={timeRange}
                                onValueChange={(v) => setTimeRange(v as TimeRange)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="current">{timeRangeLabels.current}</SelectItem>
                                  <SelectItem value="3months">{timeRangeLabels['3months']}</SelectItem>
                                  <SelectItem value="6months">{timeRangeLabels['6months']}</SelectItem>
                                  <SelectItem value="12months">{timeRangeLabels['12months']}</SelectItem>
                                  <SelectItem value="all">{timeRangeLabels.all}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* 统计维度选择 */}
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">统计维度:</span>
                              <Select
                                value={trendGroupBy}
                                onValueChange={(v) => setTrendGroupBy(v as GroupBy)}
                                disabled={isDayDisabled}
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="current">{groupByLabels.current}</SelectItem>
                                  <SelectItem value="day">{groupByLabels.day}</SelectItem>
                                  <SelectItem value="week">{groupByLabels.week}</SelectItem>
                                  <SelectItem value="month">{groupByLabels.month}</SelectItem>
                                </SelectContent>
                              </Select>
                              {isDayDisabled && (
                                <span className="text-xs text-orange-600">
                                  长时间范围不支持按天统计
                                </span>
                              )}
                            </div>

                            {/* 图表类型和导出 */}
                            <div className="flex items-center gap-2 ml-auto">
                              <span className="text-sm text-muted-foreground">图表类型:</span>
                              {/* 图表类型切换 */}
                              <div className="flex border rounded-md">
                                <Button
                                  size="sm"
                                  variant={chartType === 'line' ? 'default' : 'ghost'}
                                  className="rounded-r-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChartType('line');
                                  }}
                                >
                                  <LineChartIcon className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant={chartType === 'bar' ? 'default' : 'ghost'}
                                  className="rounded-l-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChartType('bar');
                                  }}
                                >
                                  <BarChart3 className="h-3 w-3" />
                                </Button>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation(); // 阻止冒泡，避免收起
                                  handleExportCountryTrend(country.countryName, country.country);
                                }}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                导出
                              </Button>
                            </div>
                          </div>

                          {/* 汇总统计 */}
                          <div className="flex gap-4">
                            <Badge variant="secondary">总订单: {formatNumber(totalStats.orders)}</Badge>
                            <Badge variant="secondary">总销量: {formatNumber(totalStats.quantity)}</Badge>
                            <Badge variant="secondary">总销售额: {formatCurrency(totalStats.revenue)}</Badge>
                            <Badge variant="outline">数据点: {trendData.length}</Badge>
                          </div>

                          {/* 图表可视化 */}
                          <div className="bg-white border rounded-lg p-4">
                            <ResponsiveContainer width="100%" height={300}>
                              {chartType === 'line' ? (
                                <LineChart data={trendData}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis
                                    dataKey="date"
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                    tick={{ fontSize: 12 }}
                                  />
                                  <YAxis yAxisId="left" />
                                  <YAxis yAxisId="right" orientation="right" />
                                  <Tooltip
                                    formatter={(value: number, name: string) => {
                                      if (name === '销售额') return formatCurrency(value);
                                      return formatNumber(value);
                                    }}
                                  />
                                  <Legend />
                                  <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="orders"
                                    stroke="#8884d8"
                                    name="订单数"
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                  />
                                  <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="quantity"
                                    stroke="#82ca9d"
                                    name="销售量"
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                  />
                                  <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="#ffc658"
                                    name="销售额"
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                  />
                                </LineChart>
                              ) : (
                                <BarChart data={trendData}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis
                                    dataKey="date"
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                    tick={{ fontSize: 12 }}
                                  />
                                  <YAxis yAxisId="left" />
                                  <YAxis yAxisId="right" orientation="right" />
                                  <Tooltip
                                    formatter={(value: number, name: string) => {
                                      if (name === '销售额') return formatCurrency(value);
                                      return formatNumber(value);
                                    }}
                                  />
                                  <Legend />
                                  <Bar
                                    yAxisId="left"
                                    dataKey="orders"
                                    fill="#8884d8"
                                    name="订单数"
                                  />
                                  <Bar
                                    yAxisId="left"
                                    dataKey="quantity"
                                    fill="#82ca9d"
                                    name="销售量"
                                  />
                                  <Bar
                                    yAxisId="right"
                                    dataKey="revenue"
                                    fill="#ffc658"
                                    name="销售额"
                                  />
                                </BarChart>
                              )}
                            </ResponsiveContainer>
                          </div>

                          {/* 迷你趋势表格 */}
                          <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-gray-100">
                                  <TableHead className="font-semibold">日期</TableHead>
                                  <TableHead className="text-right font-semibold">订单数</TableHead>
                                  <TableHead className="text-right font-semibold">销售量</TableHead>
                                  <TableHead className="text-right font-semibold">销售额</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {trendData.map((item) => (
                                  <TableRow key={item.date} className="hover:bg-gray-50">
                                    <TableCell className="font-medium">{item.date}</TableCell>
                                    <TableCell className="text-right">{formatNumber(item.orders)}</TableCell>
                                    <TableCell className="text-right">{formatNumber(item.quantity)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.revenue)}</TableCell>
                                  </TableRow>
                                ))}
                                {/* 合计行 */}
                                <TableRow className="bg-gray-50 font-semibold">
                                  <TableCell>合计</TableCell>
                                  <TableCell className="text-right">
                                    {formatNumber(trendData.reduce((sum, item) => sum + item.orders, 0))}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatNumber(trendData.reduce((sum, item) => sum + item.quantity, 0))}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(trendData.reduce((sum, item) => sum + item.revenue, 0))}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>

                          <p className="text-xs text-muted-foreground text-center">
                            共 {trendData.length} 个时间段
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-sm text-muted-foreground">
                            该时间段内暂无 {country.countryName} 的销售数据
                          </p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
            <TableRow className="font-medium bg-gray-50">
              <TableCell colSpan={2}>合计</TableCell>
              <TableCell className="text-right">
                {formatNumber(countries.reduce((sum, c) => sum + c.orderCount, 0))}
              </TableCell>
              {compare && <TableCell />}
              <TableCell className="text-right">
                {formatNumber(countries.reduce((sum, c) => sum + c.quantity, 0))}
              </TableCell>
              {compare && <TableCell />}
              <TableCell className="text-right">{formatCurrency(totalRevenue)}</TableCell>
              {compare && <TableCell />}
              <TableCell className="text-right">
                {new Set(countries.flatMap(c => c.siteCount)).size}
              </TableCell>
              <TableCell className="text-right">
                {new Set(countries.flatMap(c => c.skuCount)).size}
              </TableCell>
              <TableCell className="text-right">100.0%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        {countries.length > 20 && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            仅显示前20个国家，共{countries.length}个国家有销售
          </p>
        )}
      </CardContent>
    </Card>
  );
}
