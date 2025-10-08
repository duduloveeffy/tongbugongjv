import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { extractSpu, type SpuExtractionMode, type SpuExtractionConfig } from '@/lib/spu-utils';

interface QueryParams {
  spu: string;
  spuMode: SpuExtractionMode;
  siteIds?: string[] | string | number;
  statuses?: string[];
  dateStart: string;
  dateEnd: string;
  groupBy?: 'day' | 'week' | 'month';
  nameMapping?: Record<string, string>;
}

export async function POST(request: NextRequest) {
  try {
    const body: QueryParams = await request.json();
    let {
      spu,
      spuMode,
      siteIds = [],
      statuses = ['completed', 'processing'],
      dateStart,
      dateEnd,
      groupBy = 'day',
      nameMapping
    } = body;

    // 修复 siteIds 参数类型问题 - 确保始终是数组
    if (!Array.isArray(siteIds)) {
      siteIds = siteIds ? [String(siteIds)] : [];
    }

    // 构建 SPU 提取配置
    const spuConfig: SpuExtractionConfig = {
      mode: spuMode,
      nameMapping: nameMapping || {},
    };

    if (!spu) {
      return NextResponse.json(
        { error: 'SPU name is required' },
        { status: 400 }
      );
    }

    if (!dateStart || !dateEnd) {
      return NextResponse.json(
        { error: 'Date range is required' },
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

    // 处理日期格式
    let adjustedDateStart = dateStart;
    let adjustedDateEnd = dateEnd;

    if (dateStart && dateStart.length === 10) {
      adjustedDateStart = `${dateStart}T00:00:00.000Z`;
    }
    if (dateEnd && dateEnd.length === 10) {
      adjustedDateEnd = `${dateEnd}T23:59:59.999Z`;
    }

    console.log('[SPU Trends] Querying:', {
      spu,
      spuMode,
      dateStart: adjustedDateStart,
      dateEnd: adjustedDateEnd,
      groupBy,
      siteIds: siteIds,
      siteIdsCount: siteIds.length,
      statuses,
      hasNameMapping: !!nameMapping,
      nameMappingKeys: nameMapping ? Object.keys(nameMapping).length : 0,
    });

    // 分页获取订单数据
    let allOrders: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
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
        `)
        .gte('date_created', adjustedDateStart)
        .lte('date_created', adjustedDateEnd)
        .in('status', statuses)
        .range(offset, offset + pageSize - 1)
        .order('date_created', { ascending: true });

      if (siteIds && siteIds.length > 0) {
        query = query.in('site_id', siteIds);
      }

      const { data: pageData, error: pageError } = await query;

      if (pageError) {
        console.error('Failed to fetch orders:', pageError);
        return NextResponse.json(
          { error: pageError.message || 'Failed to fetch orders' },
          { status: 500 }
        );
      }

      let filteredOrdersCount = 0;

      if (pageData && pageData.length > 0) {
        // 过滤：只保留包含该SPU的订单
        const filteredOrders = pageData.filter(order => {
          return order.order_items?.some((item: any) => {
            const itemSpu = extractSpu(item.name || 'Unknown', spuConfig, item.sku);
            return itemSpu === spu;
          });
        });

        filteredOrdersCount = filteredOrders.length;

        if (filteredOrders.length > 0) {
          allOrders = [...allOrders, ...filteredOrders];
        }

        offset += pageSize;
        hasMore = pageData.length === pageSize;
      } else {
        hasMore = false;
      }

      console.log(`[SPU Trends] Fetched page: ${Math.floor(offset / pageSize)}, Filtered: ${filteredOrdersCount}, Total: ${allOrders.length}`);
    }

    console.log('[SPU Trends] Total orders with this SPU:', allOrders.length);

    // 按时间维度分组聚合
    const trends = groupOrdersByTime(allOrders, groupBy, spu, spuConfig);

    return NextResponse.json({
      success: true,
      data: {
        spu,
        spuMode,
        trends,
        totalOrders: allOrders.length,
      },
    });

  } catch (error: any) {
    console.error('SPU trends API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function groupOrdersByTime(
  orders: any[],
  groupBy: 'day' | 'week' | 'month',
  targetSpu: string,
  spuConfig: SpuExtractionConfig
) {
  const groups: Record<string, any> = {};

  orders.forEach(order => {
    const date = new Date(order.date_created);
    let key: string;

    switch (groupBy) {
      case 'day':
        key = date.toISOString().split('T')[0] || '';
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0] || '';
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        key = date.toISOString().split('T')[0] || '';
    }

    if (!groups[key]) {
      groups[key] = {
        date: key,
        orders: 0,
        quantity: 0,
        revenue: 0,
      };
    }

    // 检查该订单是否已计入（避免重复计数）
    // 每个订单只计数一次，但累加该订单中所有属于该SPU的商品
    let orderCounted = false;

    const orderItems = order.order_items || [];
    orderItems.forEach((item: any) => {
      const itemSpu = extractSpu(item.name || 'Unknown', spuConfig, item.sku);
      if (itemSpu === targetSpu) {
        if (!orderCounted) {
          groups[key].orders++;
          orderCounted = true;
        }
        groups[key].quantity += parseInt(item.quantity || 0);
        groups[key].revenue += parseFloat(item.total || 0);
      }
    });
  });

  return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
}
