'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MonthPicker } from '@/components/reports/MonthPicker';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, Info } from 'lucide-react';
import Link from 'next/link';

// 月份值类型
interface MonthValue {
  year: number;
  month: number;
}

// 计算该周在月份中是第几周（与 WeekPicker 保持一致）
function getWeekOfMonth(date: Date): number {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDayWeekday = firstDayOfMonth.getDay();
  const adjustedFirstDay = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1;
  const dayOfMonth = date.getDate();
  return Math.ceil((dayOfMonth + adjustedFirstDay) / 7);
}

// 格式化周显示（与 WeekPicker 保持一致）
function formatWeekDisplay(startDateStr: string): string {
  const date = new Date(startDateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const weekOfMonth = getWeekOfMonth(date);
  const shortYear = year.toString().slice(-2);
  return `${shortYear}年${month}月第${weekOfMonth}周`;
}

interface WeekData {
  weekNumber: number;
  startDate: string;
  endDate: string;
  orders: number;
  revenue: number;
  quantity: number;
  vapsoloOrders: number;
  vapsoloRevenue: number;
  vapsoloQuantity: number;
  vapsoloRetailOrders: number;
  vapsoloRetailRevenue: number;
  vapsoloRetailQuantity: number;
  vapsoloWholesaleOrders: number;
  vapsoloWholesaleRevenue: number;
  vapsoloWholesaleQuantity: number;
  spacexvapeOrders: number;
  spacexvapeRevenue: number;
  spacexvapeQuantity: number;
  otherOrders: number;
  otherRevenue: number;
  otherQuantity: number;
}

interface SummaryData {
  orders: number;
  revenue: number;
  quantity: number;
  vapsoloOrders: number;
  vapsoloRevenue: number;
  vapsoloQuantity: number;
  vapsoloRetailOrders: number;
  vapsoloRetailRevenue: number;
  vapsoloRetailQuantity: number;
  vapsoloWholesaleOrders: number;
  vapsoloWholesaleRevenue: number;
  vapsoloWholesaleQuantity: number;
  spacexvapeOrders: number;
  spacexvapeRevenue: number;
  spacexvapeQuantity: number;
  otherOrders: number;
  otherRevenue: number;
  otherQuantity: number;
}

interface DifferenceData {
  orders: number;
  revenue: number;
  quantity: number;
  ordersPercent: string;
  revenuePercent: string;
  quantityPercent: string;
  vapsoloOrders: number;
  vapsoloRevenue: number;
  vapsoloQuantity: number;
  vapsoloOrdersPercent: string;
  vapsoloRevenuePercent: string;
  vapsoloQuantityPercent: string;
  vapsoloRetailOrders: number;
  vapsoloRetailRevenue: number;
  vapsoloRetailQuantity: number;
  vapsoloRetailOrdersPercent: string;
  vapsoloRetailRevenuePercent: string;
  vapsoloRetailQuantityPercent: string;
  vapsoloWholesaleOrders: number;
  vapsoloWholesaleRevenue: number;
  vapsoloWholesaleQuantity: number;
  vapsoloWholesaleOrdersPercent: string;
  vapsoloWholesaleRevenuePercent: string;
  vapsoloWholesaleQuantityPercent: string;
  spacexvapeOrders: number;
  spacexvapeRevenue: number;
  spacexvapeQuantity: number;
  spacexvapeOrdersPercent: string;
  spacexvapeRevenuePercent: string;
  spacexvapeQuantityPercent: string;
  otherOrders: number;
  otherRevenue: number;
  otherQuantity: number;
  otherOrdersPercent: string;
  otherRevenuePercent: string;
  otherQuantityPercent: string;
}

interface ValidationResult {
  period: {
    year: number;
    month: number;
    monthName: string;
    startDate: string;
    endDate: string;
  };
  weeks: WeekData[];
  weeklySum: SummaryData;
  monthlyData: SummaryData;
  difference: DifferenceData;
  isValid: boolean;
  validationNotes: string[];
}

// 周范围模式类型
type WeekRangeMode = 'full' | 'monthly';

export default function DataValidationPage() {
  const [selectedMonth, setSelectedMonth] = useState<MonthValue | undefined>();
  const [weekRangeMode, setWeekRangeMode] = useState<WeekRangeMode>('full');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!selectedMonth) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/reports/data-validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedMonth.year,
          month: selectedMonth.month,
          weekRangeMode,
        }),
      });

      if (!response.ok) {
        throw new Error('验证请求失败');
      }

      const result = await response.json();
      setValidationResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败');
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

  const getDiffClass = (diff: number) => {
    if (diff === 0) return 'text-green-600';
    return 'text-red-600';
  };

  const getStatusIcon = () => {
    if (!validationResult) return null;
    if (validationResult.isValid) {
      return <CheckCircle2 className="h-6 w-6 text-green-500" />;
    }
    // 如果有跨月周，显示警告而不是错误
    if (validationResult.validationNotes.some(n => n.includes('跨月'))) {
      return <AlertTriangle className="h-6 w-6 text-amber-500" />;
    }
    return <XCircle className="h-6 w-6 text-red-500" />;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/reports/weekly">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">数据验证</h1>
            <p className="text-sm text-muted-foreground">
              对比周报汇总数据与月报数据，验证计算逻辑是否一致
            </p>
          </div>
        </div>
      </div>

      {/* 页面用途说明 */}
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="py-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-slate-700">
              <p className="font-medium">此页面供开发者调试使用</p>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li><span className="font-medium">独立数据源</span> - 直接从 Supabase 数据库查询原始订单数据，不依赖周报的计算逻辑</li>
                <li><span className="font-medium">问题排查</span> - 当周报数据异常时，可通过此页面定位问题（如：分页限制、日期边界、品牌过滤等）</li>
                <li><span className="font-medium">逻辑验证</span> - 对比周汇总与月汇总，验证 ISO 周计算、品牌分类等逻辑是否正确</li>
                <li><span className="font-medium">原始数据</span> - 显示每周实际订单数、销售额，不做任何"对齐"处理，如有差异会如实显示</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 选择月份和周范围模式 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">选择验证参数</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
            <Button onClick={handleValidate} disabled={!selectedMonth || loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              开始验证
            </Button>
          </div>

          {/* 周范围模式选择 */}
          <div className="flex items-center gap-4 pt-2 border-t">
            <span className="text-sm font-medium text-muted-foreground">周范围模式:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWeekRangeMode('full')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  weekRangeMode === 'full'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                完整周
              </button>
              <button
                type="button"
                onClick={() => setWeekRangeMode('monthly')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  weekRangeMode === 'monthly'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                月内周
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {weekRangeMode === 'full'
                ? '按 ISO 周完整 7 天计算（如 10/28 ~ 11/3）'
                : '周范围被月边界截断（如 10/28 ~ 10/31 只算月内部分）'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* 验证结果 */}
      {validationResult && (
        <>
          {/* 验证状态 */}
          <Card className={validationResult.isValid ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}>
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                {getStatusIcon()}
                <div className="space-y-1">
                  <div className="font-semibold">
                    {validationResult.period.year}年{validationResult.period.monthName} 验证结果
                  </div>
                  <div className="text-sm text-muted-foreground">
                    数据范围: {validationResult.period.startDate} ~ {validationResult.period.endDate}
                  </div>
                  <ul className="text-sm space-y-1 mt-2">
                    {validationResult.validationNotes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 周数据明细 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">周数据明细</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">周</th>
                      <th className="text-left p-2">日期范围</th>
                      <th className="text-right p-2">总订单</th>
                      <th className="text-right p-2">总销售额</th>
                      <th className="text-right p-2">总销量</th>
                      <th className="text-right p-2 bg-blue-50">Vapsolo订单</th>
                      <th className="text-right p-2 bg-blue-50">Vapsolo销售额</th>
                      <th className="text-right p-2 bg-blue-50">Vapsolo销量</th>
                      <th className="text-right p-2 bg-green-50">集合站1订单</th>
                      <th className="text-right p-2 bg-green-50">集合站1销售额</th>
                      <th className="text-right p-2 bg-amber-50">集合站2订单</th>
                      <th className="text-right p-2 bg-amber-50">集合站2销售额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResult.weeks.map((week, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="p-2 font-medium">{formatWeekDisplay(week.startDate)}</td>
                        <td className="p-2 text-muted-foreground">{week.startDate} ~ {week.endDate}</td>
                        <td className="p-2 text-right">{formatNumber(week.orders)}</td>
                        <td className="p-2 text-right">{formatCurrency(week.revenue)}</td>
                        <td className="p-2 text-right">{formatNumber(week.quantity)}</td>
                        <td className="p-2 text-right bg-blue-50/50">{formatNumber(week.vapsoloOrders)}</td>
                        <td className="p-2 text-right bg-blue-50/50">{formatCurrency(week.vapsoloRevenue)}</td>
                        <td className="p-2 text-right bg-blue-50/50">{formatNumber(week.vapsoloQuantity)}</td>
                        <td className="p-2 text-right bg-green-50/50">{formatNumber(week.spacexvapeOrders)}</td>
                        <td className="p-2 text-right bg-green-50/50">{formatCurrency(week.spacexvapeRevenue)}</td>
                        <td className="p-2 text-right bg-amber-50/50">{formatNumber(week.otherOrders)}</td>
                        <td className="p-2 text-right bg-amber-50/50">{formatCurrency(week.otherRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 对比表格 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">周报汇总 vs 月报数据对比</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">维度</th>
                      <th className="text-right p-2">周报汇总-订单</th>
                      <th className="text-right p-2">月报-订单</th>
                      <th className="text-right p-2">差异</th>
                      <th className="text-right p-2">周报汇总-销售额</th>
                      <th className="text-right p-2">月报-销售额</th>
                      <th className="text-right p-2">差异</th>
                      <th className="text-right p-2">周报汇总-销量</th>
                      <th className="text-right p-2">月报-销量</th>
                      <th className="text-right p-2">差异</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 总计 */}
                    <tr className="border-b font-semibold bg-gray-50">
                      <td className="p-2">全部站点总计</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.orders)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.orders)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.orders)}`}>
                        {validationResult.difference.orders > 0 ? '+' : ''}{validationResult.difference.orders}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.weeklySum.revenue)}</td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.monthlyData.revenue)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.revenue)}`}>
                        {validationResult.difference.revenue > 0 ? '+' : ''}{formatCurrency(validationResult.difference.revenue)}
                      </td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.quantity)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.quantity)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.quantity)}`}>
                        {validationResult.difference.quantity > 0 ? '+' : ''}{validationResult.difference.quantity}
                      </td>
                    </tr>

                    {/* Vapsolo */}
                    <tr className="border-b bg-blue-50/50">
                      <td className="p-2 font-medium text-blue-900">Vapsolo (总计)</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.vapsoloOrders)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.vapsoloOrders)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.vapsoloOrders)}`}>
                        {validationResult.difference.vapsoloOrders > 0 ? '+' : ''}{validationResult.difference.vapsoloOrders}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.weeklySum.vapsoloRevenue)}</td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.monthlyData.vapsoloRevenue)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.vapsoloRevenue)}`}>
                        {validationResult.difference.vapsoloRevenue > 0 ? '+' : ''}{formatCurrency(validationResult.difference.vapsoloRevenue)}
                      </td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.vapsoloQuantity)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.vapsoloQuantity)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.vapsoloQuantity)}`}>
                        {validationResult.difference.vapsoloQuantity > 0 ? '+' : ''}{validationResult.difference.vapsoloQuantity}
                      </td>
                    </tr>

                    {/* Vapsolo 零售 */}
                    <tr className="border-b bg-blue-50/30">
                      <td className="p-2 pl-6 text-blue-800">└ 零售站</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.vapsoloRetailOrders)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.vapsoloRetailOrders)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.vapsoloRetailOrders)}`}>
                        {validationResult.difference.vapsoloRetailOrders > 0 ? '+' : ''}{validationResult.difference.vapsoloRetailOrders}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.weeklySum.vapsoloRetailRevenue)}</td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.monthlyData.vapsoloRetailRevenue)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.vapsoloRetailRevenue)}`}>
                        {validationResult.difference.vapsoloRetailRevenue > 0 ? '+' : ''}{formatCurrency(validationResult.difference.vapsoloRetailRevenue)}
                      </td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.vapsoloRetailQuantity)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.vapsoloRetailQuantity)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.vapsoloRetailQuantity)}`}>
                        {validationResult.difference.vapsoloRetailQuantity > 0 ? '+' : ''}{validationResult.difference.vapsoloRetailQuantity}
                      </td>
                    </tr>

                    {/* Vapsolo 批发 */}
                    <tr className="border-b bg-indigo-50/30">
                      <td className="p-2 pl-6 text-indigo-800">└ 批发站</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.vapsoloWholesaleOrders)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.vapsoloWholesaleOrders)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.vapsoloWholesaleOrders)}`}>
                        {validationResult.difference.vapsoloWholesaleOrders > 0 ? '+' : ''}{validationResult.difference.vapsoloWholesaleOrders}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.weeklySum.vapsoloWholesaleRevenue)}</td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.monthlyData.vapsoloWholesaleRevenue)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.vapsoloWholesaleRevenue)}`}>
                        {validationResult.difference.vapsoloWholesaleRevenue > 0 ? '+' : ''}{formatCurrency(validationResult.difference.vapsoloWholesaleRevenue)}
                      </td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.vapsoloWholesaleQuantity)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.vapsoloWholesaleQuantity)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.vapsoloWholesaleQuantity)}`}>
                        {validationResult.difference.vapsoloWholesaleQuantity > 0 ? '+' : ''}{validationResult.difference.vapsoloWholesaleQuantity}
                      </td>
                    </tr>

                    {/* 集合站1 */}
                    <tr className="border-b bg-green-50/50">
                      <td className="p-2 font-medium text-green-900">集合站1</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.spacexvapeOrders)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.spacexvapeOrders)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.spacexvapeOrders)}`}>
                        {validationResult.difference.spacexvapeOrders > 0 ? '+' : ''}{validationResult.difference.spacexvapeOrders}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.weeklySum.spacexvapeRevenue)}</td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.monthlyData.spacexvapeRevenue)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.spacexvapeRevenue)}`}>
                        {validationResult.difference.spacexvapeRevenue > 0 ? '+' : ''}{formatCurrency(validationResult.difference.spacexvapeRevenue)}
                      </td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.spacexvapeQuantity)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.spacexvapeQuantity)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.spacexvapeQuantity)}`}>
                        {validationResult.difference.spacexvapeQuantity > 0 ? '+' : ''}{validationResult.difference.spacexvapeQuantity}
                      </td>
                    </tr>

                    {/* 集合站2 */}
                    <tr className="border-b bg-amber-50/50">
                      <td className="p-2 font-medium text-amber-900">集合站2</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.otherOrders)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.otherOrders)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.otherOrders)}`}>
                        {validationResult.difference.otherOrders > 0 ? '+' : ''}{validationResult.difference.otherOrders}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.weeklySum.otherRevenue)}</td>
                      <td className="p-2 text-right">{formatCurrency(validationResult.monthlyData.otherRevenue)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.otherRevenue)}`}>
                        {validationResult.difference.otherRevenue > 0 ? '+' : ''}{formatCurrency(validationResult.difference.otherRevenue)}
                      </td>
                      <td className="p-2 text-right">{formatNumber(validationResult.weeklySum.otherQuantity)}</td>
                      <td className="p-2 text-right">{formatNumber(validationResult.monthlyData.otherQuantity)}</td>
                      <td className={`p-2 text-right ${getDiffClass(validationResult.difference.otherQuantity)}`}>
                        {validationResult.difference.otherQuantity > 0 ? '+' : ''}{validationResult.difference.otherQuantity}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 说明 */}
              <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <p className="font-medium mb-2">数据验证说明：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>周报汇总：将该月所有包含的周数据相加</li>
                  <li>月报数据：按月份日期边界（1日~月末）直接计算</li>
                  <li>差异原因：ISO周可能跨越月份边界，导致周汇总与月数据存在差异</li>
                  <li>绿色表示数据一致，红色表示存在差异</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Vapsolo 零售/批发数据校验 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vapsolo 子维度校验</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                {/* 周报汇总校验 */}
                <div className="space-y-3">
                  <h4 className="font-medium">周报汇总校验</h4>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span>零售 + 批发 订单数</span>
                      <span className="font-mono">
                        {validationResult.weeklySum.vapsoloRetailOrders} + {validationResult.weeklySum.vapsoloWholesaleOrders} = {validationResult.weeklySum.vapsoloRetailOrders + validationResult.weeklySum.vapsoloWholesaleOrders}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span>Vapsolo 总订单数</span>
                      <span className="font-mono">{validationResult.weeklySum.vapsoloOrders}</span>
                    </div>
                    <div className={`flex justify-between p-2 rounded ${validationResult.weeklySum.vapsoloRetailOrders + validationResult.weeklySum.vapsoloWholesaleOrders === validationResult.weeklySum.vapsoloOrders ? 'bg-green-100' : 'bg-red-100'}`}>
                      <span>校验结果</span>
                      <span className="font-mono">
                        {validationResult.weeklySum.vapsoloRetailOrders + validationResult.weeklySum.vapsoloWholesaleOrders === validationResult.weeklySum.vapsoloOrders ? '✓ 一致' : '✗ 不一致'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 月报数据校验 */}
                <div className="space-y-3">
                  <h4 className="font-medium">月报数据校验</h4>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span>零售 + 批发 订单数</span>
                      <span className="font-mono">
                        {validationResult.monthlyData.vapsoloRetailOrders} + {validationResult.monthlyData.vapsoloWholesaleOrders} = {validationResult.monthlyData.vapsoloRetailOrders + validationResult.monthlyData.vapsoloWholesaleOrders}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span>Vapsolo 总订单数</span>
                      <span className="font-mono">{validationResult.monthlyData.vapsoloOrders}</span>
                    </div>
                    <div className={`flex justify-between p-2 rounded ${validationResult.monthlyData.vapsoloRetailOrders + validationResult.monthlyData.vapsoloWholesaleOrders === validationResult.monthlyData.vapsoloOrders ? 'bg-green-100' : 'bg-red-100'}`}>
                      <span>校验结果</span>
                      <span className="font-mono">
                        {validationResult.monthlyData.vapsoloRetailOrders + validationResult.monthlyData.vapsoloWholesaleOrders === validationResult.monthlyData.vapsoloOrders ? '✓ 一致' : '✗ 不一致'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 销量校验 */}
              <div className="mt-6 grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-medium">周报汇总 - 销量校验</h4>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span>零售 + 批发 销量</span>
                      <span className="font-mono">
                        {formatNumber(validationResult.weeklySum.vapsoloRetailQuantity)} + {formatNumber(validationResult.weeklySum.vapsoloWholesaleQuantity)} = {formatNumber(validationResult.weeklySum.vapsoloRetailQuantity + validationResult.weeklySum.vapsoloWholesaleQuantity)}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span>Vapsolo 总销量</span>
                      <span className="font-mono">{formatNumber(validationResult.weeklySum.vapsoloQuantity)}</span>
                    </div>
                    <div className={`flex justify-between p-2 rounded ${validationResult.weeklySum.vapsoloRetailQuantity + validationResult.weeklySum.vapsoloWholesaleQuantity === validationResult.weeklySum.vapsoloQuantity ? 'bg-green-100' : 'bg-red-100'}`}>
                      <span>校验结果</span>
                      <span className="font-mono">
                        {validationResult.weeklySum.vapsoloRetailQuantity + validationResult.weeklySum.vapsoloWholesaleQuantity === validationResult.weeklySum.vapsoloQuantity ? '✓ 一致' : '✗ 不一致'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium">月报数据 - 销量校验</h4>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span>零售 + 批发 销量</span>
                      <span className="font-mono">
                        {formatNumber(validationResult.monthlyData.vapsoloRetailQuantity)} + {formatNumber(validationResult.monthlyData.vapsoloWholesaleQuantity)} = {formatNumber(validationResult.monthlyData.vapsoloRetailQuantity + validationResult.monthlyData.vapsoloWholesaleQuantity)}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span>Vapsolo 总销量</span>
                      <span className="font-mono">{formatNumber(validationResult.monthlyData.vapsoloQuantity)}</span>
                    </div>
                    <div className={`flex justify-between p-2 rounded ${validationResult.monthlyData.vapsoloRetailQuantity + validationResult.monthlyData.vapsoloWholesaleQuantity === validationResult.monthlyData.vapsoloQuantity ? 'bg-green-100' : 'bg-red-100'}`}>
                      <span>校验结果</span>
                      <span className="font-mono">
                        {validationResult.monthlyData.vapsoloRetailQuantity + validationResult.monthlyData.vapsoloWholesaleQuantity === validationResult.monthlyData.vapsoloQuantity ? '✓ 一致' : '✗ 不一致'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}