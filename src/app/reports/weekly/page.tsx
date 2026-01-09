'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Download, FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { WeekPicker, type WeekValue } from '@/components/reports/WeekPicker';
import { MonthPicker } from '@/components/reports/MonthPicker';
import { QuarterPicker } from '@/components/reports/QuarterPicker';
import { getDefaultQuarter } from '@/lib/quarter-utils';
import { OverviewStats } from '@/components/reports/OverviewStats';
import { BrandComparison } from '@/components/reports/BrandComparison';
import { CountryStatsTable } from '@/components/reports/CountryStatsTable';
import { SpuRankingTable } from '@/components/reports/SpuRankingTable';
import { DailyTrendChart } from '@/components/reports/DailyTrendChart';
import * as XLSX from 'xlsx';
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns';
import domtoimage from 'dom-to-image-more';
import { jsPDF } from 'jspdf';

// 汇总统计接口
interface SummaryStats {
  totalOrders: number;
  totalRevenue: number;
  totalQuantity: number;
  avgOrderValue: number;
}

// 增长率接口
interface GrowthStats {
  orders: string;
  revenue: string;
  quantity: string;
  avgOrderValue: string;
}

// API 响应结构
interface ApiResponse {
  success: boolean;
  data: {
    isMonthMode?: boolean; // 是否为月报模式
    period: {
      current: { year: number; week?: number; month?: number; start: string; end: string };
      previous: { year: number; week?: number; month?: number; start: string; end: string };
      previousYear?: { year: number; month?: number; start: string; end: string }; // 去年同月
    };
    summary: {
      current: SummaryStats;
      previous: SummaryStats;
      growth: GrowthStats;
      previousYear?: SummaryStats; // 去年同月汇总
      yearOverYearGrowth?: GrowthStats; // 同比增长率
    };
    siteTypeComparison: {
      retail: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
        previousYear?: { orders: number; revenue: number; quantity: number };
        yearOverYearGrowth?: { orders: string; revenue: string; quantity: string };
      };
      wholesale: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
        previousYear?: { orders: number; revenue: number; quantity: number };
        yearOverYearGrowth?: { orders: string; revenue: string; quantity: string };
      };
    };
    brandComparison: {
      vapsolo: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
        previousYear?: { orders: number; revenue: number; quantity: number };
        yearOverYearGrowth?: { orders: string; revenue: string; quantity: string };
      };
      vapsoloRetail: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
        previousYear?: { orders: number; revenue: number; quantity: number };
        yearOverYearGrowth?: { orders: string; revenue: string; quantity: string };
      };
      vapsoloWholesale: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
        previousYear?: { orders: number; revenue: number; quantity: number };
        yearOverYearGrowth?: { orders: string; revenue: string; quantity: string };
      };
      spacexvape: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
        previousYear?: { orders: number; revenue: number; quantity: number };
        yearOverYearGrowth?: { orders: string; revenue: string; quantity: string };
      };
      other: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
        previousYear?: { orders: number; revenue: number; quantity: number };
        yearOverYearGrowth?: { orders: string; revenue: string; quantity: string };
      };
    };
    all: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
      previousYearDailyTrends?: any[];
    };
    retail: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
      previousYearDailyTrends?: any[];
    };
    wholesale: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
      previousYearDailyTrends?: any[];
    };
    vapsoloBrand: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
      previousYearDailyTrends?: any[];
    };
    vapsoloRetail: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
      previousYearDailyTrends?: any[];
    };
    vapsoloWholesale: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
      previousYearDailyTrends?: any[];
    };
    spacexvapeBrand: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
      previousYearDailyTrends?: any[];
    };
    otherBrand: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
      previousYearDailyTrends?: any[];
    };
  };
}

// 获取 ISO 周数
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// 获取 ISO 周年
function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

// 获取默认周（上周）
function getDefaultWeek(): WeekValue {
  const today = new Date();
  const lastWeek = subWeeks(today, 1);
  const weekStart = startOfWeek(lastWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(lastWeek, { weekStartsOn: 1 });

  return {
    year: getISOWeekYear(weekStart),
    week: getISOWeek(weekStart),
    startDate: format(weekStart, 'yyyy-MM-dd'),
    endDate: format(weekEnd, 'yyyy-MM-dd'),
  };
}

// 周范围模式类型
type WeekRangeMode = 'full' | 'monthly' | 'month' | 'quarter';

// 对比模式类型（月报/季报模式下使用）
type CompareMode = 'mom' | 'yoy'; // mom = month-over-month / quarter-over-quarter (环比), yoy = year-over-year (同比)

// 获取默认月份（上月）
function getDefaultMonth(): { year: number; month: number } {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  if (currentMonth === 1) {
    return { year: currentYear - 1, month: 12 };
  }
  return { year: currentYear, month: currentMonth - 1 };
}

interface VapsoloReportProps {
  initialMode?: 'weekly' | 'monthly' | 'quarterly';
}

export default function VapsoloWeeklyReport({ initialMode = 'weekly' }: VapsoloReportProps) {
  const router = useRouter();
  const [selectedWeek, setSelectedWeek] = useState<WeekValue>(getDefaultWeek());
  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(getDefaultQuarter());
  const [weekRangeMode, setWeekRangeMode] = useState<WeekRangeMode>(
    initialMode === 'quarterly' ? 'quarter' : (initialMode === 'monthly' ? 'month' : 'full')
  );
  const [compareMode, setCompareMode] = useState<CompareMode>('mom'); // 环比/同比切换
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ApiResponse['data'] | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // 月报/季报模式标识
  const isMonthMode = weekRangeMode === 'month';
  const isQuarterMode = weekRangeMode === 'quarter';

  // 处理模式切换，同时更新 URL
  const handleModeChange = (newMode: WeekRangeMode) => {
    setWeekRangeMode(newMode);
    // 根据模式切换对应的 URL
    if (newMode === 'quarter') {
      router.push('/reports/quarterly');
    } else if (newMode === 'month') {
      router.push('/reports/monthly');
    } else {
      router.push('/reports/weekly');
    }
  };

  useEffect(() => {
    loadReport();
  }, [selectedWeek, selectedMonth, selectedQuarter, weekRangeMode]);

  const loadReport = async () => {
    setLoading(true);
    try {
      // 根据模式构建请求参数
      let requestBody;
      if (isQuarterMode) {
        requestBody = {
          year: selectedQuarter.year,
          quarter: selectedQuarter.quarter,
          weekRangeMode: 'quarter' as const,
        };
      } else if (isMonthMode) {
        requestBody = {
          year: selectedMonth.year,
          month: selectedMonth.month,
          weekRangeMode: 'month' as const,
        };
      } else {
        requestBody = {
          year: selectedWeek.year,
          week: selectedWeek.week,
          startDate: selectedWeek.startDate,
          endDate: selectedWeek.endDate,
          weekRangeMode,
        };
      }
      const response = await fetch('/api/reports/vapsolo/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        if (response.status === 504) {
          toast.error('Vercel 查询超时，数据量过大，建议联系管理员查询问题。', { duration: 10000 });
          return;
        }
        throw new Error('Failed to fetch report');
      }

      const result: ApiResponse = await response.json();
      if (result.success) {
        setReportData(result.data);
      } else {
        throw new Error('Failed to load report');
      }
    } catch (error: any) {
      console.error('Failed to load report:', error);
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        toast.error('Vercel 查询超时，数据量过大，建议联系管理员查询问题。', { duration: 10000 });
      } else {
        toast.error(isQuarterMode ? '加载季报失败' : (isMonthMode ? '加载月报失败' : '加载周报失败'));
      }
    } finally {
      setLoading(false);
    }
  };

  const parseGrowth = (growthStr: string): number => {
    return parseFloat(growthStr.replace('%', '').replace('+', ''));
  };

  const handleExportExcel = () => {
    if (!reportData) {
      toast.error('暂无数据可导出');
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();

      // 总体概览 - 改为品牌维度
      const previousLabel = isQuarterMode ? '上季度' : (isMonthMode ? '上月' : '上周');
      const overviewData = [
        ['统计项', '所有站点', 'Vapsolo', '集合站1', '集合站2'],
        ['订单数', reportData.summary.current.totalOrders, reportData.brandComparison.vapsolo.current.orders, reportData.brandComparison.spacexvape.current.orders, reportData.brandComparison.other.current.orders],
        ['销售量', reportData.summary.current.totalQuantity, reportData.brandComparison.vapsolo.current.quantity, reportData.brandComparison.spacexvape.current.quantity, reportData.brandComparison.other.current.quantity],
        ['销售额', reportData.summary.current.totalRevenue, reportData.brandComparison.vapsolo.current.revenue, reportData.brandComparison.spacexvape.current.revenue, reportData.brandComparison.other.current.revenue],
        ['平均订单价值', reportData.summary.current.avgOrderValue, reportData.brandComparison.vapsolo.current.revenue / (reportData.brandComparison.vapsolo.current.orders || 1), reportData.brandComparison.spacexvape.current.revenue / (reportData.brandComparison.spacexvape.current.orders || 1), reportData.brandComparison.other.current.revenue / (reportData.brandComparison.other.current.orders || 1)],
        [''],
        [`${previousLabel}订单数`, reportData.summary.previous.totalOrders, reportData.brandComparison.vapsolo.previous.orders, reportData.brandComparison.spacexvape.previous.orders, reportData.brandComparison.other.previous.orders],
        [`${previousLabel}销售量`, reportData.summary.previous.totalQuantity, reportData.brandComparison.vapsolo.previous.quantity, reportData.brandComparison.spacexvape.previous.quantity, reportData.brandComparison.other.previous.quantity],
        [`${previousLabel}销售额`, reportData.summary.previous.totalRevenue, reportData.brandComparison.vapsolo.previous.revenue, reportData.brandComparison.spacexvape.previous.revenue, reportData.brandComparison.other.previous.revenue],
        [`${previousLabel}平均订单价值`, reportData.summary.previous.avgOrderValue, reportData.brandComparison.vapsolo.previous.revenue / (reportData.brandComparison.vapsolo.previous.orders || 1), reportData.brandComparison.spacexvape.previous.revenue / (reportData.brandComparison.spacexvape.previous.orders || 1), reportData.brandComparison.other.previous.revenue / (reportData.brandComparison.other.previous.orders || 1)],
        [''],
        ['订单增长率', reportData.summary.growth.orders, reportData.brandComparison.vapsolo.growth.orders + '%', reportData.brandComparison.spacexvape.growth.orders + '%', reportData.brandComparison.other.growth.orders + '%'],
        ['销量增长率', reportData.summary.growth.quantity, reportData.brandComparison.vapsolo.growth.quantity + '%', reportData.brandComparison.spacexvape.growth.quantity + '%', reportData.brandComparison.other.growth.quantity + '%'],
        ['销售额增长率', reportData.summary.growth.revenue, reportData.brandComparison.vapsolo.growth.revenue + '%', reportData.brandComparison.spacexvape.growth.revenue + '%', reportData.brandComparison.other.growth.orders + '%'],
      ];
      const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(workbook, overviewSheet, '总体概览');

      // 国家统计 - 全部站点
      const countryAllData = reportData.all.byCountry.map(item => ({
        国家: item.countryName || item.country,
        订单数: item.orders,
        上周订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上周销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上周销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const countryAllSheet = XLSX.utils.json_to_sheet(countryAllData);
      XLSX.utils.book_append_sheet(workbook, countryAllSheet, '国家统计-全部站点');

      // 国家统计 - Vapsolo 站点
      const countryVapsoloData = reportData.vapsoloBrand.byCountry.map(item => ({
        国家: item.countryName || item.country,
        订单数: item.orders,
        上周订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上周销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上周销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const countryVapsoloSheet = XLSX.utils.json_to_sheet(countryVapsoloData);
      XLSX.utils.book_append_sheet(workbook, countryVapsoloSheet, '国家统计-Vapsolo');

      // 国家统计 - Spacexvape 站点
      const countrySpacexvapeData = reportData.spacexvapeBrand.byCountry.map(item => ({
        国家: item.countryName || item.country,
        订单数: item.orders,
        上周订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上周销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上周销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const countrySpacexvapeSheet = XLSX.utils.json_to_sheet(countrySpacexvapeData);
      XLSX.utils.book_append_sheet(workbook, countrySpacexvapeSheet, '国家统计-集合站1');

      // 国家统计 - 其他集合站点
      const countryOtherData = reportData.otherBrand.byCountry.map(item => ({
        国家: item.countryName || item.country,
        订单数: item.orders,
        上周订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上周销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上周销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const countryOtherSheet = XLSX.utils.json_to_sheet(countryOtherData);
      XLSX.utils.book_append_sheet(workbook, countryOtherSheet, '国家统计-集合站2');

      // SPU 排行 - 全部站点
      const spuAllData = reportData.all.bySpu.map(item => ({
        SPU: item.spu,
        订单数: item.orders,
        上周订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上周销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上周销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const spuAllSheet = XLSX.utils.json_to_sheet(spuAllData);
      XLSX.utils.book_append_sheet(workbook, spuAllSheet, 'SPU排行-全部站点');

      // SPU 排行 - Vapsolo 站点
      const spuVapsoloData = reportData.vapsoloBrand.bySpu.map(item => ({
        SPU: item.spu,
        订单数: item.orders,
        上周订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上周销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上周销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const spuVapsoloSheet = XLSX.utils.json_to_sheet(spuVapsoloData);
      XLSX.utils.book_append_sheet(workbook, spuVapsoloSheet, 'SPU排行-Vapsolo');

      // SPU 排行 - Spacexvape 站点
      const spuSpacexvapeData = reportData.spacexvapeBrand.bySpu.map(item => ({
        SPU: item.spu,
        订单数: item.orders,
        上周订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上周销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上周销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const spuSpacexvapeSheet = XLSX.utils.json_to_sheet(spuSpacexvapeData);
      XLSX.utils.book_append_sheet(workbook, spuSpacexvapeSheet, 'SPU排行-集合站1');

      // SPU 排行 - 其他集合站点
      const spuOtherData = reportData.otherBrand.bySpu.map(item => ({
        SPU: item.spu,
        订单数: item.orders,
        上周订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上周销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上周销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const spuOtherSheet = XLSX.utils.json_to_sheet(spuOtherData);
      XLSX.utils.book_append_sheet(workbook, spuOtherSheet, 'SPU排行-集合站2');

      // 日趋势
      const trendData = reportData.all.dailyTrends.map(item => ({
        日期: item.date,
        订单数: item.orders,
        销量: item.quantity,
        销售额: item.revenue,
      }));
      const trendSheet = XLSX.utils.json_to_sheet(trendData);
      XLSX.utils.book_append_sheet(workbook, trendSheet, '日趋势');

      // 导出
      let fileName;
      if (isQuarterMode) {
        fileName = `Vapsolo季报_${selectedQuarter.year}年Q${selectedQuarter.quarter}.xlsx`;
      } else if (isMonthMode) {
        fileName = `Vapsolo月报_${selectedMonth.year}年${selectedMonth.month}月.xlsx`;
      } else {
        fileName = `Vapsolo周报_${selectedWeek.year}年第${selectedWeek.week}周.xlsx`;
      }
      XLSX.writeFile(workbook, fileName);
      toast.success('Excel 导出成功');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('导出失败');
    }
  };

  // 获取打印文档标题
  const getPrintTitle = () => {
    if (isQuarterMode) {
      return `Vapsolo季报_${selectedQuarter.year}年Q${selectedQuarter.quarter}`;
    } else if (isMonthMode) {
      return `Vapsolo月报_${selectedMonth.year}年${selectedMonth.month}月`;
    }
    return `Vapsolo周报_${selectedWeek.year}年第${selectedWeek.week}周`;
  };

  // PDF 导出状态
  const [pdfExporting, setPdfExporting] = useState(false);

  // 导出PDF - 使用 dom-to-image-more + jsPDF（智能分页）
  const handleExportPdf = async () => {
    if (pdfExporting || !printRef.current) return;

    setPdfExporting(true);
    toast.info('正在生成 PDF，请稍候...');

    try {
      const element = printRef.current;
      const filename = `${getPrintTitle()}.pdf`;

      // 临时添加样式覆盖 oklch 颜色，并移除边框
      const style = document.createElement('style');
      style.id = 'pdf-export-style';
      style.textContent = `
        * {
          --background: #ffffff !important;
          --foreground: #0a0a0a !important;
          --card: #ffffff !important;
          --card-foreground: #0a0a0a !important;
          --primary: #171717 !important;
          --primary-foreground: #fafafa !important;
          --secondary: #f5f5f5 !important;
          --secondary-foreground: #171717 !important;
          --muted: #f5f5f5 !important;
          --muted-foreground: #737373 !important;
          --accent: #f5f5f5 !important;
          --accent-foreground: #171717 !important;
          --border: transparent !important;
          --input: transparent !important;
          --ring: transparent !important;
          border-color: transparent !important;
        }
        /* 移除所有边框 */
        div, section, article, header, footer, main, aside, nav,
        table, tr, td, th, thead, tbody,
        .border, [class*="border"], [class*="rounded"] {
          border: none !important;
          border-color: transparent !important;
          box-shadow: none !important;
        }
      `;
      document.head.appendChild(style);

      // 等待样式应用
      await new Promise(resolve => setTimeout(resolve, 100));

      // 获取所有可分页的元素边界（section、卡片、表格等）
      const containerRect = element.getBoundingClientRect();

      // 收集所有分页点（元素的顶部位置，相对于容器）
      const breakPoints: number[] = [0]; // 从0开始

      // 1. 添加每个 section 标题（h2）的顶部位置作为分页点
      // 这样当标题出现在页面底部时，会在标题之前分页，把标题推到下一页
      const sectionTitles = element.querySelectorAll('section > h2');
      sectionTitles.forEach((title) => {
        const rect = title.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        if (relativeTop > 10) {
          breakPoints.push(relativeTop);
        }
      });

      // 2. 添加内容块的顶部位置作为分页点
      const contentBlocks = element.querySelectorAll(
        'section > .space-y-4 > div, ' +
        'section .space-y-4 > div, ' +
        'section > .space-y-4 > .grid, ' +
        'section .space-y-4 > .grid'
      );

      contentBlocks.forEach((block) => {
        const rect = block.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        if (relativeTop > 10) {
          breakPoints.push(relativeTop);
        }
      });

      // 去重并排序
      const uniqueBreakPoints = [...new Set(breakPoints)].sort((a, b) => a - b);
      uniqueBreakPoints.push(containerRect.height); // 结束位置

      // 使用 dom-to-image-more 生成完整图片
      const dataUrl = await domtoimage.toPng(element, {
        quality: 1,
        bgcolor: '#ffffff',
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        },
      });

      // 移除临时样式
      document.getElementById('pdf-export-style')?.remove();

      // 创建图片获取尺寸
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => { img.onload = resolve; });

      // 计算缩放比例（图片像素 vs DOM 尺寸）
      const scale = img.width / containerRect.width;

      // 创建 PDF (A4 尺寸)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pdfWidth - margin * 2;
      const contentHeight = pdfHeight - margin * 2;

      // 计算 DOM 到 PDF 的缩放比例
      const domToPdfScale = contentWidth / containerRect.width;
      const maxPageHeightInDom = contentHeight / domToPdfScale;

      // 智能分页：根据 section 边界和页面高度确定分页点
      const pageBreaks: { start: number; end: number }[] = [];
      let currentPageStart = 0;

      for (let i = 1; i < uniqueBreakPoints.length; i++) {
        const sectionEnd = uniqueBreakPoints[i] ?? containerRect.height;
        const currentPageHeight = sectionEnd - currentPageStart;

        // 如果当前累积高度超过一页
        if (currentPageHeight > maxPageHeightInDom) {
          // 如果是第一个 section 就超过了，只能强制分页
          if (i === 1 || uniqueBreakPoints[i - 1] === currentPageStart) {
            // 这个 section 太大，需要在中间切割
            let cutPoint = currentPageStart + maxPageHeightInDom;
            while (cutPoint < sectionEnd) {
              pageBreaks.push({ start: currentPageStart, end: cutPoint });
              currentPageStart = cutPoint;
              cutPoint = currentPageStart + maxPageHeightInDom;
            }
          } else {
            // 在上一个元素结束处分页
            const previousBreak = uniqueBreakPoints[i - 1] ?? 0;
            pageBreaks.push({ start: currentPageStart, end: previousBreak });
            currentPageStart = previousBreak;
            i--; // 重新检查当前元素
          }
        }
      }
      // 添加最后一页
      if (currentPageStart < containerRect.height) {
        pageBreaks.push({ start: currentPageStart, end: containerRect.height });
      }

      // 生成 PDF 页面
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      for (let i = 0; i < pageBreaks.length; i++) {
        if (i > 0) pdf.addPage();

        const pageBreak = pageBreaks[i];
        if (!pageBreak) continue;
        const { start, end } = pageBreak;
        const sourceY = start * scale;
        const sourceHeight = (end - start) * scale;
        const destHeight = (end - start) * domToPdfScale;

        // 创建这一页的图片
        canvas.width = img.width;
        canvas.height = Math.ceil(sourceHeight);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          img,
          0, sourceY, img.width, sourceHeight,
          0, 0, img.width, sourceHeight
        );

        const pageDataUrl = canvas.toDataURL('image/png');
        pdf.addImage(pageDataUrl, 'PNG', margin, margin, contentWidth, destHeight);
      }

      // 下载 PDF
      pdf.save(filename);
      toast.success('PDF 导出成功');
    } catch (error: any) {
      console.error('PDF export error:', error);
      // 确保移除临时样式
      document.getElementById('pdf-export-style')?.remove();
      toast.error(`PDF 导出失败: ${error.message}`);
    } finally {
      setPdfExporting(false);
    }
  };

  // 辅助函数：获取品牌对比的增长率（根据环比/同比模式）
  const getBrandGrowth = (brandKey: 'vapsolo' | 'vapsoloRetail' | 'vapsoloWholesale' | 'spacexvape' | 'other', metric: 'orders' | 'revenue' | 'quantity') => {
    if (!reportData) return '0.0';
    const brand = reportData.brandComparison[brandKey];
    const useYoy = (isMonthMode || isQuarterMode) && compareMode === 'yoy';
    return useYoy ? (brand.yearOverYearGrowth?.[metric] || '0.0') : brand.growth[metric];
  };

  // 转换数据格式以适配组件（支持环比/同比切换）
  const getCountryStatsData = (type: 'all' | 'retail' | 'wholesale' | 'vapsoloBrand' | 'vapsoloRetail' | 'vapsoloWholesale' | 'spacexvapeBrand' | 'otherBrand' = 'all') => {
    if (!reportData) return [];
    let sourceData: any[];
    switch (type) {
      case 'retail':
        sourceData = reportData.retail.byCountry;
        break;
      case 'wholesale':
        sourceData = reportData.wholesale.byCountry;
        break;
      case 'vapsoloBrand':
        sourceData = reportData.vapsoloBrand.byCountry;
        break;
      case 'vapsoloRetail':
        sourceData = reportData.vapsoloRetail.byCountry;
        break;
      case 'vapsoloWholesale':
        sourceData = reportData.vapsoloWholesale.byCountry;
        break;
      case 'spacexvapeBrand':
        sourceData = reportData.spacexvapeBrand.byCountry;
        break;
      case 'otherBrand':
        sourceData = reportData.otherBrand.byCountry;
        break;
      default:
        sourceData = reportData.all.byCountry;
    }
    // 根据对比模式选择对应的对比数据
    const useYoy = (isMonthMode || isQuarterMode) && compareMode === 'yoy';
    return sourceData.map((country: any) => ({
      country: country.countryName || country.country,
      orders: country.orders,
      quantity: country.quantity,
      revenue: country.revenue,
      previousOrders: useYoy ? (country.previousYearOrders || 0) : (country.previousOrders || 0),
      previousQuantity: useYoy ? (country.previousYearQuantity || 0) : (country.previousQuantity || 0),
      previousRevenue: useYoy ? (country.previousYearRevenue || 0) : (country.previousRevenue || 0),
      ordersGrowth: parseGrowth(useYoy ? (country.yoyOrdersGrowth || '0.0%') : (country.ordersGrowth || '0.0%')),
      quantityGrowth: parseGrowth(useYoy ? (country.yoyQuantityGrowth || '0.0%') : (country.quantityGrowth || '0.0%')),
      revenueGrowth: parseGrowth(useYoy ? (country.yoyRevenueGrowth || '0.0%') : (country.revenueGrowth || '0.0%')),
    }));
  };

  const getSpuRankingData = (type: 'all' | 'retail' | 'wholesale' | 'vapsoloBrand' | 'vapsoloRetail' | 'vapsoloWholesale' | 'spacexvapeBrand' | 'otherBrand' = 'all') => {
    if (!reportData) return [];
    let sourceData: any[];
    switch (type) {
      case 'retail':
        sourceData = reportData.retail.bySpu;
        break;
      case 'wholesale':
        sourceData = reportData.wholesale.bySpu;
        break;
      case 'vapsoloBrand':
        sourceData = reportData.vapsoloBrand.bySpu;
        break;
      case 'vapsoloRetail':
        sourceData = reportData.vapsoloRetail.bySpu;
        break;
      case 'vapsoloWholesale':
        sourceData = reportData.vapsoloWholesale.bySpu;
        break;
      case 'spacexvapeBrand':
        sourceData = reportData.spacexvapeBrand.bySpu;
        break;
      case 'otherBrand':
        sourceData = reportData.otherBrand.bySpu;
        break;
      default:
        sourceData = reportData.all.bySpu;
    }
    // 根据对比模式选择对应的对比数据
    const useYoy = (isMonthMode || isQuarterMode) && compareMode === 'yoy';
    return sourceData.map((spu: any) => ({
      spu: spu.spu,
      orders: spu.orders,
      quantity: spu.quantity,
      revenue: spu.revenue,
      previousOrders: useYoy ? (spu.previousYearOrders || 0) : (spu.previousOrders || 0),
      previousQuantity: useYoy ? (spu.previousYearQuantity || 0) : (spu.previousQuantity || 0),
      previousRevenue: useYoy ? (spu.previousYearRevenue || 0) : (spu.previousRevenue || 0),
      ordersGrowth: parseGrowth(useYoy ? (spu.yoyOrdersGrowth || '0.0%') : (spu.ordersGrowth || '0.0%')),
      quantityGrowth: parseGrowth(useYoy ? (spu.yoyQuantityGrowth || '0.0%') : (spu.quantityGrowth || '0.0%')),
      revenueGrowth: parseGrowth(useYoy ? (spu.yoyRevenueGrowth || '0.0%') : (spu.revenueGrowth || '0.0%')),
    }));
  };

  return (
    <div className="min-h-screen">
      {/* 固定顶部标题栏 */}
      <div className="sticky top-0 z-50 bg-background border-b no-print">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-green-600" />
              <div>
                <h1 className="text-3xl font-bold">
                  {isQuarterMode ? 'Vapsolo 季报' : (isMonthMode ? 'Vapsolo 月报' : 'Vapsolo 周报')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isQuarterMode
                    ? '16个站点销量统计（含换算规则）· 季度环比+同比对比'
                    : (isMonthMode
                      ? '16个站点销量统计（含换算规则）· 环比+同比对比'
                      : '16个站点销量统计（含换算规则）· 周环比对比')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* 日期选择器：根据模式显示不同组件 */}
              {isQuarterMode ? (
                <QuarterPicker value={selectedQuarter} onChange={setSelectedQuarter} />
              ) : isMonthMode ? (
                <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
              ) : (
                <WeekPicker value={selectedWeek} onChange={setSelectedWeek} />
              )}
              {/* 周/月/季范围模式选择 */}
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => handleModeChange('full')}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    weekRangeMode === 'full'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title="按 ISO 周完整 7 天计算"
                >
                  完整周
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('monthly')}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    weekRangeMode === 'monthly'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title="周范围被月边界截断"
                >
                  月内周
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('month')}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    weekRangeMode === 'month'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title="按自然月统计"
                >
                  月报
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('quarter')}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    weekRangeMode === 'quarter'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title="按自然季度统计"
                >
                  季报
                </button>
              </div>
              {/* 环比/同比切换（月报/季报模式显示） */}
              {(isMonthMode || isQuarterMode) && (
                <div className="flex items-center gap-1 border rounded-md p-0.5 border-orange-300 bg-orange-50">
                  <button
                    type="button"
                    onClick={() => setCompareMode('mom')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      compareMode === 'mom'
                        ? 'bg-orange-500 text-white'
                        : 'text-orange-600 hover:bg-orange-100'
                    }`}
                    title={isQuarterMode ? "与上季度对比" : "与上月对比"}
                  >
                    环比
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareMode('yoy')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      compareMode === 'yoy'
                        ? 'bg-orange-500 text-white'
                        : 'text-orange-600 hover:bg-orange-100'
                    }`}
                    title={isQuarterMode ? "与去年同季度对比" : "与去年同月对比"}
                  >
                    同比
                  </button>
                </div>
              )}
              {/* 备注功能暂时隐藏，待数据库表创建后启用 */}
              {/* <WeekNote year={selectedWeek.year} week={selectedWeek.week} /> */}
              <Button onClick={handleExportExcel} disabled={!reportData || loading}>
                <Download className="h-4 w-4 mr-2" />
                导出 Excel
              </Button>
              <Button onClick={handleExportPdf} disabled={!reportData || loading || pdfExporting} variant="outline">
                {pdfExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4 mr-2" />
                )}
                {pdfExporting ? '生成中...' : '导出 PDF'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="container mx-auto p-6 space-y-6">
        {/* 加载状态 */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            <span className="ml-3 text-sm text-muted-foreground">
              {isQuarterMode ? '正在加载季报数据...' : (isMonthMode ? '正在加载月报数据...' : '正在加载周报数据...')}
            </span>
          </CardContent>
        </Card>
      )}

      {/* 报表内容 */}
      {!loading && reportData && (
        <div ref={printRef} className="space-y-8">
          {/* ========== 统计概览板块 ========== */}
          <section>
            <h2 className="text-lg font-semibold text-muted-foreground mb-4 pb-2 border-b">📊 统计概览</h2>

            {/* 总体概览 */}
            <div className="space-y-4">
              <OverviewStats
                title="所有站点统计"
                stats={{
                  orders: reportData.summary.current.totalOrders,
                  quantity: reportData.summary.current.totalQuantity,
                  revenue: reportData.summary.current.totalRevenue,
                }}
                previousStats={{
                  orders: ((isMonthMode || isQuarterMode) && compareMode === 'yoy')
                    ? (reportData.summary.previousYear?.totalOrders || 0)
                    : reportData.summary.previous.totalOrders,
                  quantity: ((isMonthMode || isQuarterMode) && compareMode === 'yoy')
                    ? (reportData.summary.previousYear?.totalQuantity || 0)
                    : reportData.summary.previous.totalQuantity,
                  revenue: ((isMonthMode || isQuarterMode) && compareMode === 'yoy')
                    ? (reportData.summary.previousYear?.totalRevenue || 0)
                    : reportData.summary.previous.totalRevenue,
                }}
                growth={{
                  orders: parseGrowth(((isMonthMode || isQuarterMode) && compareMode === 'yoy')
                    ? (reportData.summary.yearOverYearGrowth?.orders || '0.0')
                    : reportData.summary.growth.orders),
                  quantity: parseGrowth(((isMonthMode || isQuarterMode) && compareMode === 'yoy')
                    ? (reportData.summary.yearOverYearGrowth?.quantity || '0.0')
                    : reportData.summary.growth.quantity),
                  revenue: parseGrowth(((isMonthMode || isQuarterMode) && compareMode === 'yoy')
                    ? (reportData.summary.yearOverYearGrowth?.revenue || '0.0')
                    : reportData.summary.growth.revenue),
                }}
                periodLabel={isQuarterMode
                  ? (compareMode === 'yoy' ? '去年同季' : '上季度')
                  : (isMonthMode ? (compareMode === 'yoy' ? '去年同月' : '上月') : '上周')}
              />

              {/* 品牌维度统计 - 优化布局 */}
              <div className="space-y-4">
                {/* Vapsolo 品牌 - 横向展开布局 */}
                <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-white">
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="font-semibold text-blue-900">Vapsolo 品牌</span>
                      <span className="text-xs text-muted-foreground ml-2">（含零售站 + 批发站）</span>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                      {/* 总计列 */}
                      <div className="bg-white rounded-lg p-3 border border-blue-100 shadow-sm">
                        <div className="text-xs text-blue-600 font-medium mb-2">总计</div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-muted-foreground">订单</span>
                            <div className="text-right">
                              <span className="font-bold">{reportData.brandComparison.vapsolo.current.orders}</span>
                              <span className={`text-xs ml-1 ${parseGrowth(getBrandGrowth('vapsolo', 'orders')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getBrandGrowth('vapsolo', 'orders')}%
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-muted-foreground">销量</span>
                            <div className="text-right">
                              <span className="font-bold">{reportData.brandComparison.vapsolo.current.quantity.toLocaleString()}</span>
                              <span className={`text-xs ml-1 ${parseGrowth(getBrandGrowth('vapsolo', 'quantity')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getBrandGrowth('vapsolo', 'quantity')}%
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-muted-foreground">销售额</span>
                            <div className="text-right">
                              <span className="font-bold text-sm">{reportData.brandComparison.vapsolo.current.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</span>
                              <span className={`text-xs ml-1 ${parseGrowth(getBrandGrowth('vapsolo', 'revenue')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getBrandGrowth('vapsolo', 'revenue')}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 零售站列 */}
                      <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                        <div className="text-xs text-blue-600 font-medium mb-2">零售站 (7站)</div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-muted-foreground">订单</span>
                            <div className="text-right">
                              <span className="font-semibold">{reportData.brandComparison.vapsoloRetail.current.orders}</span>
                              <span className={`text-xs ml-1 ${parseGrowth(getBrandGrowth('vapsoloRetail', 'orders')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getBrandGrowth('vapsoloRetail', 'orders')}%
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-muted-foreground">销量</span>
                            <div className="text-right">
                              <span className="font-semibold">{reportData.brandComparison.vapsoloRetail.current.quantity.toLocaleString()}</span>
                              <span className={`text-xs ml-1 ${parseGrowth(getBrandGrowth('vapsoloRetail', 'quantity')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getBrandGrowth('vapsoloRetail', 'quantity')}%
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-muted-foreground">销售额</span>
                            <div className="text-right">
                              <span className="font-semibold text-sm">{reportData.brandComparison.vapsoloRetail.current.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</span>
                              <span className={`text-xs ml-1 ${parseGrowth(getBrandGrowth('vapsoloRetail', 'revenue')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getBrandGrowth('vapsoloRetail', 'revenue')}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 批发站列 */}
                      <div className="bg-indigo-50/50 rounded-lg p-3 border border-indigo-100">
                        <div className="text-xs text-indigo-600 font-medium mb-2">批发站 (3站)</div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-muted-foreground">订单</span>
                            <div className="text-right">
                              <span className="font-semibold">{reportData.brandComparison.vapsoloWholesale.current.orders}</span>
                              <span className={`text-xs ml-1 ${parseGrowth(getBrandGrowth('vapsoloWholesale', 'orders')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getBrandGrowth('vapsoloWholesale', 'orders')}%
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-muted-foreground">销量</span>
                            <div className="text-right">
                              <span className="font-semibold">{reportData.brandComparison.vapsoloWholesale.current.quantity.toLocaleString()}</span>
                              <span className={`text-xs ml-1 ${parseGrowth(getBrandGrowth('vapsoloWholesale', 'quantity')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getBrandGrowth('vapsoloWholesale', 'quantity')}%
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs text-muted-foreground">销售额</span>
                            <div className="text-right">
                              <span className="font-semibold text-sm">{reportData.brandComparison.vapsoloWholesale.current.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</span>
                              <span className={`text-xs ml-1 ${parseGrowth(getBrandGrowth('vapsoloWholesale', 'revenue')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getBrandGrowth('vapsoloWholesale', 'revenue')}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 占比分析 */}
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <div className="text-xs text-gray-600 font-medium mb-2">占比分析</div>
                        <div className="space-y-2 text-xs">
                          <div>
                            <div className="text-muted-foreground mb-1">零售 vs 批发 (销量)</div>
                            <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
                              <div
                                className="bg-blue-400"
                                style={{ width: `${(reportData.brandComparison.vapsoloRetail.current.quantity / (reportData.brandComparison.vapsolo.current.quantity || 1) * 100)}%` }}
                              ></div>
                              <div
                                className="bg-indigo-400"
                                style={{ width: `${(reportData.brandComparison.vapsoloWholesale.current.quantity / (reportData.brandComparison.vapsolo.current.quantity || 1) * 100)}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between mt-1 text-muted-foreground">
                              <span>{((reportData.brandComparison.vapsoloRetail.current.quantity / (reportData.brandComparison.vapsolo.current.quantity || 1)) * 100).toFixed(1)}%</span>
                              <span>{((reportData.brandComparison.vapsoloWholesale.current.quantity / (reportData.brandComparison.vapsolo.current.quantity || 1)) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground mb-1">零售 vs 批发 (销售额)</div>
                            <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
                              <div
                                className="bg-blue-400"
                                style={{ width: `${(reportData.brandComparison.vapsoloRetail.current.revenue / (reportData.brandComparison.vapsolo.current.revenue || 1) * 100)}%` }}
                              ></div>
                              <div
                                className="bg-indigo-400"
                                style={{ width: `${(reportData.brandComparison.vapsoloWholesale.current.revenue / (reportData.brandComparison.vapsolo.current.revenue || 1) * 100)}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between mt-1 text-muted-foreground">
                              <span>{((reportData.brandComparison.vapsoloRetail.current.revenue / (reportData.brandComparison.vapsolo.current.revenue || 1)) * 100).toFixed(1)}%</span>
                              <span>{((reportData.brandComparison.vapsoloWholesale.current.revenue / (reportData.brandComparison.vapsolo.current.revenue || 1)) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* 集合站 - 并排布局 */}
                <div className="grid grid-cols-2 gap-4">
                  {/* 集合站1 */}
                  <Card className="border-green-200 bg-gradient-to-r from-green-50 to-white">
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="font-semibold text-green-900">集合站1</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">订单</div>
                          <div className="font-bold text-lg">{reportData.brandComparison.spacexvape.current.orders}</div>
                          <div className={`text-xs ${parseGrowth(getBrandGrowth('spacexvape', 'orders')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {getBrandGrowth('spacexvape', 'orders')}%
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">销量</div>
                          <div className="font-bold text-lg">{reportData.brandComparison.spacexvape.current.quantity.toLocaleString()}</div>
                          <div className={`text-xs ${parseGrowth(getBrandGrowth('spacexvape', 'quantity')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {getBrandGrowth('spacexvape', 'quantity')}%
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">销售额</div>
                          <div className="font-bold">{reportData.brandComparison.spacexvape.current.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</div>
                          <div className={`text-xs ${parseGrowth(getBrandGrowth('spacexvape', 'revenue')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {getBrandGrowth('spacexvape', 'revenue')}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* 集合站2 */}
                  <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-white">
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                        <span className="font-semibold text-amber-900">集合站2</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">订单</div>
                          <div className="font-bold text-lg">{reportData.brandComparison.other.current.orders}</div>
                          <div className={`text-xs ${parseGrowth(getBrandGrowth('other', 'orders')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {getBrandGrowth('other', 'orders')}%
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">销量</div>
                          <div className="font-bold text-lg">{reportData.brandComparison.other.current.quantity.toLocaleString()}</div>
                          <div className={`text-xs ${parseGrowth(getBrandGrowth('other', 'quantity')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {getBrandGrowth('other', 'quantity')}%
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">销售额</div>
                          <div className="font-bold">{reportData.brandComparison.other.current.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</div>
                          <div className={`text-xs ${parseGrowth(getBrandGrowth('other', 'revenue')) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {getBrandGrowth('other', 'revenue')}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              {/* 品牌站点对比图表 */}
              <BrandComparison
                allSitesStats={{
                  orders: reportData.summary.current.totalOrders,
                  quantity: reportData.summary.current.totalQuantity,
                  revenue: reportData.summary.current.totalRevenue,
                }}
                vapsoloStats={reportData.brandComparison.vapsolo.current}
                vapsoloRetailStats={reportData.brandComparison.vapsoloRetail.current}
                vapsoloWholesaleStats={reportData.brandComparison.vapsoloWholesale.current}
                spacexvapeStats={reportData.brandComparison.spacexvape.current}
                otherStats={reportData.brandComparison.other.current}
              />
            </div>
          </section>

          {/* ========== 国家统计板块 ========== */}
          <section>
            <h2 id="pdf-section-country" className="text-lg font-semibold text-muted-foreground mb-4 pb-2 border-b">🌍 国家统计</h2>
            <div className="space-y-4">
              <CountryStatsTable data={getCountryStatsData('all')} title="国家统计 - 全部站点" />
              <CountryStatsTable data={getCountryStatsData('vapsoloBrand')} title="国家统计 - Vapsolo 站点" variant="vapsolo" />
              <div className="grid grid-cols-2 gap-4">
                <CountryStatsTable data={getCountryStatsData('vapsoloRetail')} title="国家统计 - Vapsolo 零售站" variant="vapsolo" />
                <CountryStatsTable data={getCountryStatsData('vapsoloWholesale')} title="国家统计 - Vapsolo 批发站" variant="vapsolo" />
              </div>
              <CountryStatsTable data={getCountryStatsData('spacexvapeBrand')} title="国家统计 - 集合站1" variant="spacexvape" />
              <CountryStatsTable data={getCountryStatsData('otherBrand')} title="国家统计 - 集合站2" variant="other" />
            </div>
          </section>

          {/* ========== SPU 排行板块 ========== */}
          <section>
            <h2 id="pdf-section-spu" className="text-lg font-semibold text-muted-foreground mb-4 pb-2 border-b">📦 SPU 排行</h2>
            <div className="space-y-4">
              <SpuRankingTable data={getSpuRankingData('all')} title="SPU 排行 - 全部站点" showTopN={20} />
              <SpuRankingTable data={getSpuRankingData('vapsoloBrand')} title="SPU 排行 - Vapsolo 站点" showTopN={20} variant="vapsolo" />
              <div className="grid grid-cols-2 gap-4">
                <SpuRankingTable data={getSpuRankingData('vapsoloRetail')} title="SPU 排行 - Vapsolo 零售站" showTopN={10} variant="vapsolo" />
                <SpuRankingTable data={getSpuRankingData('vapsoloWholesale')} title="SPU 排行 - Vapsolo 批发站" showTopN={10} variant="vapsolo" />
              </div>
              <SpuRankingTable data={getSpuRankingData('spacexvapeBrand')} title="SPU 排行 - 集合站1" showTopN={20} variant="spacexvape" />
              <SpuRankingTable data={getSpuRankingData('otherBrand')} title="SPU 排行 - 集合站2" showTopN={20} variant="other" />
            </div>
          </section>

          {/* ========== 趋势分析板块 ========== */}
          <section>
            <h2 id="pdf-section-trend" className="text-lg font-semibold text-muted-foreground mb-4 pb-2 border-b">📈 趋势分析</h2>
            <div className="space-y-4">
              <DailyTrendChart
                currentData={reportData.all.dailyTrends}
                previousData={reportData.all.previousDailyTrends || []}
                title={isQuarterMode ? "日趋势对比 - 全部站点（本季度 vs 上季度）" : (isMonthMode ? "日趋势对比 - 全部站点（本月 vs 上月）" : "日趋势对比 - 全部站点（本周 vs 上周）")}
              />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DailyTrendChart
                  currentData={reportData.vapsoloBrand.dailyTrends}
                  previousData={reportData.vapsoloBrand.previousDailyTrends || []}
                  title="Vapsolo 趋势"
                  variant="vapsolo"
                  compact
                />
                <DailyTrendChart
                  currentData={reportData.spacexvapeBrand.dailyTrends}
                  previousData={reportData.spacexvapeBrand.previousDailyTrends || []}
                  title="集合站1 趋势"
                  variant="spacexvape"
                  compact
                />
                <DailyTrendChart
                  currentData={reportData.otherBrand.dailyTrends}
                  previousData={reportData.otherBrand.previousDailyTrends || []}
                  title="集合站2 趋势"
                  variant="other"
                  compact
                />
              </div>
              {/* Vapsolo 零售/批发趋势对比 */}
              <div className="grid grid-cols-2 gap-4">
                <DailyTrendChart
                  currentData={reportData.vapsoloRetail.dailyTrends}
                  previousData={reportData.vapsoloRetail.previousDailyTrends || []}
                  title="Vapsolo 零售站趋势"
                  variant="vapsolo"
                  compact
                />
                <DailyTrendChart
                  currentData={reportData.vapsoloWholesale.dailyTrends}
                  previousData={reportData.vapsoloWholesale.previousDailyTrends || []}
                  title="Vapsolo 批发站趋势"
                  variant="vapsolo"
                  compact
                />
              </div>
            </div>
          </section>
        </div>
      )}

        {/* 无数据状态 */}
        {!loading && !reportData && (
          <Card>
            <CardContent className="text-center py-16">
              <p className="text-sm text-muted-foreground">
                {isQuarterMode ? '该季度暂无数据' : (isMonthMode ? '该月暂无数据' : '该周暂无数据')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
