import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // 1. 获取订单总数
    const { count: totalCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    // 2. 获取最新的10个订单
    const { data: latestOrders, error: latestError } = await supabase
      .from('orders')
      .select('*')
      .order('date_created', { ascending: false })
      .limit(10);

    // 3. 获取所有唯一的状态值
    const { data: statusData } = await supabase
      .from('orders')
      .select('status')
      .limit(1000);

    const uniqueStatuses = new Set();
    if (statusData) {
      statusData.forEach(item => {
        if (item.status) uniqueStatuses.add(item.status);
      });
    }

    // 4. 昨天的日期（使用多种格式尝试）
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // 尝试不同的日期格式
    const dateTests = [];

    // 测试1: 使用date_created LIKE查询
    const yesterdayStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
    const { data: likeOrders, count: likeCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .like('date_created', `${yesterdayStr}%`)
      .limit(5);

    dateTests.push({
      method: 'LIKE查询',
      pattern: `${yesterdayStr}%`,
      count: likeCount || 0,
      samples: likeOrders?.slice(0, 2)
    });

    // 测试2: 使用范围查询（完整ISO格式）
    const yesterdayStart = new Date(yesterday);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const { data: rangeOrders, count: rangeCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .gte('date_created', yesterdayStart.toISOString())
      .lte('date_created', yesterdayEnd.toISOString())
      .limit(5);

    dateTests.push({
      method: '范围查询（ISO）',
      start: yesterdayStart.toISOString(),
      end: yesterdayEnd.toISOString(),
      count: rangeCount || 0,
      samples: rangeOrders?.slice(0, 2)
    });

    // 5. 获取order_items表的结构
    const { data: orderItemSample } = await supabase
      .from('order_items')
      .select('*')
      .limit(1);

    // 6. 测试JOIN查询
    const { data: joinTest, error: joinError } = await supabase
      .from('orders')
      .select(`
        id,
        order_id,
        status,
        date_created,
        total,
        order_items (
          id,
          sku,
          quantity,
          total
        )
      `)
      .limit(2);

    return NextResponse.json({
      success: true,
      summary: {
        totalOrders: totalCount || 0,
        uniqueStatuses: Array.from(uniqueStatuses),
        latestOrderDate: latestOrders?.[0]?.date_created,
        oldestOrderDate: latestOrders?.[latestOrders.length - 1]?.date_created,
      },
      dateTests,
      samples: {
        latestOrders: latestOrders?.slice(0, 3).map(o => ({
          id: o.id,
          order_id: o.order_id,
          status: o.status,
          date_created: o.date_created,
          site_id: o.site_id,
          total: o.total
        })),
        orderItemStructure: orderItemSample?.[0] ? Object.keys(orderItemSample[0]) : null,
        joinTestResult: joinTest,
        joinError: joinError?.message
      },
      debug: {
        yesterdayDate: yesterdayStr,
        currentTime: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    });

  } catch (error: any) {
    console.error('Simple test API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}