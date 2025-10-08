'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Download, FileText, Printer } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { QuarterPicker } from '@/components/reports/QuarterPicker';
import { getDefaultQuarter } from '@/lib/quarter-utils';
import { OverviewStats } from '@/components/reports/OverviewStats';
import { SiteTypeComparison } from '@/components/reports/SiteTypeComparison';
import { SiteRankingTable } from '@/components/reports/SiteRankingTable';
import { CountryStatsTable } from '@/components/reports/CountryStatsTable';
import { SpuRankingTable } from '@/components/reports/SpuRankingTable';
import { DailyTrendChart } from '@/components/reports/DailyTrendChart';
import * as XLSX from 'xlsx';

// Match backend API response structure
interface ApiResponse {
  success: boolean;
  data: {
    period: {
      current: { year: number; quarter: number; start: string; end: string };
      previous: { year: number; quarter: number; start: string; end: string };
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
  };
}

export default function JnrQuarterlyReport() {
  const defaultQuarter = getDefaultQuarter();

  const [selectedQuarter, setSelectedQuarter] = useState(defaultQuarter);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ApiResponse['data'] | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadReport();
  }, [selectedQuarter]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/reports/jnr/quarterly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedQuarter.year,
          quarter: selectedQuarter.quarter,
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
        toast.error('加载月报失败');
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

      // 总体概览
      const overviewData = [
        ['统计项', '所有站点', '零售站点', '批发站点'],
        ['订单数', reportData.summary.current.totalOrders, reportData.siteTypeComparison.retail.current.orders, reportData.siteTypeComparison.wholesale.current.orders],
        ['销售量', reportData.summary.current.totalQuantity, reportData.siteTypeComparison.retail.current.quantity, reportData.siteTypeComparison.wholesale.current.quantity],
        ['销售额', reportData.summary.current.totalRevenue, reportData.siteTypeComparison.retail.current.revenue, reportData.siteTypeComparison.wholesale.current.revenue],
        ['平均订单价值', reportData.summary.current.avgOrderValue, reportData.siteTypeComparison.retail.current.revenue / (reportData.siteTypeComparison.retail.current.orders || 1), reportData.siteTypeComparison.wholesale.current.revenue / (reportData.siteTypeComparison.wholesale.current.orders || 1)],
        [''],
        ['上月订单数', reportData.summary.previous.totalOrders, reportData.siteTypeComparison.retail.previous.orders, reportData.siteTypeComparison.wholesale.previous.orders],
        ['上月销售量', reportData.summary.previous.totalQuantity, reportData.siteTypeComparison.retail.previous.quantity, reportData.siteTypeComparison.wholesale.previous.quantity],
        ['上月销售额', reportData.summary.previous.totalRevenue, reportData.siteTypeComparison.retail.previous.revenue, reportData.siteTypeComparison.wholesale.previous.revenue],
        ['上月平均订单价值', reportData.summary.previous.avgOrderValue, reportData.siteTypeComparison.retail.previous.revenue / (reportData.siteTypeComparison.retail.previous.orders || 1), reportData.siteTypeComparison.wholesale.previous.revenue / (reportData.siteTypeComparison.wholesale.previous.orders || 1)],
        [''],
        ['订单增长率', reportData.summary.growth.orders, reportData.siteTypeComparison.retail.growth.orders, reportData.siteTypeComparison.wholesale.growth.orders],
        ['销量增长率', reportData.summary.growth.quantity, reportData.siteTypeComparison.retail.growth.quantity, reportData.siteTypeComparison.wholesale.growth.quantity],
        ['销售额增长率', reportData.summary.growth.revenue, reportData.siteTypeComparison.retail.growth.revenue, reportData.siteTypeComparison.wholesale.growth.revenue],
      ];
      const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(workbook, overviewSheet, '总体概览');

      // 站点排名（添加增长率）
      const siteData = reportData.all.bySite.map(item => ({
        站点: item.siteName,
        类型: item.siteType === 'retail' ? '零售' : '批发',
        订单数: item.orders,
        上月订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上月销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上月销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
        占比: `${item.revenuePercentage.toFixed(2)}%`,
      }));
      const siteSheet = XLSX.utils.json_to_sheet(siteData);
      XLSX.utils.book_append_sheet(workbook, siteSheet, '站点排名');

      // 国家统计 - 全部站点
      const countryAllData = reportData.all.byCountry.map(item => ({
        国家: item.countryName || item.country,
        订单数: item.orders,
        上月订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上月销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上月销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const countryAllSheet = XLSX.utils.json_to_sheet(countryAllData);
      XLSX.utils.book_append_sheet(workbook, countryAllSheet, '国家统计-全部站点');

      // 国家统计 - 零售站点
      const countryRetailData = reportData.retail.byCountry.map(item => ({
        国家: item.countryName || item.country,
        订单数: item.orders,
        上月订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上月销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上月销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const countryRetailSheet = XLSX.utils.json_to_sheet(countryRetailData);
      XLSX.utils.book_append_sheet(workbook, countryRetailSheet, '国家统计-零售站点');

      // 国家统计 - 批发站点
      const countryWholesaleData = reportData.wholesale.byCountry.map(item => ({
        国家: item.countryName || item.country,
        订单数: item.orders,
        上月订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上月销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上月销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const countryWholesaleSheet = XLSX.utils.json_to_sheet(countryWholesaleData);
      XLSX.utils.book_append_sheet(workbook, countryWholesaleSheet, '国家统计-批发站点');

      // SPU 排行 - 全部站点
      const spuAllData = reportData.all.bySpu.map(item => ({
        SPU: item.spu,
        订单数: item.orders,
        上月订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上月销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上月销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const spuAllSheet = XLSX.utils.json_to_sheet(spuAllData);
      XLSX.utils.book_append_sheet(workbook, spuAllSheet, 'SPU排行-全部站点');

      // SPU 排行 - 零售站点
      const spuRetailData = reportData.retail.bySpu.map(item => ({
        SPU: item.spu,
        订单数: item.orders,
        上月订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上月销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上月销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const spuRetailSheet = XLSX.utils.json_to_sheet(spuRetailData);
      XLSX.utils.book_append_sheet(workbook, spuRetailSheet, 'SPU排行-零售站点');

      // SPU 排行 - 批发站点
      const spuWholesaleData = reportData.wholesale.bySpu.map(item => ({
        SPU: item.spu,
        订单数: item.orders,
        上月订单数: item.previousOrders || 0,
        订单增长率: item.ordersGrowth || '0.0%',
        销售量: item.quantity,
        上月销售量: item.previousQuantity || 0,
        销量增长率: item.quantityGrowth || '0.0%',
        销售额: item.revenue,
        上月销售额: item.previousRevenue || 0,
        销售额增长率: item.revenueGrowth || '0.0%',
      }));
      const spuWholesaleSheet = XLSX.utils.json_to_sheet(spuWholesaleData);
      XLSX.utils.book_append_sheet(workbook, spuWholesaleSheet, 'SPU排行-批发站点');

      // 日趋势
      const trendData = reportData.all.dailyTrends.map(item => ({
        日期: item.date,
        订单数: item.orders,
        销量: item.quantity,
        销售额: item.revenue,
        零售订单数: item.retailOrders || 0,
        零售销量: item.retailQuantity || 0,
        零售销售额: item.retailRevenue || 0,
        批发订单数: item.wholesaleOrders || 0,
        批发销量: item.wholesaleQuantity || 0,
        批发销售额: item.wholesaleRevenue || 0,
      }));
      const trendSheet = XLSX.utils.json_to_sheet(trendData);
      XLSX.utils.book_append_sheet(workbook, trendSheet, '日趋势');

      // 导出
      XLSX.writeFile(workbook, `JNR季报_${selectedQuarter.year}年Q${selectedQuarter.quarter}.xlsx`);
      toast.success('Excel 导出成功');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('导出失败');
    }
  };

  // 打印/PDF导出
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `JNR季报_${selectedQuarter.year}年Q${selectedQuarter.quarter}`,
    onBeforePrint: async () => {
      toast.info('准备打印...');
    },
    onAfterPrint: async () => {
      toast.success('打印预览已打开');
    },
  });

  // 转换数据格式以适配组件
  const getSiteRankingData = () => {
    if (!reportData) return [];
    return reportData.all.bySite.map((site: any) => ({
      site: site.siteName,
      orders: site.orders,
      quantity: site.quantity,
      revenue: site.revenue,
      previousOrders: site.previousOrders || 0,
      previousQuantity: site.previousQuantity || 0,
      previousRevenue: site.previousRevenue || 0,
      ordersGrowth: parseGrowth(site.ordersGrowth || '0.0%'),
      quantityGrowth: parseGrowth(site.quantityGrowth || '0.0%'),
      revenueGrowth: parseGrowth(site.revenueGrowth || '0.0%'),
    }));
  };

  const getCountryStatsData = (type: 'all' | 'retail' | 'wholesale' = 'all') => {
    if (!reportData) return [];
    const sourceData = type === 'all' ? reportData.all.byCountry
                     : type === 'retail' ? reportData.retail.byCountry
                     : reportData.wholesale.byCountry;
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

  const getSpuRankingData = (type: 'all' | 'retail' | 'wholesale' = 'all') => {
    if (!reportData) return [];
    const sourceData = type === 'all' ? reportData.all.bySpu
                     : type === 'retail' ? reportData.retail.bySpu
                     : reportData.wholesale.bySpu;
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
    <div className="container mx-auto p-6 space-y-6">
      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold">JNR 季度报表</h1>
            <p className="text-sm text-muted-foreground">1个零售站点季度销量统计（FX182/FL162按10支换算）</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <QuarterPicker value={selectedQuarter} onChange={setSelectedQuarter} />
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

      {/* 加载状态 */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3 text-sm text-muted-foreground">正在加载月报数据...</span>
          </CardContent>
        </Card>
      )}

      {/* 报表内容 */}
      {!loading && reportData && (
        <div ref={printRef} className="space-y-6">
          {/* 总体概览 */}
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
          />

          <div className="grid grid-cols-2 gap-4">
            <OverviewStats
              title="零售站点统计"
              stats={reportData.siteTypeComparison.retail.current}
              previousStats={reportData.siteTypeComparison.retail.previous}
              growth={{
                orders: parseGrowth(reportData.siteTypeComparison.retail.growth.orders),
                quantity: parseGrowth(reportData.siteTypeComparison.retail.growth.quantity),
                revenue: parseGrowth(reportData.siteTypeComparison.retail.growth.revenue),
              }}
            />
            <OverviewStats
              title="批发站点统计"
              stats={reportData.siteTypeComparison.wholesale.current}
              previousStats={reportData.siteTypeComparison.wholesale.previous}
              growth={{
                orders: parseGrowth(reportData.siteTypeComparison.wholesale.growth.orders),
                quantity: parseGrowth(reportData.siteTypeComparison.wholesale.growth.quantity),
                revenue: parseGrowth(reportData.siteTypeComparison.wholesale.growth.revenue),
              }}
            />
          </div>

          {/* 站点类型对比 */}
          <SiteTypeComparison
            allSitesStats={{
              orders: reportData.summary.current.totalOrders,
              quantity: reportData.summary.current.totalQuantity,
              revenue: reportData.summary.current.totalRevenue,
            }}
            retailStats={reportData.siteTypeComparison.retail.current}
            wholesaleStats={reportData.siteTypeComparison.wholesale.current}
          />

          {/* 站点排名 */}
          <SiteRankingTable data={getSiteRankingData()} />

          {/* 国家统计 */}
          <CountryStatsTable data={getCountryStatsData('all')} title="国家统计 - 全部站点" />
          <CountryStatsTable data={getCountryStatsData('retail')} title="国家统计 - 零售站点" />
          <CountryStatsTable data={getCountryStatsData('wholesale')} title="国家统计 - 批发站点" />

          {/* SPU 排行（前20） */}
          <SpuRankingTable data={getSpuRankingData('all')} title="SPU 排行 - 全部站点" showTopN={20} />
          <SpuRankingTable data={getSpuRankingData('retail')} title="SPU 排行 - 零售站点" showTopN={20} />
          <SpuRankingTable data={getSpuRankingData('wholesale')} title="SPU 排行 - 批发站点" showTopN={20} />

          {/* 日趋势对比 */}
          <DailyTrendChart
            currentData={reportData.all.dailyTrends}
            previousData={reportData.all.previousDailyTrends || []}
          />
        </div>
      )}

      {/* 无数据状态 */}
      {!loading && !reportData && (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-sm text-muted-foreground">该月份暂无数据</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
