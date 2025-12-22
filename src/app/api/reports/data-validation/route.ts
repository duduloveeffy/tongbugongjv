import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  filterVapsoloBrandOrders,
  filterSpacexvapeBrandOrders,
  filterOtherBrandOrders,
  filterRetailOrders,
  filterWholesaleOrders,
  calculateVapsoloQuantity,
} from '@/lib/vapsolo-utils';
import { type SpuExtractionConfig } from '@/lib/spu-utils';
import { defaultSpuMappings } from '@/config/spu-mappings';

// 请求参数接口
interface RequestParams {
  year: number;
  month: number; // 1-12
  weekRangeMode?: 'full' | 'monthly'; // 完整周 或 月内周
}

// 周数据
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

// 汇总数据
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

// 差异数据
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

// 验证结果
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

// 获取ISO周数
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// 获取某月的所有完整周
function getWeeksInMonth(year: number, month: number): Array<{ weekNumber: number; startDate: string; endDate: string; isPartial: boolean }> {
  const weeks: Array<{ weekNumber: number; startDate: string; endDate: string; isPartial: boolean }> = [];

  // 月份的第一天和最后一天
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  // 找到该月第一天所在的周一
  let current = new Date(firstDay);
  const dayOfWeek = current.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  current.setDate(current.getDate() - daysToMonday);

  while (current <= lastDay) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // 判断这周是否完全在该月内
    const isPartial = weekStart.getMonth() !== month - 1 || weekEnd.getMonth() !== month - 1;

    // 只要这周与该月有交集，就包含进来
    if (weekEnd >= firstDay && weekStart <= lastDay) {
      weeks.push({
        weekNumber: getISOWeek(weekStart),
        startDate: weekStart.toISOString().split('T')[0] as string,
        endDate: weekEnd.toISOString().split('T')[0] as string,
        isPartial,
      });
    }

    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

// 计算差异百分比
function calcDiffPercent(weeklySum: number, monthly: number): string {
  if (monthly === 0) {
    return weeklySum === 0 ? '0.00%' : '∞';
  }
  const diff = ((weeklySum - monthly) / monthly) * 100;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestParams = await request.json();
    const { year, month, weekRangeMode = 'full' } = body;

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: '无效的年份或月份' }, { status: 400 });
    }

    console.log(`[Data Validation] 周范围模式: ${weekRangeMode}`);

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase 客户端未配置' }, { status: 500 });
    }

    // 计算月份日期范围
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const monthStartStr = monthStart.toISOString().split('T')[0] as string;
    const monthEndStr = monthEnd.toISOString().split('T')[0] as string;

    // 获取该月所有周
    const weeksInMonth = getWeeksInMonth(year, month);

    // SPU提取配置
    const spuConfig: SpuExtractionConfig = {
      mode: 'series',
      nameMapping: defaultSpuMappings,
    };

    // 计算查询范围：需要包含所有周的完整日期范围（包括跨月部分）
    const firstWeek = weeksInMonth[0];
    const lastWeek = weeksInMonth[weeksInMonth.length - 1];
    const queryStartStr = firstWeek ? firstWeek.startDate : monthStartStr;
    const queryEndStr = lastWeek ? lastWeek.endDate : monthEndStr;

    // 分页查询订单（Supabase 默认限制1000条）
    const pageSize = 1000;
    let allOrders: any[] = [];
    let offset = 0;
    let hasMore = true;

    console.log(`[Data Validation] 开始查询 ${year}年${month}月 订单数据...`);
    console.log(`[Data Validation] 查询范围: ${queryStartStr} ~ ${queryEndStr}`);

    while (hasMore) {
      const { data: pageOrders, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_id,
          site_id,
          status,
          total,
          date_created,
          shipping_country,
          billing_country,
          order_items (
            id,
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
        .gte('date_created', `${queryStartStr}T00:00:00`)
        .lte('date_created', `${queryEndStr}T23:59:59`)
        .in('status', ['completed', 'processing'])
        .order('date_created', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('Database query error:', error);
        return NextResponse.json({ error: '数据库查询失败' }, { status: 500 });
      }

      if (pageOrders && pageOrders.length > 0) {
        allOrders = [...allOrders, ...pageOrders];
        offset += pageSize;
        hasMore = pageOrders.length === pageSize;
        console.log(`[Data Validation] 已获取 ${allOrders.length} 条订单...`);
      } else {
        hasMore = false;
      }
    }

    console.log(`[Data Validation] 查询完成，共 ${allOrders.length} 条订单`);

    // 添加 site_name 到每个订单
    const ordersWithSiteName = allOrders.map((order: any) => ({
      ...order,
      site_name: order.wc_sites?.name || '',
    }));

    // 处理每周数据
    const weeksData: WeekData[] = [];

    for (const week of weeksInMonth) {
      // 根据 weekRangeMode 计算实际的周范围
      let effectiveStartDate = week.startDate;
      let effectiveEndDate = week.endDate;

      if (weekRangeMode === 'monthly') {
        // 月内周模式：将周范围截断到月边界内
        if (effectiveStartDate < monthStartStr) {
          effectiveStartDate = monthStartStr;
        }
        if (effectiveEndDate > monthEndStr) {
          effectiveEndDate = monthEndStr;
        }
      }

      // 过滤该周的订单（使用有效的日期范围）
      const weekOrders = ordersWithSiteName.filter((order: any) => {
        const orderDate = order.date_created.split('T')[0];
        return orderDate >= effectiveStartDate && orderDate <= effectiveEndDate;
      });

      // 按品牌过滤
      const vapsoloOrders = filterVapsoloBrandOrders(weekOrders);
      const vapsoloRetailOrders = filterRetailOrders(vapsoloOrders);
      const vapsoloWholesaleOrders = filterWholesaleOrders(vapsoloOrders);
      const spacexvapeOrders = filterSpacexvapeBrandOrders(weekOrders);
      const otherOrders = filterOtherBrandOrders(weekOrders);

      // 计算统计数据
      const calcStats = (orderList: any[]) => {
        const uniqueOrderIds = new Set(orderList.map((o: any) => `${o.site_id}-${o.order_id}`));
        let totalRevenue = 0;
        let totalQuantity = 0;

        for (const order of orderList) {
          totalRevenue += parseFloat(order.total || 0);
          for (const item of (order.order_items || [])) {
            const quantity = calculateVapsoloQuantity(item, order.site_name, spuConfig);
            totalQuantity += quantity;
          }
        }

        return {
          orders: uniqueOrderIds.size,
          revenue: Math.round(totalRevenue * 100) / 100,
          quantity: totalQuantity,
        };
      };

      const allStats = calcStats(weekOrders);
      const vapsoloStats = calcStats(vapsoloOrders);
      const vapsoloRetailStats = calcStats(vapsoloRetailOrders);
      const vapsoloWholesaleStats = calcStats(vapsoloWholesaleOrders);
      const spacexvapeStats = calcStats(spacexvapeOrders);
      const otherStats = calcStats(otherOrders);

      weeksData.push({
        weekNumber: week.weekNumber,
        startDate: week.startDate,
        endDate: week.endDate,
        orders: allStats.orders,
        revenue: allStats.revenue,
        quantity: allStats.quantity,
        vapsoloOrders: vapsoloStats.orders,
        vapsoloRevenue: vapsoloStats.revenue,
        vapsoloQuantity: vapsoloStats.quantity,
        vapsoloRetailOrders: vapsoloRetailStats.orders,
        vapsoloRetailRevenue: vapsoloRetailStats.revenue,
        vapsoloRetailQuantity: vapsoloRetailStats.quantity,
        vapsoloWholesaleOrders: vapsoloWholesaleStats.orders,
        vapsoloWholesaleRevenue: vapsoloWholesaleStats.revenue,
        vapsoloWholesaleQuantity: vapsoloWholesaleStats.quantity,
        spacexvapeOrders: spacexvapeStats.orders,
        spacexvapeRevenue: spacexvapeStats.revenue,
        spacexvapeQuantity: spacexvapeStats.quantity,
        otherOrders: otherStats.orders,
        otherRevenue: otherStats.revenue,
        otherQuantity: otherStats.quantity,
      });
    }

    // 计算周报汇总
    const weeklySum: SummaryData = weeksData.reduce((acc, week) => ({
      orders: acc.orders + week.orders,
      revenue: Math.round((acc.revenue + week.revenue) * 100) / 100,
      quantity: acc.quantity + week.quantity,
      vapsoloOrders: acc.vapsoloOrders + week.vapsoloOrders,
      vapsoloRevenue: Math.round((acc.vapsoloRevenue + week.vapsoloRevenue) * 100) / 100,
      vapsoloQuantity: acc.vapsoloQuantity + week.vapsoloQuantity,
      vapsoloRetailOrders: acc.vapsoloRetailOrders + week.vapsoloRetailOrders,
      vapsoloRetailRevenue: Math.round((acc.vapsoloRetailRevenue + week.vapsoloRetailRevenue) * 100) / 100,
      vapsoloRetailQuantity: acc.vapsoloRetailQuantity + week.vapsoloRetailQuantity,
      vapsoloWholesaleOrders: acc.vapsoloWholesaleOrders + week.vapsoloWholesaleOrders,
      vapsoloWholesaleRevenue: Math.round((acc.vapsoloWholesaleRevenue + week.vapsoloWholesaleRevenue) * 100) / 100,
      vapsoloWholesaleQuantity: acc.vapsoloWholesaleQuantity + week.vapsoloWholesaleQuantity,
      spacexvapeOrders: acc.spacexvapeOrders + week.spacexvapeOrders,
      spacexvapeRevenue: Math.round((acc.spacexvapeRevenue + week.spacexvapeRevenue) * 100) / 100,
      spacexvapeQuantity: acc.spacexvapeQuantity + week.spacexvapeQuantity,
      otherOrders: acc.otherOrders + week.otherOrders,
      otherRevenue: Math.round((acc.otherRevenue + week.otherRevenue) * 100) / 100,
      otherQuantity: acc.otherQuantity + week.otherQuantity,
    }), {
      orders: 0,
      revenue: 0,
      quantity: 0,
      vapsoloOrders: 0,
      vapsoloRevenue: 0,
      vapsoloQuantity: 0,
      vapsoloRetailOrders: 0,
      vapsoloRetailRevenue: 0,
      vapsoloRetailQuantity: 0,
      vapsoloWholesaleOrders: 0,
      vapsoloWholesaleRevenue: 0,
      vapsoloWholesaleQuantity: 0,
      spacexvapeOrders: 0,
      spacexvapeRevenue: 0,
      spacexvapeQuantity: 0,
      otherOrders: 0,
      otherRevenue: 0,
      otherQuantity: 0,
    });

    // 计算月报数据（直接从该月订单计算，使用月份日期边界）
    const monthlyOrders = ordersWithSiteName.filter((order: any) => {
      const orderDate = order.date_created.split('T')[0];
      return orderDate >= monthStartStr && orderDate <= monthEndStr;
    });

    const vapsoloMonthlyOrders = filterVapsoloBrandOrders(monthlyOrders);
    const vapsoloRetailMonthlyOrders = filterRetailOrders(vapsoloMonthlyOrders);
    const vapsoloWholesaleMonthlyOrders = filterWholesaleOrders(vapsoloMonthlyOrders);
    const spacexvapeMonthlyOrders = filterSpacexvapeBrandOrders(monthlyOrders);
    const otherMonthlyOrders = filterOtherBrandOrders(monthlyOrders);

    const calcMonthlyStats = (orderList: any[]) => {
      const uniqueOrderIds = new Set(orderList.map((o: any) => `${o.site_id}-${o.order_id}`));
      let totalRevenue = 0;
      let totalQuantity = 0;

      for (const order of orderList) {
        totalRevenue += parseFloat(order.total || 0);
        for (const item of (order.order_items || [])) {
          const quantity = calculateVapsoloQuantity(item, order.site_name, spuConfig);
          totalQuantity += quantity;
        }
      }

      return {
        orders: uniqueOrderIds.size,
        revenue: Math.round(totalRevenue * 100) / 100,
        quantity: totalQuantity,
      };
    };

    const monthlyAllStats = calcMonthlyStats(monthlyOrders);
    const monthlyVapsoloStats = calcMonthlyStats(vapsoloMonthlyOrders);
    const monthlyVapsoloRetailStats = calcMonthlyStats(vapsoloRetailMonthlyOrders);
    const monthlyVapsoloWholesaleStats = calcMonthlyStats(vapsoloWholesaleMonthlyOrders);
    const monthlySpacexvapeStats = calcMonthlyStats(spacexvapeMonthlyOrders);
    const monthlyOtherStats = calcMonthlyStats(otherMonthlyOrders);

    const monthlyData: SummaryData = {
      orders: monthlyAllStats.orders,
      revenue: monthlyAllStats.revenue,
      quantity: monthlyAllStats.quantity,
      vapsoloOrders: monthlyVapsoloStats.orders,
      vapsoloRevenue: monthlyVapsoloStats.revenue,
      vapsoloQuantity: monthlyVapsoloStats.quantity,
      vapsoloRetailOrders: monthlyVapsoloRetailStats.orders,
      vapsoloRetailRevenue: monthlyVapsoloRetailStats.revenue,
      vapsoloRetailQuantity: monthlyVapsoloRetailStats.quantity,
      vapsoloWholesaleOrders: monthlyVapsoloWholesaleStats.orders,
      vapsoloWholesaleRevenue: monthlyVapsoloWholesaleStats.revenue,
      vapsoloWholesaleQuantity: monthlyVapsoloWholesaleStats.quantity,
      spacexvapeOrders: monthlySpacexvapeStats.orders,
      spacexvapeRevenue: monthlySpacexvapeStats.revenue,
      spacexvapeQuantity: monthlySpacexvapeStats.quantity,
      otherOrders: monthlyOtherStats.orders,
      otherRevenue: monthlyOtherStats.revenue,
      otherQuantity: monthlyOtherStats.quantity,
    };

    // 计算差异
    const difference: DifferenceData = {
      orders: weeklySum.orders - monthlyData.orders,
      revenue: Math.round((weeklySum.revenue - monthlyData.revenue) * 100) / 100,
      quantity: weeklySum.quantity - monthlyData.quantity,
      ordersPercent: calcDiffPercent(weeklySum.orders, monthlyData.orders),
      revenuePercent: calcDiffPercent(weeklySum.revenue, monthlyData.revenue),
      quantityPercent: calcDiffPercent(weeklySum.quantity, monthlyData.quantity),
      vapsoloOrders: weeklySum.vapsoloOrders - monthlyData.vapsoloOrders,
      vapsoloRevenue: Math.round((weeklySum.vapsoloRevenue - monthlyData.vapsoloRevenue) * 100) / 100,
      vapsoloQuantity: weeklySum.vapsoloQuantity - monthlyData.vapsoloQuantity,
      vapsoloOrdersPercent: calcDiffPercent(weeklySum.vapsoloOrders, monthlyData.vapsoloOrders),
      vapsoloRevenuePercent: calcDiffPercent(weeklySum.vapsoloRevenue, monthlyData.vapsoloRevenue),
      vapsoloQuantityPercent: calcDiffPercent(weeklySum.vapsoloQuantity, monthlyData.vapsoloQuantity),
      vapsoloRetailOrders: weeklySum.vapsoloRetailOrders - monthlyData.vapsoloRetailOrders,
      vapsoloRetailRevenue: Math.round((weeklySum.vapsoloRetailRevenue - monthlyData.vapsoloRetailRevenue) * 100) / 100,
      vapsoloRetailQuantity: weeklySum.vapsoloRetailQuantity - monthlyData.vapsoloRetailQuantity,
      vapsoloRetailOrdersPercent: calcDiffPercent(weeklySum.vapsoloRetailOrders, monthlyData.vapsoloRetailOrders),
      vapsoloRetailRevenuePercent: calcDiffPercent(weeklySum.vapsoloRetailRevenue, monthlyData.vapsoloRetailRevenue),
      vapsoloRetailQuantityPercent: calcDiffPercent(weeklySum.vapsoloRetailQuantity, monthlyData.vapsoloRetailQuantity),
      vapsoloWholesaleOrders: weeklySum.vapsoloWholesaleOrders - monthlyData.vapsoloWholesaleOrders,
      vapsoloWholesaleRevenue: Math.round((weeklySum.vapsoloWholesaleRevenue - monthlyData.vapsoloWholesaleRevenue) * 100) / 100,
      vapsoloWholesaleQuantity: weeklySum.vapsoloWholesaleQuantity - monthlyData.vapsoloWholesaleQuantity,
      vapsoloWholesaleOrdersPercent: calcDiffPercent(weeklySum.vapsoloWholesaleOrders, monthlyData.vapsoloWholesaleOrders),
      vapsoloWholesaleRevenuePercent: calcDiffPercent(weeklySum.vapsoloWholesaleRevenue, monthlyData.vapsoloWholesaleRevenue),
      vapsoloWholesaleQuantityPercent: calcDiffPercent(weeklySum.vapsoloWholesaleQuantity, monthlyData.vapsoloWholesaleQuantity),
      spacexvapeOrders: weeklySum.spacexvapeOrders - monthlyData.spacexvapeOrders,
      spacexvapeRevenue: Math.round((weeklySum.spacexvapeRevenue - monthlyData.spacexvapeRevenue) * 100) / 100,
      spacexvapeQuantity: weeklySum.spacexvapeQuantity - monthlyData.spacexvapeQuantity,
      spacexvapeOrdersPercent: calcDiffPercent(weeklySum.spacexvapeOrders, monthlyData.spacexvapeOrders),
      spacexvapeRevenuePercent: calcDiffPercent(weeklySum.spacexvapeRevenue, monthlyData.spacexvapeRevenue),
      spacexvapeQuantityPercent: calcDiffPercent(weeklySum.spacexvapeQuantity, monthlyData.spacexvapeQuantity),
      otherOrders: weeklySum.otherOrders - monthlyData.otherOrders,
      otherRevenue: Math.round((weeklySum.otherRevenue - monthlyData.otherRevenue) * 100) / 100,
      otherQuantity: weeklySum.otherQuantity - monthlyData.otherQuantity,
      otherOrdersPercent: calcDiffPercent(weeklySum.otherOrders, monthlyData.otherOrders),
      otherRevenuePercent: calcDiffPercent(weeklySum.otherRevenue, monthlyData.otherRevenue),
      otherQuantityPercent: calcDiffPercent(weeklySum.otherQuantity, monthlyData.otherQuantity),
    };

    // 验证结果
    const validationNotes: string[] = [];

    // 检查周数据是否跨月
    const hasPartialWeeks = weeksInMonth.some(w => w.isPartial);
    if (hasPartialWeeks) {
      validationNotes.push('注意：该月包含跨月的周，周汇总数据可能超出月份范围');
    }

    // 检查数据差异
    if (difference.orders !== 0) {
      validationNotes.push(`订单数差异: ${difference.orders > 0 ? '+' : ''}${difference.orders}`);
    }
    if (Math.abs(difference.revenue) > 0.01) {
      validationNotes.push(`销售额差异: ${difference.revenue > 0 ? '+' : ''}€${difference.revenue.toFixed(2)}`);
    }
    if (difference.quantity !== 0) {
      validationNotes.push(`销量差异: ${difference.quantity > 0 ? '+' : ''}${difference.quantity}`);
    }

    // 如果周汇总和月度数据完全一致，标记为验证通过
    const isValid =
      difference.orders === 0 &&
      Math.abs(difference.revenue) < 0.01 &&
      difference.quantity === 0;

    if (isValid) {
      validationNotes.unshift('✓ 数据验证通过：周报汇总与月报数据一致');
    } else if (hasPartialWeeks) {
      validationNotes.unshift('⚠ 因跨月周导致数据差异，属于正常情况');
    }

    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

    const result: ValidationResult = {
      period: {
        year,
        month,
        monthName: monthNames[month - 1] as string,
        startDate: monthStartStr,
        endDate: monthEndStr,
      },
      weeks: weeksData,
      weeklySum,
      monthlyData,
      difference,
      isValid,
      validationNotes,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Data validation error:', error);
    return NextResponse.json(
      { error: '数据验证失败', details: String(error) },
      { status: 500 }
    );
  }
}