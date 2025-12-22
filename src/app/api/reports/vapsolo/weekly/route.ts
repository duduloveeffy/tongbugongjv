import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  filterVapsoloOrders,
  filterRetailOrders,
  filterWholesaleOrders,
  filterVapsoloBrandOrders,
  filterSpacexvapeBrandOrders,
  filterOtherBrandOrders,
  calculateVapsoloQuantity,
  getVapsoloSiteType,
  getQuantityMultiplier,
  type VapsoloSiteType,
} from '@/lib/vapsolo-utils';
import { extractSpu, type SpuExtractionConfig } from '@/lib/spu-utils';
import { defaultSpuMappings } from '@/config/spu-mappings';
import { getCountryName } from '@/lib/country-utils';

// 请求参数接口
interface RequestParams {
  year: number;
  week: number; // ISO week number (1-53)
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  weekRangeMode?: 'full' | 'monthly'; // 完整周 或 月内周
}

// 周报数据结构
interface WeeklyReportData {
  period: {
    current: { year: number; week: number; start: string; end: string };
    previous: { year: number; week: number; start: string; end: string };
  };
  summary: {
    current: SummaryStats;
    previous: SummaryStats;
    growth: GrowthStats;
  };
  siteTypeComparison: {
    retail: TypeComparisonData;
    wholesale: TypeComparisonData;
  };
  brandComparison: {
    vapsolo: TypeComparisonData;
    vapsoloRetail: TypeComparisonData;  // Vapsolo 零售站
    vapsoloWholesale: TypeComparisonData;  // Vapsolo 批发站
    spacexvape: TypeComparisonData;
    other: TypeComparisonData;
  };
  all: DetailedStats;
  retail: DetailedStats;
  wholesale: DetailedStats;
  vapsoloBrand: DetailedStats;
  vapsoloRetail: DetailedStats;  // Vapsolo 零售站详细数据
  vapsoloWholesale: DetailedStats;  // Vapsolo 批发站详细数据
  spacexvapeBrand: DetailedStats;
  otherBrand: DetailedStats;
}

interface SummaryStats {
  totalOrders: number;
  totalRevenue: number;
  totalQuantity: number;
  avgOrderValue: number;
}

interface GrowthStats {
  orders: string;
  revenue: string;
  quantity: string;
  avgOrderValue: string;
}

interface TypeComparisonData {
  current: { orders: number; revenue: number; quantity: number };
  previous: { orders: number; revenue: number; quantity: number };
  growth: { orders: string; revenue: string; quantity: string };
}

interface DetailedStats {
  bySite: SiteRankingItem[];
  byCountry: CountryStatsItem[];
  bySpu: SpuRankingItem[];
  dailyTrends: DailyTrendItem[];
  previousDailyTrends?: DailyTrendItem[];
}

interface SiteRankingItem {
  siteId: string;
  siteName: string;
  siteType: VapsoloSiteType;
  orders: number;
  revenue: number;
  quantity: number;
  previousOrders: number;
  previousRevenue: number;
  previousQuantity: number;
  ordersGrowth: string;
  revenueGrowth: string;
  quantityGrowth: string;
  revenuePercentage: number;
  rank: number;
}

interface CountryStatsItem {
  country: string;
  countryName: string;
  orders: number;
  revenue: number;
  quantity: number;
  previousOrders: number;
  previousRevenue: number;
  previousQuantity: number;
  ordersGrowth: string;
  revenueGrowth: string;
  quantityGrowth: string;
  retailQuantity: number;
  wholesaleQuantity: number;
  rank: number;
  sites: string[];
}

interface SpuRankingItem {
  spu: string;
  orders: number;
  revenue: number;
  quantity: number;
  previousOrders: number;
  previousRevenue: number;
  previousQuantity: number;
  ordersGrowth: string;
  revenueGrowth: string;
  quantityGrowth: string;
  retailQuantity: number;
  wholesaleQuantity: number;
  isSurpriseBox: boolean;
  multiplier: number;
  rank: number;
}

interface DailyTrendItem {
  date: string;
  orders: number;
  revenue: number;
  quantity: number;
  retailOrders: number;
  retailRevenue: number;
  retailQuantity: number;
  wholesaleOrders: number;
  wholesaleRevenue: number;
  wholesaleQuantity: number;
}

// SPU 提取配置
const spuConfig: SpuExtractionConfig = {
  mode: 'series',
  nameMapping: defaultSpuMappings,
};

export async function POST(request: NextRequest) {
  try {
    const body: RequestParams = await request.json();
    const { year, week, startDate, endDate, weekRangeMode = 'full' } = body;

    // 参数验证
    if (!year || !week || week < 1 || week > 53 || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Invalid week parameters' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    // 根据 weekRangeMode 计算实际的日期范围
    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;

    if (weekRangeMode === 'monthly') {
      // 月内周模式：将周范围截断到月边界内
      // 使用周起始日期所在的月份作为参考月
      const weekStartDateObj = new Date(startDate);
      const refMonth = weekStartDateObj.getMonth();
      const refYear = weekStartDateObj.getFullYear();

      // 计算月起始和结束
      const monthStart = new Date(refYear, refMonth, 1);
      const monthEnd = new Date(refYear, refMonth + 1, 0); // 月末

      const monthStartStr = monthStart.toISOString().split('T')[0] || startDate;
      const monthEndStr = monthEnd.toISOString().split('T')[0] || endDate;

      // 截断到月边界内
      if (effectiveStartDate < monthStartStr) {
        effectiveStartDate = monthStartStr;
      }
      if (effectiveEndDate > monthEndStr) {
        effectiveEndDate = monthEndStr;
      }

      console.log('[Vapsolo Weekly Report] Monthly mode - truncated dates:', {
        original: { startDate, endDate },
        effective: { effectiveStartDate, effectiveEndDate },
        monthBoundary: { monthStartStr, monthEndStr },
      });
    }

    // 计算当周和上周的日期范围
    const currentPeriod = {
      year,
      week,
      start: `${effectiveStartDate}T00:00:00.000Z`,
      end: `${effectiveEndDate}T23:59:59.999Z`,
    };

    const previousPeriod = getPreviousWeekRange(startDate, weekRangeMode);

    console.log('[Vapsolo Weekly Report] Querying:', {
      current: currentPeriod,
      previous: previousPeriod,
      weekRangeMode,
    });

    // 查询当周和上周的订单数据
    const [currentOrders, previousOrders] = await Promise.all([
      fetchOrdersByPeriod(supabase, currentPeriod.start, currentPeriod.end),
      fetchOrdersByPeriod(supabase, previousPeriod.start, previousPeriod.end),
    ]);

    // 过滤 Vapsolo 订单
    const vapsoloCurrentOrders = filterVapsoloOrders(currentOrders);
    const vapsoloPreviousOrders = filterVapsoloOrders(previousOrders);

    console.log('[Vapsolo Weekly Report] Filtered orders:', {
      current: vapsoloCurrentOrders.length,
      previous: vapsoloPreviousOrders.length,
    });

    // 处理数据：全部、零售、批发（包含对比数据）
    const allCurrent = processOrdersWithComparison(vapsoloCurrentOrders, vapsoloPreviousOrders, 'all');
    const retailCurrent = processOrdersWithComparison(
      filterRetailOrders(vapsoloCurrentOrders),
      filterRetailOrders(vapsoloPreviousOrders),
      'retail'
    );
    const wholesaleCurrent = processOrdersWithComparison(
      filterWholesaleOrders(vapsoloCurrentOrders),
      filterWholesaleOrders(vapsoloPreviousOrders),
      'wholesale'
    );

    // 仍需要独立处理上周数据以获取summary
    const allPrevious = processOrders(vapsoloPreviousOrders, 'all');
    const retailPrevious = processOrders(filterRetailOrders(vapsoloPreviousOrders), 'retail');
    const wholesalePrevious = processOrders(filterWholesaleOrders(vapsoloPreviousOrders), 'wholesale');

    // 处理品牌维度数据（注意：品牌过滤是基于所有订单，不仅是 Vapsolo 订单）
    const vapsoloBrandCurrentOrders = filterVapsoloBrandOrders(currentOrders);
    const vapsoloBrandPreviousOrders = filterVapsoloBrandOrders(previousOrders);
    const spacexvapeBrandCurrentOrders = filterSpacexvapeBrandOrders(currentOrders);
    const spacexvapeBrandPreviousOrders = filterSpacexvapeBrandOrders(previousOrders);
    const otherBrandCurrentOrders = filterOtherBrandOrders(currentOrders);
    const otherBrandPreviousOrders = filterOtherBrandOrders(previousOrders);

    // 使用 processOrdersWithComparison 获取包含对比数据的详细统计
    const vapsoloBrandCurrent = processOrdersWithComparison(vapsoloBrandCurrentOrders, vapsoloBrandPreviousOrders, 'all');
    const vapsoloBrandPrevious = processOrders(vapsoloBrandPreviousOrders, 'all');

    // Vapsolo 零售站和批发站子维度
    const vapsoloRetailCurrentOrders = filterRetailOrders(vapsoloBrandCurrentOrders);
    const vapsoloRetailPreviousOrders = filterRetailOrders(vapsoloBrandPreviousOrders);
    const vapsoloWholesaleCurrentOrders = filterWholesaleOrders(vapsoloBrandCurrentOrders);
    const vapsoloWholesalePreviousOrders = filterWholesaleOrders(vapsoloBrandPreviousOrders);

    const vapsoloRetailCurrent = processOrdersWithComparison(vapsoloRetailCurrentOrders, vapsoloRetailPreviousOrders, 'retail');
    const vapsoloRetailPrevious = processOrders(vapsoloRetailPreviousOrders, 'retail');
    const vapsoloWholesaleCurrent = processOrdersWithComparison(vapsoloWholesaleCurrentOrders, vapsoloWholesalePreviousOrders, 'wholesale');
    const vapsoloWholesalePrevious = processOrders(vapsoloWholesalePreviousOrders, 'wholesale');

    const spacexvapeBrandCurrent = processOrdersWithComparison(spacexvapeBrandCurrentOrders, spacexvapeBrandPreviousOrders, 'all');
    const spacexvapeBrandPrevious = processOrders(spacexvapeBrandPreviousOrders, 'all');
    const otherBrandCurrent = processOrdersWithComparison(otherBrandCurrentOrders, otherBrandPreviousOrders, 'all');
    const otherBrandPrevious = processOrders(otherBrandPreviousOrders, 'all');

    // 计算总体概览（所有品牌的总和）
    // 合并所有品牌的订单来计算总概览
    const allBrandCurrentOrders = [
      ...vapsoloBrandCurrentOrders,
      ...spacexvapeBrandCurrentOrders,
      ...otherBrandCurrentOrders,
    ];
    const allBrandPreviousOrders = [
      ...vapsoloBrandPreviousOrders,
      ...spacexvapeBrandPreviousOrders,
      ...otherBrandPreviousOrders,
    ];
    const allBrandCurrent = processOrdersWithComparison(allBrandCurrentOrders, allBrandPreviousOrders, 'all');
    const allBrandPrevious = processOrders(allBrandPreviousOrders, 'all');

    const summary = {
      current: allBrandCurrent.summary,
      previous: allBrandPrevious.summary,
      growth: calculateGrowth(allBrandCurrent.summary, allBrandPrevious.summary),
    };

    // 计算站点类型对比
    const siteTypeComparison = {
      retail: {
        current: {
          orders: retailCurrent.summary.totalOrders,
          revenue: retailCurrent.summary.totalRevenue,
          quantity: retailCurrent.summary.totalQuantity,
        },
        previous: {
          orders: retailPrevious.summary.totalOrders,
          revenue: retailPrevious.summary.totalRevenue,
          quantity: retailPrevious.summary.totalQuantity,
        },
        growth: {
          orders: calculateGrowth(retailCurrent.summary, retailPrevious.summary).orders,
          revenue: calculateGrowth(retailCurrent.summary, retailPrevious.summary).revenue,
          quantity: calculateGrowth(retailCurrent.summary, retailPrevious.summary).quantity,
        },
      },
      wholesale: {
        current: {
          orders: wholesaleCurrent.summary.totalOrders,
          revenue: wholesaleCurrent.summary.totalRevenue,
          quantity: wholesaleCurrent.summary.totalQuantity,
        },
        previous: {
          orders: wholesalePrevious.summary.totalOrders,
          revenue: wholesalePrevious.summary.totalRevenue,
          quantity: wholesalePrevious.summary.totalQuantity,
        },
        growth: {
          orders: calculateGrowth(wholesaleCurrent.summary, wholesalePrevious.summary).orders,
          revenue: calculateGrowth(wholesaleCurrent.summary, wholesalePrevious.summary).revenue,
          quantity: calculateGrowth(wholesaleCurrent.summary, wholesalePrevious.summary).quantity,
        },
      },
    };

    // 计算品牌维度对比
    const brandComparison = {
      vapsolo: {
        current: {
          orders: vapsoloBrandCurrent.summary.totalOrders,
          revenue: vapsoloBrandCurrent.summary.totalRevenue,
          quantity: vapsoloBrandCurrent.summary.totalQuantity,
        },
        previous: {
          orders: vapsoloBrandPrevious.summary.totalOrders,
          revenue: vapsoloBrandPrevious.summary.totalRevenue,
          quantity: vapsoloBrandPrevious.summary.totalQuantity,
        },
        growth: {
          orders: calculateGrowth(vapsoloBrandCurrent.summary, vapsoloBrandPrevious.summary).orders,
          revenue: calculateGrowth(vapsoloBrandCurrent.summary, vapsoloBrandPrevious.summary).revenue,
          quantity: calculateGrowth(vapsoloBrandCurrent.summary, vapsoloBrandPrevious.summary).quantity,
        },
      },
      vapsoloRetail: {
        current: {
          orders: vapsoloRetailCurrent.summary.totalOrders,
          revenue: vapsoloRetailCurrent.summary.totalRevenue,
          quantity: vapsoloRetailCurrent.summary.totalQuantity,
        },
        previous: {
          orders: vapsoloRetailPrevious.summary.totalOrders,
          revenue: vapsoloRetailPrevious.summary.totalRevenue,
          quantity: vapsoloRetailPrevious.summary.totalQuantity,
        },
        growth: {
          orders: calculateGrowth(vapsoloRetailCurrent.summary, vapsoloRetailPrevious.summary).orders,
          revenue: calculateGrowth(vapsoloRetailCurrent.summary, vapsoloRetailPrevious.summary).revenue,
          quantity: calculateGrowth(vapsoloRetailCurrent.summary, vapsoloRetailPrevious.summary).quantity,
        },
      },
      vapsoloWholesale: {
        current: {
          orders: vapsoloWholesaleCurrent.summary.totalOrders,
          revenue: vapsoloWholesaleCurrent.summary.totalRevenue,
          quantity: vapsoloWholesaleCurrent.summary.totalQuantity,
        },
        previous: {
          orders: vapsoloWholesalePrevious.summary.totalOrders,
          revenue: vapsoloWholesalePrevious.summary.totalRevenue,
          quantity: vapsoloWholesalePrevious.summary.totalQuantity,
        },
        growth: {
          orders: calculateGrowth(vapsoloWholesaleCurrent.summary, vapsoloWholesalePrevious.summary).orders,
          revenue: calculateGrowth(vapsoloWholesaleCurrent.summary, vapsoloWholesalePrevious.summary).revenue,
          quantity: calculateGrowth(vapsoloWholesaleCurrent.summary, vapsoloWholesalePrevious.summary).quantity,
        },
      },
      spacexvape: {
        current: {
          orders: spacexvapeBrandCurrent.summary.totalOrders,
          revenue: spacexvapeBrandCurrent.summary.totalRevenue,
          quantity: spacexvapeBrandCurrent.summary.totalQuantity,
        },
        previous: {
          orders: spacexvapeBrandPrevious.summary.totalOrders,
          revenue: spacexvapeBrandPrevious.summary.totalRevenue,
          quantity: spacexvapeBrandPrevious.summary.totalQuantity,
        },
        growth: {
          orders: calculateGrowth(spacexvapeBrandCurrent.summary, spacexvapeBrandPrevious.summary).orders,
          revenue: calculateGrowth(spacexvapeBrandCurrent.summary, spacexvapeBrandPrevious.summary).revenue,
          quantity: calculateGrowth(spacexvapeBrandCurrent.summary, spacexvapeBrandPrevious.summary).quantity,
        },
      },
      other: {
        current: {
          orders: otherBrandCurrent.summary.totalOrders,
          revenue: otherBrandCurrent.summary.totalRevenue,
          quantity: otherBrandCurrent.summary.totalQuantity,
        },
        previous: {
          orders: otherBrandPrevious.summary.totalOrders,
          revenue: otherBrandPrevious.summary.totalRevenue,
          quantity: otherBrandPrevious.summary.totalQuantity,
        },
        growth: {
          orders: calculateGrowth(otherBrandCurrent.summary, otherBrandPrevious.summary).orders,
          revenue: calculateGrowth(otherBrandCurrent.summary, otherBrandPrevious.summary).revenue,
          quantity: calculateGrowth(otherBrandCurrent.summary, otherBrandPrevious.summary).quantity,
        },
      },
    };

    // 构建返回数据
    const reportData: WeeklyReportData = {
      period: {
        current: { year, week, start: startDate, end: endDate },
        previous: { year: previousPeriod.year, week: previousPeriod.week, start: previousPeriod.startDate, end: previousPeriod.endDate },
      },
      summary,
      siteTypeComparison,
      brandComparison,
      all: {
        ...allBrandCurrent.details,
        previousDailyTrends: allBrandPrevious.details.dailyTrends,
      },
      retail: {
        ...retailCurrent.details,
        previousDailyTrends: retailPrevious.details.dailyTrends,
      },
      wholesale: {
        ...wholesaleCurrent.details,
        previousDailyTrends: wholesalePrevious.details.dailyTrends,
      },
      vapsoloBrand: {
        ...vapsoloBrandCurrent.details,
        previousDailyTrends: vapsoloBrandPrevious.details.dailyTrends,
      },
      vapsoloRetail: {
        ...vapsoloRetailCurrent.details,
        previousDailyTrends: vapsoloRetailPrevious.details.dailyTrends,
      },
      vapsoloWholesale: {
        ...vapsoloWholesaleCurrent.details,
        previousDailyTrends: vapsoloWholesalePrevious.details.dailyTrends,
      },
      spacexvapeBrand: {
        ...spacexvapeBrandCurrent.details,
        previousDailyTrends: spacexvapeBrandPrevious.details.dailyTrends,
      },
      otherBrand: {
        ...otherBrandCurrent.details,
        previousDailyTrends: otherBrandPrevious.details.dailyTrends,
      },
    };

    return NextResponse.json({
      success: true,
      data: reportData,
    });

  } catch (error: any) {
    console.error('Vapsolo weekly report API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// 获取上周日期范围
function getPreviousWeekRange(currentStartDate: string, weekRangeMode: 'full' | 'monthly' = 'full') {
  const currentStart = new Date(currentStartDate);
  const prevWeekStart = new Date(currentStart);
  prevWeekStart.setDate(currentStart.getDate() - 7);
  const prevWeekEnd = new Date(prevWeekStart);
  prevWeekEnd.setDate(prevWeekStart.getDate() + 6);

  // 计算 ISO 周数
  const getISOWeek = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const getISOWeekYear = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    return d.getUTCFullYear();
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0] || '';
  };

  let effectiveStartDate = formatDate(prevWeekStart);
  let effectiveEndDate = formatDate(prevWeekEnd);

  // 月内周模式：将上周的日期范围也截断到其所在月的边界内
  if (weekRangeMode === 'monthly') {
    const refMonth = prevWeekStart.getMonth();
    const refYear = prevWeekStart.getFullYear();

    const monthStart = new Date(refYear, refMonth, 1);
    const monthEnd = new Date(refYear, refMonth + 1, 0);

    const monthStartStr = formatDate(monthStart);
    const monthEndStr = formatDate(monthEnd);

    if (effectiveStartDate < monthStartStr) {
      effectiveStartDate = monthStartStr;
    }
    if (effectiveEndDate > monthEndStr) {
      effectiveEndDate = monthEndStr;
    }
  }

  return {
    year: getISOWeekYear(prevWeekStart),
    week: getISOWeek(prevWeekStart),
    startDate: effectiveStartDate,
    endDate: effectiveEndDate,
    start: `${effectiveStartDate}T00:00:00.000Z`,
    end: `${effectiveEndDate}T23:59:59.999Z`,
  };
}

// 查询指定时间范围的订单
async function fetchOrdersByPeriod(supabase: any, startDate: string, endDate: string) {
  const allOrders: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          item_id,
          product_id,
          variation_id,
          sku,
          name,
          quantity,
          total,
          price
        ),
        wc_sites!inner (
          id,
          name
        )
      `)
      .gte('date_created', startDate)
      .lte('date_created', endDate)
      .in('status', ['completed', 'processing'])
      .range(offset, offset + pageSize - 1)
      .order('date_created', { ascending: true });

    if (error) {
      console.error('Failed to fetch orders:', error);
      throw new Error(`Failed to fetch orders: ${error.message}`);
    }

    if (pageData && pageData.length > 0) {
      // 展平站点信息到订单对象
      const flattenedOrders = pageData.map((order: any) => ({
        ...order,
        site_name: order.wc_sites?.name || '',
      }));

      allOrders.push(...flattenedOrders);
      offset += pageSize;
      hasMore = pageData.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allOrders;
}

// 处理订单数据（包含对比）
function processOrdersWithComparison(currentOrders: any[], previousOrders: any[], type: 'all' | 'retail' | 'wholesale') {
  // 计算汇总统计
  const summary = calculateSummary(currentOrders);

  // 聚合当周和上周的详细数据
  const currentBySite = aggregateBySite(currentOrders);
  const previousBySite = aggregateBySite(previousOrders);
  const bySiteWithComparison = mergeSiteComparison(currentBySite, previousBySite);

  const currentByCountry = aggregateByCountry(currentOrders);
  const previousByCountry = aggregateByCountry(previousOrders);
  const byCountryWithComparison = mergeCountryComparison(currentByCountry, previousByCountry);

  const currentBySpu = aggregateBySpu(currentOrders);
  const previousBySpu = aggregateBySpu(previousOrders);
  const bySpuWithComparison = mergeSpuComparison(currentBySpu, previousBySpu);

  // 计算详细数据
  const details = {
    bySite: bySiteWithComparison,
    byCountry: byCountryWithComparison,
    bySpu: bySpuWithComparison,
    dailyTrends: aggregateByDay(currentOrders),
  };

  return { summary, details };
}

// 处理订单数据（仅当前数据）
function processOrders(orders: any[], type: 'all' | 'retail' | 'wholesale') {
  // 计算汇总统计
  const summary = calculateSummary(orders);

  // 计算详细数据
  const details = {
    bySite: aggregateBySite(orders),
    byCountry: aggregateByCountry(orders),
    bySpu: aggregateBySpu(orders),
    dailyTrends: aggregateByDay(orders),
  };

  return { summary, details };
}

// 计算汇总统计
function calculateSummary(orders: any[]): SummaryStats {
  let totalOrders = 0;
  let totalRevenue = 0;
  let totalQuantity = 0;

  const orderSet = new Set<string>();

  orders.forEach(order => {
    // 统计唯一订单数
    if (!orderSet.has(order.id)) {
      orderSet.add(order.id);
      totalOrders++;
      totalRevenue += parseFloat(order.total || 0);
    }

    // 统计销量（应用换算规则）
    order.order_items?.forEach((item: any) => {
      const quantity = calculateVapsoloQuantity(item, order.site_name, spuConfig);
      totalQuantity += quantity;
    });
  });

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return {
    totalOrders,
    totalRevenue,
    totalQuantity,
    avgOrderValue,
  };
}

// 计算增长率
function calculateGrowth(current: SummaryStats, previous: SummaryStats): GrowthStats {
  const formatGrowth = (curr: number, prev: number): string => {
    if (prev === 0) return curr > 0 ? '+100.0' : '0.0';
    const growth = ((curr - prev) / prev) * 100;
    return growth >= 0 ? `+${growth.toFixed(1)}` : growth.toFixed(1);
  };

  return {
    orders: formatGrowth(current.totalOrders, previous.totalOrders),
    revenue: formatGrowth(current.totalRevenue, previous.totalRevenue),
    quantity: formatGrowth(current.totalQuantity, previous.totalQuantity),
    avgOrderValue: formatGrowth(current.avgOrderValue, previous.avgOrderValue),
  };
}

// 按站点聚合
function aggregateBySite(orders: any[]): SiteRankingItem[] {
  const siteMap = new Map<string, {
    siteId: string;
    siteName: string;
    siteType: VapsoloSiteType;
    orders: number;
    revenue: number;
    quantity: number;
  }>();

  orders.forEach(order => {
    const siteId = order.site_id;
    const siteName = order.site_name || 'Unknown';
    const siteType = getVapsoloSiteType(siteName);

    if (!siteType) return;

    if (!siteMap.has(siteId)) {
      siteMap.set(siteId, {
        siteId,
        siteName,
        siteType,
        orders: 0,
        revenue: 0,
        quantity: 0,
      });
    }

    const data = siteMap.get(siteId)!;
    data.orders++;
    data.revenue += parseFloat(order.total || 0);

    order.order_items?.forEach((item: any) => {
      const quantity = calculateVapsoloQuantity(item, siteName, spuConfig);
      data.quantity += quantity;
    });
  });

  const sites = Array.from(siteMap.values());
  const totalRevenue = sites.reduce((sum, site) => sum + site.revenue, 0);

  // 按销售额降序排序并添加排名和占比
  return sites
    .sort((a, b) => b.revenue - a.revenue)
    .map((site, index) => ({
      ...site,
      rank: index + 1,
      revenuePercentage: totalRevenue > 0 ? (site.revenue / totalRevenue) * 100 : 0,
      previousOrders: 0,
      previousRevenue: 0,
      previousQuantity: 0,
      ordersGrowth: '0.0%',
      revenueGrowth: '0.0%',
      quantityGrowth: '0.0%',
    }));
}

// 按国家聚合
function aggregateByCountry(orders: any[]): CountryStatsItem[] {
  const countryMap = new Map<string, {
    country: string;
    orders: number;
    revenue: number;
    quantity: number;
    retailQuantity: number;
    wholesaleQuantity: number;
    sites: Set<string>;
  }>();

  orders.forEach(order => {
    const country = order.shipping_country || order.billing_country || 'Unknown';
    const siteType = getVapsoloSiteType(order.site_name);

    if (!countryMap.has(country)) {
      countryMap.set(country, {
        country,
        orders: 0,
        revenue: 0,
        quantity: 0,
        retailQuantity: 0,
        wholesaleQuantity: 0,
        sites: new Set(),
      });
    }

    const data = countryMap.get(country)!;
    data.orders++;
    data.revenue += parseFloat(order.total || 0);
    data.sites.add(order.site_name);

    order.order_items?.forEach((item: any) => {
      const quantity = calculateVapsoloQuantity(item, order.site_name, spuConfig);
      data.quantity += quantity;

      if (siteType === 'retail') {
        data.retailQuantity += quantity;
      } else if (siteType === 'wholesale') {
        data.wholesaleQuantity += quantity;
      }
    });
  });

  // 按销售额降序排序
  return Array.from(countryMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((item, index) => ({
      country: item.country,
      countryName: getCountryName(item.country),
      orders: item.orders,
      revenue: item.revenue,
      quantity: item.quantity,
      retailQuantity: item.retailQuantity,
      wholesaleQuantity: item.wholesaleQuantity,
      rank: index + 1,
      sites: Array.from(item.sites),
      previousOrders: 0,
      previousRevenue: 0,
      previousQuantity: 0,
      ordersGrowth: '0.0%',
      revenueGrowth: '0.0%',
      quantityGrowth: '0.0%',
    }));
}

// 按 SPU 聚合
function aggregateBySpu(orders: any[]): SpuRankingItem[] {
  const spuMap = new Map<string, {
    spu: string;
    orders: number;
    revenue: number;
    quantity: number;
    retailQuantity: number;
    wholesaleQuantity: number;
    isSurpriseBox: boolean;
  }>();

  orders.forEach(order => {
    const siteType = getVapsoloSiteType(order.site_name);

    order.order_items?.forEach((item: any) => {
      const spu = extractSpu(item.name || 'Unknown', spuConfig, item.sku);
      const quantity = calculateVapsoloQuantity(item, order.site_name, spuConfig);

      if (!spuMap.has(spu)) {
        spuMap.set(spu, {
          spu,
          orders: 0,
          revenue: 0,
          quantity: 0,
          retailQuantity: 0,
          wholesaleQuantity: 0,
          isSurpriseBox: spu === 'Surprise Box',
        });
      }

      const data = spuMap.get(spu)!;
      data.orders++;
      data.revenue += parseFloat(item.total || 0);
      data.quantity += quantity;

      if (siteType === 'retail') {
        data.retailQuantity += quantity;
      } else if (siteType === 'wholesale') {
        data.wholesaleQuantity += quantity;
      }
    });
  });

  // 按销售额降序排序
  return Array.from(spuMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((item, index) => {
      // 计算换算倍数（取主要的站点类型）
      const mainType: VapsoloSiteType = item.retailQuantity >= item.wholesaleQuantity ? 'retail' : 'wholesale';
      const multiplier = getQuantityMultiplier(item.spu, mainType);

      return {
        ...item,
        rank: index + 1,
        multiplier,
        previousOrders: 0,
        previousRevenue: 0,
        previousQuantity: 0,
        ordersGrowth: '0.0%',
        revenueGrowth: '0.0%',
        quantityGrowth: '0.0%',
      };
    });
}

// 按日期聚合
function aggregateByDay(orders: any[]): DailyTrendItem[] {
  const dayMap = new Map<string, {
    date: string;
    orders: number;
    revenue: number;
    quantity: number;
    retailOrders: number;
    retailRevenue: number;
    retailQuantity: number;
    wholesaleOrders: number;
    wholesaleRevenue: number;
    wholesaleQuantity: number;
  }>();

  orders.forEach(order => {
    const date = new Date(order.date_created).toISOString().split('T')[0] || '';
    const siteType = getVapsoloSiteType(order.site_name);

    if (!dayMap.has(date)) {
      dayMap.set(date, {
        date,
        orders: 0,
        revenue: 0,
        quantity: 0,
        retailOrders: 0,
        retailRevenue: 0,
        retailQuantity: 0,
        wholesaleOrders: 0,
        wholesaleRevenue: 0,
        wholesaleQuantity: 0,
      });
    }

    const data = dayMap.get(date)!;
    const orderRevenue = parseFloat(order.total || 0);

    data.orders++;
    data.revenue += orderRevenue;

    if (siteType === 'retail') {
      data.retailOrders++;
      data.retailRevenue += orderRevenue;
    } else if (siteType === 'wholesale') {
      data.wholesaleOrders++;
      data.wholesaleRevenue += orderRevenue;
    }

    order.order_items?.forEach((item: any) => {
      const quantity = calculateVapsoloQuantity(item, order.site_name, spuConfig);
      data.quantity += quantity;

      if (siteType === 'retail') {
        data.retailQuantity += quantity;
      } else if (siteType === 'wholesale') {
        data.wholesaleQuantity += quantity;
      }
    });
  });

  // 按日期升序排序
  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// 合并站点对比数据
function mergeSiteComparison(current: any[], previous: any[]): SiteRankingItem[] {
  const previousMap = new Map(previous.map(item => [item.siteId, item]));

  return current.map(curr => {
    const prev = previousMap.get(curr.siteId) || { orders: 0, revenue: 0, quantity: 0 };

    const formatGrowth = (currVal: number, prevVal: number): string => {
      if (prevVal === 0) return currVal > 0 ? '+100.0%' : '0.0%';
      const growth = ((currVal - prevVal) / prevVal) * 100;
      return (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%';
    };

    return {
      ...curr,
      previousOrders: prev.orders,
      previousRevenue: prev.revenue,
      previousQuantity: prev.quantity,
      ordersGrowth: formatGrowth(curr.orders, prev.orders),
      revenueGrowth: formatGrowth(curr.revenue, prev.revenue),
      quantityGrowth: formatGrowth(curr.quantity, prev.quantity),
    };
  });
}

// 合并国家对比数据
function mergeCountryComparison(current: any[], previous: any[]): CountryStatsItem[] {
  const previousMap = new Map(previous.map(item => [item.country, item]));

  return current.map(curr => {
    const prev = previousMap.get(curr.country) || { orders: 0, revenue: 0, quantity: 0 };

    const formatGrowth = (currVal: number, prevVal: number): string => {
      if (prevVal === 0) return currVal > 0 ? '+100.0%' : '0.0%';
      const growth = ((currVal - prevVal) / prevVal) * 100;
      return (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%';
    };

    return {
      ...curr,
      previousOrders: prev.orders,
      previousRevenue: prev.revenue,
      previousQuantity: prev.quantity,
      ordersGrowth: formatGrowth(curr.orders, prev.orders),
      revenueGrowth: formatGrowth(curr.revenue, prev.revenue),
      quantityGrowth: formatGrowth(curr.quantity, prev.quantity),
    };
  });
}

// 合并 SPU 对比数据
function mergeSpuComparison(current: any[], previous: any[]): SpuRankingItem[] {
  const previousMap = new Map(previous.map(item => [item.spu, item]));

  return current.map(curr => {
    const prev = previousMap.get(curr.spu) || { orders: 0, revenue: 0, quantity: 0 };

    const formatGrowth = (currVal: number, prevVal: number): string => {
      if (prevVal === 0) return currVal > 0 ? '+100.0%' : '0.0%';
      const growth = ((currVal - prevVal) / prevVal) * 100;
      return (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%';
    };

    return {
      ...curr,
      previousOrders: prev.orders,
      previousRevenue: prev.revenue,
      previousQuantity: prev.quantity,
      ordersGrowth: formatGrowth(curr.orders, prev.orders),
      revenueGrowth: formatGrowth(curr.revenue, prev.revenue),
      quantityGrowth: formatGrowth(curr.quantity, prev.quantity),
    };
  });
}
