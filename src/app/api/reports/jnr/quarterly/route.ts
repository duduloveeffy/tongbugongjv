import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  filterJnrOrders,
  filterRetailOrders,
  filterWholesaleOrders,
  calculateJnrQuantity,
  getJnrSiteType,
  getQuantityMultiplier,
  type JnrSiteType,
} from '@/lib/jnr-utils';
import { extractSpu, type SpuExtractionConfig } from '@/lib/spu-utils';
import { defaultSpuMappings } from '@/config/spu-mappings';
import { getCountryName } from '@/lib/country-utils';
import { getQuarterRange, getPreviousQuarterRange } from '@/lib/quarter-utils';

// 请求参数接口
interface RequestParams {
  year: number;
  quarter: number; // 1-4
}

// 季报数据结构
interface QuarterlyReportData {
  period: {
    current: { year: number; quarter: number; start: string; end: string };
    previous: { year: number; quarter: number; start: string; end: string };
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
  all: DetailedStats;
  retail: DetailedStats;
  wholesale: DetailedStats;
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
  siteType: JnrSiteType;
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

// SPU 提取配置 - JNR 使用 SKU 前缀聚合方式
const spuConfig: SpuExtractionConfig = {
  mode: 'sku-prefix',
  nameMapping: defaultSpuMappings,
};

export async function POST(request: NextRequest) {
  try {
    const body: RequestParams = await request.json();
    const { year, quarter } = body;

    // 参数验证
    if (!year || !quarter || quarter < 1 || quarter > 4) {
      return NextResponse.json(
        { error: 'Invalid year or quarter parameter' },
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

    // 计算当季和上季的日期范围
    const currentPeriod = getQuarterRange(year, quarter);
    const previousPeriod = getPreviousQuarterRange(year, quarter);

    console.log('[JNR Quarterly Report] Querying:', {
      current: currentPeriod,
      previous: previousPeriod,
    });

    // 查询当月和上月的订单数据
    const [currentOrders, previousOrders] = await Promise.all([
      fetchOrdersByPeriod(supabase, currentPeriod.start, currentPeriod.end),
      fetchOrdersByPeriod(supabase, previousPeriod.start, previousPeriod.end),
    ]);

    // 过滤 JNR 订单
    const jnrCurrentOrders = filterJnrOrders(currentOrders);
    const jnrPreviousOrders = filterJnrOrders(previousOrders);

    console.log('[JNR Quarterly Report] Filtered orders:', {
      current: jnrCurrentOrders.length,
      previous: jnrPreviousOrders.length,
    });

    // 处理数据：全部、零售、批发（包含对比数据）
    const allCurrent = processOrdersWithComparison(jnrCurrentOrders, jnrPreviousOrders, 'all');
    const retailCurrent = processOrdersWithComparison(
      filterRetailOrders(jnrCurrentOrders),
      filterRetailOrders(jnrPreviousOrders),
      'retail'
    );
    const wholesaleCurrent = processOrdersWithComparison(
      filterWholesaleOrders(jnrCurrentOrders),
      filterWholesaleOrders(jnrPreviousOrders),
      'wholesale'
    );

    // 仍需要独立处理上月数据以获取summary
    const allPrevious = processOrders(jnrPreviousOrders, 'all');
    const retailPrevious = processOrders(filterRetailOrders(jnrPreviousOrders), 'retail');
    const wholesalePrevious = processOrders(filterWholesaleOrders(jnrPreviousOrders), 'wholesale');

    // 计算总体概览
    const summary = {
      current: allCurrent.summary,
      previous: allPrevious.summary,
      growth: calculateGrowth(allCurrent.summary, allPrevious.summary),
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

    // 构建返回数据（添加上个季度的日趋势）
    const reportData: QuarterlyReportData = {
      period: {
        current: { year, quarter, start: currentPeriod.start, end: currentPeriod.end },
        previous: { year: previousPeriod.year, quarter: previousPeriod.quarter, start: previousPeriod.start, end: previousPeriod.end },
      },
      summary,
      siteTypeComparison,
      all: {
        ...allCurrent.details,
        previousDailyTrends: allPrevious.details.dailyTrends,
      },
      retail: {
        ...retailCurrent.details,
        previousDailyTrends: retailPrevious.details.dailyTrends,
      },
      wholesale: {
        ...wholesaleCurrent.details,
        previousDailyTrends: wholesalePrevious.details.dailyTrends,
      },
    };

    return NextResponse.json({
      success: true,
      data: reportData,
    });

  } catch (error: any) {
    console.error('JNR quarterly report API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
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

  // 聚合当月和上月的详细数据
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
      const quantity = calculateJnrQuantity(item, order.site_name, spuConfig);
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
    siteType: JnrSiteType;
    orders: number;
    revenue: number;
    quantity: number;
  }>();

  orders.forEach(order => {
    const siteId = order.site_id;
    const siteName = order.site_name || 'Unknown';
    const siteType = getJnrSiteType(siteName);

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
      const quantity = calculateJnrQuantity(item, siteName, spuConfig);
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
    const siteType = getJnrSiteType(order.site_name);

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
      const quantity = calculateJnrQuantity(item, order.site_name, spuConfig);
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
      countryName: getCountryName(item.country), // 使用中文国家名称
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
  }>();

  orders.forEach(order => {
    const siteType = getJnrSiteType(order.site_name);

    order.order_items?.forEach((item: any) => {
      const spu = extractSpu(item.name || 'Unknown', spuConfig, item.sku);
      const quantity = calculateJnrQuantity(item, order.site_name, spuConfig);

      if (!spuMap.has(spu)) {
        spuMap.set(spu, {
          spu,
          orders: 0,
          revenue: 0,
          quantity: 0,
          retailQuantity: 0,
          wholesaleQuantity: 0,
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
      const mainType: JnrSiteType = item.retailQuantity >= item.wholesaleQuantity ? 'retail' : 'wholesale';
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
    const siteType = getJnrSiteType(order.site_name);

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
      const quantity = calculateJnrQuantity(item, order.site_name, spuConfig);
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
