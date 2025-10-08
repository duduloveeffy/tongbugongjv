'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Loader2,
  BarChart3,
  LineChartIcon,
  X,
} from 'lucide-react';
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
import { exportToExcel } from '@/lib/export-utils';
import { toast } from 'sonner';
import type { SpuExtractionMode } from '@/lib/spu-utils';

interface SpuTrendDetailProps {
  spu: string;
  spuMode: SpuExtractionMode;
  // 查询上下文参数
  dateRange: { start: string; end: string };
  groupBy: 'day' | 'week' | 'month';
  selectedSites: string[];
  orderStatuses: string[];
  nameMapping?: Record<string, string>;
  onClose?: () => void;
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

export function SpuTrendDetail({
  spu,
  spuMode,
  dateRange,
  groupBy: currentGroupBy,
  selectedSites,
  orderStatuses,
  nameMapping,
  onClose,
}: SpuTrendDetailProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('current');
  const [groupBy, setGroupBy] = useState<GroupBy>('current');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [trendData, setTrendData] = useState<TrendDataPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalStats, setTotalStats] = useState({ orders: 0, quantity: 0, revenue: 0 });

  // 加载趋势数据
  useEffect(() => {
    loadTrendData();
  }, [spu, timeRange, groupBy, selectedSites, orderStatuses]);

  const loadTrendData = async () => {
    setLoading(true);
    try {
      // 计算日期范围
      let start: string = dateRange.start;
      let end: string = dateRange.end;
      let actualGroupBy = currentGroupBy;

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

      if (groupBy !== 'current') {
        actualGroupBy = groupBy as 'day' | 'week' | 'month';
      }

      const response = await fetch('/api/sales/spu-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spu,
          spuMode,
          siteIds: selectedSites,
          statuses: orderStatuses,
          dateStart: start,
          dateEnd: end,
          groupBy: actualGroupBy,
          nameMapping: nameMapping || {},
        }),
      });

      if (!response.ok) {
        // 捕获 Vercel 超时错误 (504 Gateway Timeout)
        if (response.status === 504) {
          toast.error('Vercel 查询超时，数据量过大，建议缩小时间范围后重试以及寻找管理员查询问题。', { duration: 10000 });
          setTrendData([]);
          return;
        }
        throw new Error('Failed to fetch SPU trends');
      }

      const result = await response.json();
      if (result.success) {
        setTrendData(result.data.trends);
        setTotalStats({
          orders: result.data.totalOrders || 0,
          quantity: result.data.trends.reduce((sum: number, t: TrendDataPoint) => sum + t.quantity, 0),
          revenue: result.data.trends.reduce((sum: number, t: TrendDataPoint) => sum + t.revenue, 0),
        });
      } else {
        throw new Error(result.error || 'Failed to load trends');
      }
    } catch (error: any) {
      console.error('Failed to load SPU trends:', error);
      // 如果是网络错误或超时，显示更具体的提示
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        toast.error('Vercel 查询超时，数据量过大，建议缩小时间范围后重试以及寻找管理员查询问题。', { duration: 10000 });
      } else {
        toast.error('加载SPU趋势数据失败');
      }
    } finally {
      setLoading(false);
    }
  };

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

  const handleExport = () => {
    if (!trendData || trendData.length === 0) {
      toast.error('暂无数据可导出');
      return;
    }

    try {
      const exportData = trendData.map((item) => ({
        日期: item.date,
        订单数: item.orders,
        销售量: item.quantity,
        销售额: item.revenue,
      }));

      exportToExcel(
        exportData,
        `SPU_${spu}_趋势_${timeRangeLabels[timeRange]}_${groupByLabels[groupBy]}`
      );
      toast.success('导出成功');
    } catch (error) {
      toast.error('导出失败');
    }
  };

  // 禁用按天+长时间范围（数据点过多）
  const isDayDisabled = (timeRange === '12months' || timeRange === 'all') && groupBy === 'day';

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>SPU 趋势分析</CardTitle>
            <Badge variant="secondary" className="font-mono">
              {spu}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {onClose && (
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* 控制面板 */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {/* 时间范围选择 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">时间范围:</span>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
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
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupBy)}
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

          {/* 图表类型切换 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">图表类型:</span>
            <div className="flex border rounded-md">
              <Button
                size="sm"
                variant={chartType === 'line' ? 'default' : 'ghost'}
                className="rounded-r-none"
                onClick={() => setChartType('line')}
              >
                <LineChartIcon className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant={chartType === 'bar' ? 'default' : 'ghost'}
                className="rounded-l-none"
                onClick={() => setChartType('bar')}
              >
                <BarChart3 className="h-3 w-3" />
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="h-3 w-3 mr-1" />
              导出
            </Button>
          </div>
        </div>

        {/* 汇总统计 */}
        {!loading && trendData && (
          <div className="flex gap-4 mt-4">
            <Badge variant="secondary">总订单: {formatNumber(totalStats.orders)}</Badge>
            <Badge variant="secondary">总销量: {formatNumber(totalStats.quantity)}</Badge>
            <Badge variant="secondary">总销售额: {formatCurrency(totalStats.revenue)}</Badge>
            <Badge variant="outline">数据点: {trendData.length}</Badge>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3 text-sm text-muted-foreground">正在加载趋势数据...</span>
          </div>
        ) : trendData && trendData.length > 0 ? (
          <div className="space-y-6">
            {/* 图表可视化 */}
            <div className="bg-white border rounded-lg p-4">
              <ResponsiveContainer width="100%" height={400}>
                {chartType === 'line' ? (
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 11 }}
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
                      dot={{ r: 3 }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="quantity"
                      stroke="#82ca9d"
                      name="销售量"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#ffc658"
                      name="销售额"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 11 }}
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
                    <Bar yAxisId="left" dataKey="orders" fill="#8884d8" name="订单数" />
                    <Bar yAxisId="left" dataKey="quantity" fill="#82ca9d" name="销售量" />
                    <Bar yAxisId="right" dataKey="revenue" fill="#ffc658" name="销售额" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* 数据表格 */}
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
                    <TableCell className="text-right">{formatNumber(totalStats.orders)}</TableCell>
                    <TableCell className="text-right">{formatNumber(totalStats.quantity)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalStats.revenue)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              共 {trendData.length} 个时间段
            </p>
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">该时间段内暂无该SPU的销售数据</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
