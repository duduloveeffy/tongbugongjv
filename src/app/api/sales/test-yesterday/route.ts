import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    // 获取昨天的准确日期范围
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    console.log('[Test Yesterday] Date range:', {
      yesterday: yesterday.toISOString(),
      yesterdayEnd: yesterdayEnd.toISOString(),
      now: now.toISOString()
    });

    // 1. 获取昨天所有状态的订单
    const { data: allYesterdayOrders, count: yesterdayCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .gte('date_created', yesterday.toISOString())
      .lte('date_created', yesterdayEnd.toISOString());

    // 2. 获取昨天特定状态的订单
    const targetStatuses = ['processing', 'completed', 'pending', 'on-hold', 'cancelled', 'refunded', 'failed'];
    const { data: statusOrders, count: statusCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .gte('date_created', yesterday.toISOString())
      .lte('date_created', yesterdayEnd.toISOString())
      .in('status', targetStatuses);

    // 3. 按状态分组统计
    const statusBreakdown: Record<string, number> = {};
    if (allYesterdayOrders) {
      allYesterdayOrders.forEach(order => {
        const status = order.status || 'unknown';
        statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
      });
    }

    // 4. 获取昨天每个站点的订单
    const siteBreakdown: Record<string, number> = {};
    if (allYesterdayOrders) {
      allYesterdayOrders.forEach(order => {
        const siteId = order.site_id || 'unknown';
        siteBreakdown[siteId] = (siteBreakdown[siteId] || 0) + 1;
      });
    }

    // 5. 获取最近7天每天的订单数量
    const dailyBreakdown: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(now);
      dayEnd.setDate(dayEnd.getDate() - i);
      dayEnd.setHours(23, 59, 59, 999);

      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('date_created', dayStart.toISOString())
        .lte('date_created', dayEnd.toISOString());

      const dateKey = dayStart.toISOString().split('T')[0];
      dailyBreakdown[dateKey] = count || 0;
    }

    // 6. 示例订单
    const sampleOrders = allYesterdayOrders?.slice(0, 5).map(order => ({
      id: order.id,
      order_id: order.order_id,
      status: order.status,
      site_id: order.site_id,
      date_created: order.date_created,
      total: order.total
    }));

    return NextResponse.json({
      success: true,
      dateRange: {
        yesterday: yesterday.toISOString(),
        yesterdayEnd: yesterdayEnd.toISOString(),
        localDate: {
          yesterday: yesterday.toString(),
          yesterdayEnd: yesterdayEnd.toString()
        }
      },
      summary: {
        totalOrdersYesterday: yesterdayCount || 0,
        ordersWithTargetStatuses: statusCount || 0,
        targetStatuses: targetStatuses
      },
      breakdowns: {
        byStatus: statusBreakdown,
        bySite: siteBreakdown,
        byDay: dailyBreakdown
      },
      samples: sampleOrders || [],
      queryUsed: {
        dateFilter: `date_created >= '${yesterday.toISOString()}' AND date_created <= '${yesterdayEnd.toISOString()}'`,
        statusFilter: targetStatuses
      }
    });

  } catch (error: any) {
    console.error('Test yesterday API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}