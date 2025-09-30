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

    // 1. 获取总订单数
    const { count: totalCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    // 2. 获取最近5个订单
    const { data: recentOrders } = await supabase
      .from('orders')
      .select('id, order_id, date_created, status, site_id, total')
      .order('date_created', { ascending: false })
      .limit(5);

    // 3. 获取所有不同的状态 - 改用SQL查询获取准确的状态分布
    const statusCounts: Record<string, number> = {};

    // 获取每个状态的数量
    const statuses = ['processing', 'completed', 'pending', 'failed', 'cancelled', 'on-hold', 'refunded'];
    for (const status of statuses) {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);

      if (count && count > 0) {
        statusCounts[status] = count;
      }
    }

    const uniqueStatuses = Object.keys(statusCounts);

    // 4. 获取所有站点
    const { data: sites } = await supabase
      .from('wc_sites')
      .select('id, name, enabled');

    // 5. 统计每个站点的订单数
    const siteOrderCounts: Record<string, number> = {};
    if (sites) {
      for (const site of sites) {
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', site.id);

        siteOrderCounts[site.name] = count || 0;
      }
    }

    // 6. 获取昨天的订单 - 修正日期范围
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const { data: yesterdayOrders } = await supabase
      .from('orders')
      .select('id, date_created, status, site_id')
      .gte('date_created', yesterday.toISOString())
      .lte('date_created', yesterdayEnd.toISOString())
      .order('date_created', { ascending: false })
      .limit(20);

    // 7. 获取过去7天的订单分布
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const { data: weekOrders, count: weekCount } = await supabase
      .from('orders')
      .select('id, date_created, status', { count: 'exact' })
      .gte('date_created', weekAgo.toISOString())
      .lte('date_created', now.toISOString());

    // 统计过去7天各状态的订单数
    const weekStatusCounts: Record<string, number> = {};
    if (weekOrders) {
      weekOrders.forEach(order => {
        const status = order.status || 'unknown';
        weekStatusCounts[status] = (weekStatusCounts[status] || 0) + 1;
      });
    }

    // 8. 检查日期格式和实际查询测试
    let dateFormat = 'unknown';
    if (recentOrders && recentOrders.length > 0) {
      const sampleDate = recentOrders[0].date_created;
      if (sampleDate) {
        if (sampleDate.includes('T')) {
          dateFormat = 'ISO 8601 with timezone';
        } else if (sampleDate.includes(' ')) {
          dateFormat = 'SQL datetime';
        } else {
          dateFormat = 'other: ' + sampleDate;
        }
      }
    }

    // 9. 直接测试销量页面使用的查询
    const testStart = yesterday.toISOString();
    const testEnd = yesterdayEnd.toISOString();
    const testStatuses = ['processing', 'completed', 'failed', 'cancelled'];

    const { data: testOrders, count: testCount } = await supabase
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
        )
      `, { count: 'exact' })
      .gte('date_created', testStart)
      .lte('date_created', testEnd)
      .in('status', testStatuses)
      .limit(5);

    return NextResponse.json({
      success: true,
      debug: {
        totalOrders: totalCount,
        recentOrders: recentOrders || [],
        uniqueStatuses,
        statusCounts,
        sites: sites?.map(s => ({ id: s.id, name: s.name, enabled: s.enabled })),
        siteOrderCounts,
        yesterdayQuery: {
          startDate: yesterday.toISOString(),
          endDate: yesterdayEnd.toISOString(),
          ordersFound: yesterdayOrders?.length || 0,
          samples: yesterdayOrders?.slice(0, 5)
        },
        last7Days: {
          totalOrders: weekCount || 0,
          statusDistribution: weekStatusCounts,
          dateRange: {
            start: weekAgo.toISOString(),
            end: now.toISOString()
          }
        },
        salesPageQuery: {
          dateRange: {
            start: testStart,
            end: testEnd
          },
          statuses: testStatuses,
          ordersFound: testCount || 0,
          samples: testOrders?.slice(0, 3)
        },
        dateFormat,
        note: 'Check the date_created format and status values'
      }
    });

  } catch (error: any) {
    console.error('Debug API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}