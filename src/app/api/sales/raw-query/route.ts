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

    // 获取昨天的日期范围
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // 使用 RPC 执行原始 SQL 查询（如果 Supabase 支持）
    try {
      // 尝试使用 SQL 函数
      const { data: sqlResult, error: sqlError } = await supabase.rpc('execute_sql', {
        query: `
          SELECT
            COUNT(*) as total_count,
            COUNT(CASE WHEN date_created >= '${yesterday.toISOString()}' AND date_created <= '${yesterdayEnd.toISOString()}' THEN 1 END) as yesterday_count,
            COUNT(DISTINCT status) as distinct_statuses,
            COUNT(DISTINCT site_id) as distinct_sites
          FROM orders
        `
      });

      if (!sqlError) {
        return NextResponse.json({
          success: true,
          method: 'raw_sql',
          result: sqlResult
        });
      }
    } catch (e) {
      // SQL RPC 可能不可用，继续使用常规查询
    }

    // 使用常规的 Supabase 查询
    // 1. 获取所有订单的唯一状态值
    const { data: allOrders } = await supabase
      .from('orders')
      .select('status')
      .limit(1000);

    const uniqueStatuses = new Set<string>();
    if (allOrders) {
      allOrders.forEach(order => {
        if (order.status) uniqueStatuses.add(order.status);
      });
    }

    // 2. 获取前100个订单，看看实际的数据结构
    const { data: sampleOrders } = await supabase
      .from('orders')
      .select('*')
      .order('date_created', { ascending: false })
      .limit(100);

    // 3. 分析日期格式
    let dateAnalysis = {
      formats: new Set<string>(),
      samples: [] as string[]
    };

    if (sampleOrders) {
      sampleOrders.forEach(order => {
        if (order.date_created) {
          const dateStr = order.date_created;
          if (dateStr.includes('T')) {
            dateAnalysis.formats.add('ISO8601');
          } else if (dateStr.includes(' ')) {
            dateAnalysis.formats.add('SQL_DATETIME');
          } else {
            dateAnalysis.formats.add('OTHER');
          }
          if (dateAnalysis.samples.length < 5) {
            dateAnalysis.samples.push(dateStr);
          }
        }
      });
    }

    // 4. 使用不同的日期格式尝试查询昨天的订单
    const dateFormats = [
      {
        name: 'ISO8601',
        start: yesterday.toISOString(),
        end: yesterdayEnd.toISOString()
      },
      {
        name: 'DATE_ONLY',
        start: yesterday.toISOString().split('T')[0],
        end: yesterdayEnd.toISOString().split('T')[0]
      },
      {
        name: 'SQL_DATETIME',
        start: yesterday.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''),
        end: yesterdayEnd.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
      }
    ];

    const formatResults: any = {};
    for (const format of dateFormats) {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('date_created', format.start)
        .lte('date_created', format.end);

      formatResults[format.name] = {
        count: count || 0,
        dateRange: { start: format.start, end: format.end }
      };
    }

    // 5. 直接检查最近的订单日期
    const { data: mostRecent } = await supabase
      .from('orders')
      .select('date_created')
      .order('date_created', { ascending: false })
      .limit(10);

    const { data: oldest } = await supabase
      .from('orders')
      .select('date_created')
      .order('date_created', { ascending: true })
      .limit(10);

    // 6. 尝试文本搜索昨天的日期
    const yesterdayDateStr = yesterday.toISOString().split('T')[0];
    const { data: textSearchResult, count: textSearchCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .like('date_created', `${yesterdayDateStr}%`)
      .limit(5);

    return NextResponse.json({
      success: true,
      analysis: {
        uniqueStatuses: Array.from(uniqueStatuses),
        dateAnalysis: {
          formats: Array.from(dateAnalysis.formats),
          samples: dateAnalysis.samples
        },
        dateFormatTests: formatResults,
        dateRange: {
          mostRecent: mostRecent?.map(o => o.date_created),
          oldest: oldest?.map(o => o.date_created)
        },
        textSearch: {
          searchPattern: `${yesterdayDateStr}%`,
          count: textSearchCount || 0,
          samples: textSearchResult?.map(o => ({
            id: o.id,
            date_created: o.date_created,
            status: o.status
          }))
        },
        targetDates: {
          yesterday: yesterday.toISOString(),
          yesterdayEnd: yesterdayEnd.toISOString(),
          yesterdayLocal: yesterday.toString(),
          yesterdayDateOnly: yesterdayDateStr
        }
      }
    });

  } catch (error: any) {
    console.error('Raw query API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}