import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface QueryParams {
  siteIds?: string[];
  statuses?: string[];
  dateStart: string;
  dateEnd: string;
  compareStart?: string;
  compareEnd?: string;
  groupBy?: 'day' | 'week' | 'month';
}

export async function POST(request: NextRequest) {
  try {
    const body: QueryParams = await request.json();
    const {
      siteIds = [],
      statuses = ['completed', 'processing', 'pending', 'on-hold', 'cancelled', 'refunded', 'failed'],
      dateStart,
      dateEnd,
      compareStart,
      compareEnd,
      groupBy = 'day'
    } = body;

    // 处理日期 - 确保使用正确的UTC时间
    // 如果传入的是日期字符串（YYYY-MM-DD），需要正确处理
    let adjustedDateStart = dateStart;
    let adjustedDateEnd = dateEnd;

    // 如果是短日期格式，补充时间部分
    if (dateStart && dateStart.length === 10) {
      adjustedDateStart = `${dateStart}T00:00:00.000Z`;
    }
    if (dateEnd && dateEnd.length === 10) {
      adjustedDateEnd = `${dateEnd}T23:59:59.999Z`;
    }

    // 添加详细日志
    console.log('[Sales Query] Request params:', {
      siteIds,
      statuses,
      originalDateStart: dateStart,
      originalDateEnd: dateEnd,
      adjustedDateStart,
      adjustedDateEnd,
      siteIdsCount: siteIds.length,
      timestamp: new Date().toISOString()
    });

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

    // 首先检查是否有订单数据
    const { count: totalOrdersCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    console.log('[Sales Query] Total orders in database:', totalOrdersCount);

    // Build query for current period - join with order_items
    // 分页获取所有数据，绕过Supabase的1000条限制
    let allCurrentOrders: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let currentQuery = supabase
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
        .gte('date_created', adjustedDateStart)
        .lte('date_created', adjustedDateEnd)
        .in('status', statuses)
        .range(offset, offset + pageSize - 1)
        .order('date_created', { ascending: false });

      // Filter by sites if specified
      if (siteIds && siteIds.length > 0) {
        currentQuery = currentQuery.in('site_id', siteIds);
      }

      const { data: pageData, error: pageError, count } = await currentQuery;

      if (pageError) {
        console.error('Failed to fetch page:', pageError);
        return NextResponse.json(
          { error: pageError.message || 'Failed to fetch orders' },
          { status: 500 }
        );
      }

      if (pageData && pageData.length > 0) {
        allCurrentOrders = [...allCurrentOrders, ...pageData];
        offset += pageSize;

        // 检查是否还有更多数据
        hasMore = pageData.length === pageSize && offset < 100000; // 最多获取10万条
      } else {
        hasMore = false;
      }

      console.log(`[Sales Query] Fetched page: ${Math.floor(offset / pageSize)}, Records: ${pageData?.length || 0}, Total so far: ${allCurrentOrders.length}`);
    }

    const currentOrders = allCurrentOrders;
    const currentError = null;

    console.log('[Sales Query] Total orders fetched:', currentOrders?.length || 0);

    if (currentError) {
      console.error('Failed to fetch current period orders:', currentError);
      console.error('Query parameters:', {
        dateStart,
        dateEnd,
        statuses,
        siteIds
      });
      return NextResponse.json(
        { error: currentError.message || 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    // 如果没有数据，检查原因
    if (!currentOrders || currentOrders.length === 0) {
      // 检查日期范围内是否有任何订单（不限状态）
      const { data: anyOrders } = await supabase
        .from('orders')
        .select('id, date_created, status, site_id')
        .gte('date_created', dateStart)
        .lte('date_created', dateEnd)
        .limit(5);

      console.log('[Sales Query] Date range check - Any orders in range:', anyOrders?.length || 0);
      if (anyOrders && anyOrders.length > 0) {
        console.log('[Sales Query] Sample orders:', anyOrders);
      }

      // 获取最近的订单查看日期格式
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id, date_created, status, site_id')
        .order('date_created', { ascending: false })
        .limit(3);

      console.log('[Sales Query] Recent orders for date format check:', recentOrders);
    }

    // Build query for comparison period if specified
    let compareOrders: any[] = [];
    if (compareStart && compareEnd) {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let compareQuery = supabase
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
          .gte('date_created', compareStart)
          .lte('date_created', compareEnd)
          .in('status', statuses)
          .range(offset, offset + pageSize - 1)
          .order('date_created', { ascending: false });

        if (siteIds && siteIds.length > 0) {
          compareQuery = compareQuery.in('site_id', siteIds);
        }

        const { data: pageData, error: pageError } = await compareQuery;

        if (pageError) {
          console.error('Failed to fetch compare page:', pageError);
          break;
        }

        if (pageData && pageData.length > 0) {
          compareOrders = [...compareOrders, ...pageData];
          offset += pageSize;
          hasMore = pageData.length === pageSize && offset < 100000;
        } else {
          hasMore = false;
        }
      }

      console.log('[Sales Query] Compare orders fetched:', compareOrders.length);
    }

    // Calculate statistics
    const calculateStats = (orders: any[]) => {
      const stats = {
        totalOrders: orders.length,
        totalRevenue: 0,
        totalQuantity: 0,
        bySite: {} as Record<string, any>,
        bySku: {} as Record<string, any>,
      };

      orders.forEach(order => {
        // Total revenue
        stats.totalRevenue += parseFloat(order.total || 0);

        // By site statistics
        const siteId = order.site_id;
        if (!stats.bySite[siteId]) {
          // We'll need to get site names separately or use site_id as fallback
          stats.bySite[siteId] = {
            orderCount: 0,
            revenue: 0,
            quantity: 0,
            siteName: `Site ${siteId}`, // Will be replaced with actual site name
          };
        }
        stats.bySite[order.site_id].orderCount++;
        stats.bySite[order.site_id].revenue += parseFloat(order.total || 0);

        // Parse order_items for SKU statistics
        const orderItems = order.order_items || [];
        orderItems.forEach((item: any) => {
          const sku = item.sku || `product_${item.product_id}`;
          const quantity = parseInt(item.quantity || 0);

          stats.totalQuantity += quantity;
          stats.bySite[order.site_id].quantity += quantity;

          if (!stats.bySku[sku]) {
            stats.bySku[sku] = {
              sku,
              name: item.name,
              orderCount: 0,
              quantity: 0,
              revenue: 0,
              sites: new Set(),
            };
          }
          stats.bySku[sku].orderCount++;
          stats.bySku[sku].quantity += quantity;
          stats.bySku[sku].revenue += parseFloat(item.total || 0);
          stats.bySku[sku].sites.add(order.site_id);
        });
      });

      // Convert sets to arrays for JSON serialization
      Object.keys(stats.bySku).forEach(sku => {
        stats.bySku[sku].sites = Array.from(stats.bySku[sku].sites);
      });

      return stats;
    };

    // Get site names - 修复：当siteIds为空时，获取所有站点
    let sitesToQuery = siteIds;
    if (!siteIds || siteIds.length === 0) {
      // 如果没有指定站点，获取所有启用的站点
      const { data: allSites } = await supabase
        .from('wc_sites')
        .select('id, name')
        .eq('enabled', true);

      sitesToQuery = allSites?.map(s => s.id) || [];
      console.log('[Sales Query] No sites specified, using all enabled sites:', sitesToQuery.length);
    }

    const { data: sites } = await supabase
      .from('wc_sites')
      .select('id, name')
      .in('id', sitesToQuery.length > 0 ? sitesToQuery : ['dummy-id']); // 使用dummy-id避免空数组问题

    const siteNameMap: Record<string, string> = {};
    if (sites) {
      sites.forEach(site => {
        siteNameMap[site.id] = site.name;
      });
    }

    const currentStats = calculateStats(currentOrders || []);
    const compareStats = compareStart ? calculateStats(compareOrders) : null;

    // Update site names in stats
    if (currentStats && currentStats.bySite) {
      Object.keys(currentStats.bySite).forEach(siteId => {
        currentStats.bySite[siteId].siteName = siteNameMap[siteId] || `Site ${siteId}`;
      });
    }
    if (compareStats && compareStats.bySite) {
      Object.keys(compareStats.bySite).forEach(siteId => {
        compareStats.bySite[siteId].siteName = siteNameMap[siteId] || `Site ${siteId}`;
      });
    }

    // Calculate growth rates if comparison period exists
    let growth = null;
    if (compareStats) {
      growth = {
        orders: compareStats.totalOrders > 0
          ? ((currentStats.totalOrders - compareStats.totalOrders) / compareStats.totalOrders * 100).toFixed(2)
          : null,
        revenue: compareStats.totalRevenue > 0
          ? ((currentStats.totalRevenue - compareStats.totalRevenue) / compareStats.totalRevenue * 100).toFixed(2)
          : null,
        quantity: compareStats.totalQuantity > 0
          ? ((currentStats.totalQuantity - compareStats.totalQuantity) / compareStats.totalQuantity * 100).toFixed(2)
          : null,
      };
    }

    // Group by time period if requested
    let timeSeriesData = null;
    if (groupBy) {
      timeSeriesData = groupOrdersByTime(currentOrders || [], groupBy);
    }

    return NextResponse.json({
      success: true,
      data: {
        current: currentStats,
        compare: compareStats,
        growth,
        timeSeries: timeSeriesData,
        period: {
          current: { start: dateStart, end: dateEnd },
          compare: compareStart ? { start: compareStart, end: compareEnd } : null,
        },
      },
    });

  } catch (error: any) {
    console.error('Sales query API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function groupOrdersByTime(orders: any[], groupBy: 'day' | 'week' | 'month') {
  const groups: Record<string, any> = {};

  orders.forEach(order => {
    const date = new Date(order.date_created);
    let key: string = ''; // 初始化为空字符串，避免TypeScript错误

    switch (groupBy) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        key = date.toISOString().split('T')[0]; // 默认按天
    }

    if (!groups[key]) {
      groups[key] = {
        date: key,
        orders: 0,
        revenue: 0,
        quantity: 0,
      };
    }

    groups[key].orders++;
    groups[key].revenue += parseFloat(order.total || 0);

    const orderItems = order.order_items || [];
    orderItems.forEach((item: any) => {
      groups[key].quantity += parseInt(item.quantity || 0);
    });
  });

  return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
}