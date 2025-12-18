'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Download, FileText, Printer } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { WeekPicker, type WeekValue } from '@/components/reports/WeekPicker';
import { WeekNote } from '@/components/reports/WeekNote';
import { OverviewStats } from '@/components/reports/OverviewStats';
import { BrandComparison } from '@/components/reports/BrandComparison';
import { CountryStatsTable } from '@/components/reports/CountryStatsTable';
import { SpuRankingTable } from '@/components/reports/SpuRankingTable';
import { DailyTrendChart } from '@/components/reports/DailyTrendChart';
import * as XLSX from 'xlsx';
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns';

// API 响应结构
interface ApiResponse {
  success: boolean;
  data: {
    period: {
      current: { year: number; week: number; start: string; end: string };
      previous: { year: number; week: number; start: string; end: string };
    };
    summary: {
      current: {
        totalOrders: number;
        totalRevenue: number;
        totalQuantity: number;
        avgOrderValue: number;
      };
      previous: {
        totalOrders: number;
        totalRevenue: number;
        totalQuantity: number;
        avgOrderValue: number;
      };
      growth: {
        orders: string;
        revenue: string;
        quantity: string;
        avgOrderValue: string;
      };
    };
    siteTypeComparison: {
      retail: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
      };
      wholesale: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
      };
    };
    brandComparison: {
      vapsolo: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
      };
      spacexvape: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
      };
      other: {
        current: { orders: number; revenue: number; quantity: number };
        previous: { orders: number; revenue: number; quantity: number };
        growth: { orders: string; revenue: string; quantity: string };
      };
    };
    all: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
    };
    retail: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
    };
    wholesale: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
    };
    vapsoloBrand: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
    };
    spacexvapeBrand: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
    };
    otherBrand: {
      bySite: any[];
      byCountry: any[];
      bySpu: any[];
      dailyTrends: any[];
      previousDailyTrends?: any[];
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

export default function VapsoloWeeklyReport() {
  const [selectedWeek, setSelectedWeek] = useState<WeekValue>(getDefaultWeek());
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ApiResponse['data'] | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadReport();
  }, [selectedWeek]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/reports/vapsolo/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedWeek.year,
          week: selectedWeek.week,
          startDate: selectedWeek.startDate,
          endDate: selectedWeek.endDate,
        }),
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
        toast.error('加载周报失败');
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
      const overviewData = [
        ['统计项', '所有站点', 'Vapsolo', '集合站1', '集合站2'],
        ['订单数', reportData.summary.current.totalOrders, reportData.brandComparison.vapsolo.current.orders, reportData.brandComparison.spacexvape.current.orders, reportData.brandComparison.other.current.orders],
        ['销售量', reportData.summary.current.totalQuantity, reportData.brandComparison.vapsolo.current.quantity, reportData.brandComparison.spacexvape.current.quantity, reportData.brandComparison.other.current.quantity],
        ['销售额', reportData.summary.current.totalRevenue, reportData.brandComparison.vapsolo.current.revenue, reportData.brandComparison.spacexvape.current.revenue, reportData.brandComparison.other.current.revenue],
        ['平均订单价值', reportData.summary.current.avgOrderValue, reportData.brandComparison.vapsolo.current.revenue / (reportData.brandComparison.vapsolo.current.orders || 1), reportData.brandComparison.spacexvape.current.revenue / (reportData.brandComparison.spacexvape.current.orders || 1), reportData.brandComparison.other.current.revenue / (reportData.brandComparison.other.current.orders || 1)],
        [''],
        ['上周订单数', reportData.summary.previous.totalOrders, reportData.brandComparison.vapsolo.previous.orders, reportData.brandComparison.spacexvape.previous.orders, reportData.brandComparison.other.previous.orders],
        ['上周销售量', reportData.summary.previous.totalQuantity, reportData.brandComparison.vapsolo.previous.quantity, reportData.brandComparison.spacexvape.previous.quantity, reportData.brandComparison.other.previous.quantity],
        ['上周销售额', reportData.summary.previous.totalRevenue, reportData.brandComparison.vapsolo.previous.revenue, reportData.brandComparison.spacexvape.previous.revenue, reportData.brandComparison.other.previous.revenue],
        ['上周平均订单价值', reportData.summary.previous.avgOrderValue, reportData.brandComparison.vapsolo.previous.revenue / (reportData.brandComparison.vapsolo.previous.orders || 1), reportData.brandComparison.spacexvape.previous.revenue / (reportData.brandComparison.spacexvape.previous.orders || 1), reportData.brandComparison.other.previous.revenue / (reportData.brandComparison.other.previous.orders || 1)],
        [''],
        ['订单增长率', reportData.summary.growth.orders, reportData.brandComparison.vapsolo.growth.orders + '%', reportData.brandComparison.spacexvape.growth.orders + '%', reportData.brandComparison.other.growth.orders + '%'],
        ['销量增长率', reportData.summary.growth.quantity, reportData.brandComparison.vapsolo.growth.quantity + '%', reportData.brandComparison.spacexvape.growth.quantity + '%', reportData.brandComparison.other.growth.quantity + '%'],
        ['销售额增长率', reportData.summary.growth.revenue, reportData.brandComparison.vapsolo.growth.revenue + '%', reportData.brandComparison.spacexvape.growth.revenue + '%', reportData.brandComparison.other.growth.revenue + '%'],
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
      XLSX.writeFile(workbook, `Vapsolo周报_${selectedWeek.year}年第${selectedWeek.week}周.xlsx`);
      toast.success('Excel 导出成功');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('导出失败');
    }
  };

  // 打印/PDF导出
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Vapsolo周报_${selectedWeek.year}年第${selectedWeek.week}周`,
    onBeforePrint: async () => {
      toast.info('准备打印...');
    },
    onAfterPrint: async () => {
      toast.success('打印预览已打开');
    },
  });

  // 转换数据格式以适配组件
  const getCountryStatsData = (type: 'all' | 'retail' | 'wholesale' | 'vapsoloBrand' | 'spacexvapeBrand' | 'otherBrand' = 'all') => {
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
      case 'spacexvapeBrand':
        sourceData = reportData.spacexvapeBrand.byCountry;
        break;
      case 'otherBrand':
        sourceData = reportData.otherBrand.byCountry;
        break;
      default:
        sourceData = reportData.all.byCountry;
    }
    return sourceData.map((country: any) => ({
      country: country.countryName || country.country,
      orders: country.orders,
      quantity: country.quantity,
      revenue: country.revenue,
      previousOrders: country.previousOrders || 0,
      previousQuantity: country.previousQuantity || 0,
      previousRevenue: country.previousRevenue || 0,
      ordersGrowth: parseGrowth(country.ordersGrowth || '0.0%'),
      quantityGrowth: parseGrowth(country.quantityGrowth || '0.0%'),
      revenueGrowth: parseGrowth(country.revenueGrowth || '0.0%'),
    }));
  };

  const getSpuRankingData = (type: 'all' | 'retail' | 'wholesale' | 'vapsoloBrand' | 'spacexvapeBrand' | 'otherBrand' = 'all') => {
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
      case 'spacexvapeBrand':
        sourceData = reportData.spacexvapeBrand.bySpu;
        break;
      case 'otherBrand':
        sourceData = reportData.otherBrand.bySpu;
        break;
      default:
        sourceData = reportData.all.bySpu;
    }
    return sourceData.map((spu: any) => ({
      spu: spu.spu,
      orders: spu.orders,
      quantity: spu.quantity,
      revenue: spu.revenue,
      previousOrders: spu.previousOrders || 0,
      previousQuantity: spu.previousQuantity || 0,
      previousRevenue: spu.previousRevenue || 0,
      ordersGrowth: parseGrowth(spu.ordersGrowth || '0.0%'),
      quantityGrowth: parseGrowth(spu.quantityGrowth || '0.0%'),
      revenueGrowth: parseGrowth(spu.revenueGrowth || '0.0%'),
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
                <h1 className="text-3xl font-bold">Vapsolo 周报</h1>
                <p className="text-sm text-muted-foreground">16个站点销量统计（含换算规则）· 周环比对比</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <WeekPicker value={selectedWeek} onChange={setSelectedWeek} />
              {/* 备注功能暂时隐藏，待数据库表创建后启用 */}
              {/* <WeekNote year={selectedWeek.year} week={selectedWeek.week} /> */}
              <Button onClick={handleExportExcel} disabled={!reportData || loading}>
                <Download className="h-4 w-4 mr-2" />
                导出 Excel
              </Button>
              <Button onClick={handlePrint} disabled={!reportData || loading} variant="outline">
                <Printer className="h-4 w-4 mr-2" />
                打印/PDF
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
            <span className="ml-3 text-sm text-muted-foreground">正在加载周报数据...</span>
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
                  orders: reportData.summary.previous.totalOrders,
                  quantity: reportData.summary.previous.totalQuantity,
                  revenue: reportData.summary.previous.totalRevenue,
                }}
                growth={{
                  orders: parseGrowth(reportData.summary.growth.orders),
                  quantity: parseGrowth(reportData.summary.growth.quantity),
                  revenue: parseGrowth(reportData.summary.growth.revenue),
                }}
                periodLabel="上周"
              />

              {/* 品牌维度统计 - 使用紧凑型卡片 */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-4">
                  <div className="text-sm font-semibold text-blue-700 mb-3">Vapsolo</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">订单</div>
                      <div className="font-bold text-base">{reportData.brandComparison.vapsolo.current.orders}</div>
                      <div className={`${parseGrowth(reportData.brandComparison.vapsolo.growth.orders) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.brandComparison.vapsolo.growth.orders}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">销量</div>
                      <div className="font-bold text-base">{reportData.brandComparison.vapsolo.current.quantity.toLocaleString()}</div>
                      <div className={`${parseGrowth(reportData.brandComparison.vapsolo.growth.quantity) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.brandComparison.vapsolo.growth.quantity}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">销售额</div>
                      <div className="font-bold text-base">{reportData.brandComparison.vapsolo.current.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</div>
                      <div className={`${parseGrowth(reportData.brandComparison.vapsolo.growth.revenue) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.brandComparison.vapsolo.growth.revenue}%
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="text-sm font-semibold text-green-700 mb-3">集合站1</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">订单</div>
                      <div className="font-bold text-base">{reportData.brandComparison.spacexvape.current.orders}</div>
                      <div className={`${parseGrowth(reportData.brandComparison.spacexvape.growth.orders) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.brandComparison.spacexvape.growth.orders}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">销量</div>
                      <div className="font-bold text-base">{reportData.brandComparison.spacexvape.current.quantity.toLocaleString()}</div>
                      <div className={`${parseGrowth(reportData.brandComparison.spacexvape.growth.quantity) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.brandComparison.spacexvape.growth.quantity}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">销售额</div>
                      <div className="font-bold text-base">{reportData.brandComparison.spacexvape.current.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</div>
                      <div className={`${parseGrowth(reportData.brandComparison.spacexvape.growth.revenue) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.brandComparison.spacexvape.growth.revenue}%
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="text-sm font-semibold text-amber-700 mb-3">集合站2</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">订单</div>
                      <div className="font-bold text-base">{reportData.brandComparison.other.current.orders}</div>
                      <div className={`${parseGrowth(reportData.brandComparison.other.growth.orders) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.brandComparison.other.growth.orders}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">销量</div>
                      <div className="font-bold text-base">{reportData.brandComparison.other.current.quantity.toLocaleString()}</div>
                      <div className={`${parseGrowth(reportData.brandComparison.other.growth.quantity) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.brandComparison.other.growth.quantity}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">销售额</div>
                      <div className="font-bold text-base">{reportData.brandComparison.other.current.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</div>
                      <div className={`${parseGrowth(reportData.brandComparison.other.growth.revenue) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.brandComparison.other.growth.revenue}%
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* 品牌站点对比图表 */}
              <BrandComparison
                allSitesStats={{
                  orders: reportData.summary.current.totalOrders,
                  quantity: reportData.summary.current.totalQuantity,
                  revenue: reportData.summary.current.totalRevenue,
                }}
                vapsoloStats={reportData.brandComparison.vapsolo.current}
                spacexvapeStats={reportData.brandComparison.spacexvape.current}
                otherStats={reportData.brandComparison.other.current}
              />
            </div>
          </section>

          {/* ========== 国家统计板块 ========== */}
          <section>
            <h2 className="text-lg font-semibold text-muted-foreground mb-4 pb-2 border-b">🌍 国家统计</h2>
            <div className="space-y-4">
              <CountryStatsTable data={getCountryStatsData('all')} title="国家统计 - 全部站点" />
              <CountryStatsTable data={getCountryStatsData('vapsoloBrand')} title="国家统计 - Vapsolo 站点" variant="vapsolo" />
              <CountryStatsTable data={getCountryStatsData('spacexvapeBrand')} title="国家统计 - 集合站1" variant="spacexvape" />
              <CountryStatsTable data={getCountryStatsData('otherBrand')} title="国家统计 - 集合站2" variant="other" />
            </div>
          </section>

          {/* ========== SPU 排行板块 ========== */}
          <section>
            <h2 className="text-lg font-semibold text-muted-foreground mb-4 pb-2 border-b">📦 SPU 排行</h2>
            <div className="space-y-4">
              <SpuRankingTable data={getSpuRankingData('all')} title="SPU 排行 - 全部站点" showTopN={20} />
              <SpuRankingTable data={getSpuRankingData('vapsoloBrand')} title="SPU 排行 - Vapsolo 站点" showTopN={20} variant="vapsolo" />
              <SpuRankingTable data={getSpuRankingData('spacexvapeBrand')} title="SPU 排行 - 集合站1" showTopN={20} variant="spacexvape" />
              <SpuRankingTable data={getSpuRankingData('otherBrand')} title="SPU 排行 - 集合站2" showTopN={20} variant="other" />
            </div>
          </section>

          {/* ========== 趋势分析板块 ========== */}
          <section>
            <h2 className="text-lg font-semibold text-muted-foreground mb-4 pb-2 border-b">📈 趋势分析</h2>
            <div className="space-y-4">
              <DailyTrendChart
                currentData={reportData.all.dailyTrends}
                previousData={reportData.all.previousDailyTrends || []}
                title="日趋势对比 - 全部站点（本周 vs 上周）"
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
            </div>
          </section>
        </div>
      )}

        {/* 无数据状态 */}
        {!loading && !reportData && (
          <Card>
            <CardContent className="text-center py-16">
              <p className="text-sm text-muted-foreground">该周暂无数据</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
