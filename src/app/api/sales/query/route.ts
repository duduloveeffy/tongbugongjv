import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { createH3YunClient } from '@/lib/h3yun/client';
import { buildSkuMappingCache } from '@/lib/h3yun/sku-mapping';
import type { SkuMappingCache } from '@/lib/h3yun/types';
import { h3yunSchemaConfig } from '@/config/h3yun.config';
import { env } from '@/env';

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

    // 尝试获取SKU映射数据（可选功能，失败不影响查询）
    let skuMappingCache: SkuMappingCache | null = null;
    try {
      const h3yunConfig = {
        engineCode: env.H3YUN_ENGINE_CODE,
        engineSecret: env.H3YUN_ENGINE_SECRET,
        schemaCode: h3yunSchemaConfig.inventorySchemaCode,
        warehouseSchemaCode: h3yunSchemaConfig.warehouseSchemaCode,
        skuMappingSchemaCode: h3yunSchemaConfig.skuMappingSchemaCode,
      };

      if (h3yunConfig.engineCode && h3yunConfig.engineSecret) {
        console.log('[Sales Query] 尝试加载SKU映射...');
        const client = createH3YunClient(h3yunConfig);
        const mappings = await client.fetchSkuMappings(1000); // 获取最多1000条映射
        skuMappingCache = buildSkuMappingCache(mappings);
        console.log(`[Sales Query] ✅ SKU映射已加载: ${skuMappingCache.wooToH3.size} 个WooCommerce SKU`);
      } else {
        console.log('[Sales Query] 氚云配置未设置，跳过SKU映射');
      }
    } catch (error) {
      console.warn('[Sales Query] ⚠️ SKU映射加载失败，将使用原始数量:', error);
      // 继续执行，不影响主流程
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
      // 对比期也需要进行UTC时间调整，确保与当前期使用相同的时间范围逻辑
      let adjustedCompareStart = compareStart;
      let adjustedCompareEnd = compareEnd;

      if (compareStart && compareStart.length === 10) {
        adjustedCompareStart = `${compareStart}T00:00:00.000Z`;
      }
      if (compareEnd && compareEnd.length === 10) {
        adjustedCompareEnd = `${compareEnd}T23:59:59.999Z`;
      }

      console.log('[Sales Query] Compare period adjusted:', {
        originalCompareStart: compareStart,
        originalCompareEnd: compareEnd,
        adjustedCompareStart,
        adjustedCompareEnd,
      });

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
          .gte('date_created', adjustedCompareStart)
          .lte('date_created', adjustedCompareEnd)
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

    // Calculate statistics with SKU mapping support
    const calculateStats = (orders: any[], mappingCache: SkuMappingCache | null = null) => {
      const stats = {
        totalOrders: orders.length,
        totalRevenue: 0,
        totalQuantity: 0,
        bySite: {} as Record<string, any>,
        bySku: {} as Record<string, any>,
        byCountry: {} as Record<string, any>,
      };

      orders.forEach(order => {
        // Total revenue
        stats.totalRevenue += parseFloat(order.total || 0);

        // Determine country (shipping_country or billing_country as fallback)
        const country = (order.shipping_country || order.billing_country || 'UNKNOWN').toUpperCase().trim();

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

        // By country statistics
        if (!stats.byCountry[country]) {
          stats.byCountry[country] = {
            country,
            orderCount: 0,
            revenue: 0,
            quantity: 0,
            sites: new Set<string>(),
            skus: new Set<string>(),
          };
        }
        stats.byCountry[country].orderCount++;
        stats.byCountry[country].revenue += parseFloat(order.total || 0);
        stats.byCountry[country].sites.add(order.site_id);

        // Parse order_items for SKU statistics
        const orderItems = order.order_items || [];
        orderItems.forEach((item: any) => {
          const sku = item.sku || `product_${item.product_id}`;
          const originalQuantity = parseInt(item.quantity || 0);

          // Apply SKU mapping if available
          let actualQuantity = originalQuantity;
          if (mappingCache) {
            const mappings = mappingCache.wooToH3.get(sku);
            if (mappings && mappings.length > 0) {
              // Sum all quantity multipliers (one-to-many support)
              const totalMultiplier = mappings.reduce((sum, m) => sum + m.quantity, 0);
              actualQuantity = originalQuantity * totalMultiplier;

              // Log first few mappings for debugging
              if (mappings.length > 0 && stats.totalQuantity === 0) {
                console.log(`[Sales Query] 🔄 SKU映射示例: ${sku} × ${originalQuantity} → ${actualQuantity} (倍数: ${totalMultiplier})`);
              }
            }
          }

          // Use actualQuantity for totals, sites, countries
          stats.totalQuantity += actualQuantity;
          stats.bySite[order.site_id].quantity += actualQuantity;
          stats.byCountry[country].quantity += actualQuantity;
          stats.byCountry[country].skus.add(sku);

          // Use originalQuantity for bySku (preserve bundle product analysis)
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
          stats.bySku[sku].quantity += originalQuantity; // Keep original for bundle analysis
          stats.bySku[sku].revenue += parseFloat(item.total || 0);
          stats.bySku[sku].sites.add(order.site_id);
        });
      });

      // Convert sets to arrays for JSON serialization
      Object.keys(stats.bySku).forEach(sku => {
        stats.bySku[sku].sites = Array.from(stats.bySku[sku].sites);
      });

      Object.keys(stats.byCountry).forEach(country => {
        stats.byCountry[country].sites = Array.from(stats.byCountry[country].sites);
        stats.byCountry[country].skus = Array.from(stats.byCountry[country].skus);
        stats.byCountry[country].siteCount = stats.byCountry[country].sites.length;
        stats.byCountry[country].skuCount = stats.byCountry[country].skus.length;
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

    const currentStats = calculateStats(currentOrders || [], skuMappingCache);
    const compareStats = compareStart ? calculateStats(compareOrders, skuMappingCache) : null;

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
      if (compareStart && compareEnd) {
        // 当有对比期时，生成包含两期数据的时间序列
        timeSeriesData = groupOrdersByTimeWithCompare(
          currentOrders || [],
          compareOrders,
          groupBy,
          dateStart,
          dateEnd,
          compareStart,
          compareEnd,
          skuMappingCache
        );
      } else {
        // 没有对比期时，只显示当前期数据
        timeSeriesData = groupOrdersByTime(currentOrders || [], groupBy, skuMappingCache);
      }
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

function groupOrdersByTime(orders: any[], groupBy: 'day' | 'week' | 'month', mappingCache: SkuMappingCache | null = null) {
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
      const sku = item.sku || `product_${item.product_id}`;
      const originalQuantity = parseInt(item.quantity || 0);

      // Apply SKU mapping if available
      let actualQuantity = originalQuantity;
      if (mappingCache) {
        const mappings = mappingCache.wooToH3.get(sku);
        if (mappings && mappings.length > 0) {
          const totalMultiplier = mappings.reduce((sum, m) => sum + m.quantity, 0);
          actualQuantity = originalQuantity * totalMultiplier;
        }
      }

      groups[key].quantity += actualQuantity;
    });
  });

  return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
}

function groupOrdersByTimeWithCompare(
  currentOrders: any[],
  compareOrders: any[],
  groupBy: 'day' | 'week' | 'month',
  currentStart: string,
  currentEnd: string,
  compareStart: string,
  compareEnd: string,
  mappingCache: SkuMappingCache | null = null
) {
  const getDateKey = (date: Date, groupBy: 'day' | 'week' | 'month'): string => {
    switch (groupBy) {
      case 'day':
        return date.toISOString().split('T')[0];
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().split('T')[0];
      case 'month':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      default:
        return date.toISOString().split('T')[0];
    }
  };

  // 计算两个日期之间的天数差（用于按相对位置匹配）
  const getDayOffset = (dateStr: string, baseDate: string): number => {
    const date = new Date(dateStr);
    const base = new Date(baseDate);
    return Math.floor((date.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  };

  const aggregateOrdersWithOffset = (orders: any[], baseDate: string) => {
    const groups: Record<number, { date: string; orders: number; revenue: number; quantity: number }> = {};

    orders.forEach(order => {
      const date = new Date(order.date_created);
      const dateKey = getDateKey(date, groupBy);
      const dayOffset = getDayOffset(dateKey, baseDate);

      if (!groups[dayOffset]) {
        groups[dayOffset] = {
          date: dateKey,
          orders: 0,
          revenue: 0,
          quantity: 0,
        };
      }

      groups[dayOffset].orders++;
      groups[dayOffset].revenue += parseFloat(order.total || 0);

      const orderItems = order.order_items || [];
      orderItems.forEach((item: any) => {
        if (groups[dayOffset]) {
          const sku = item.sku || `product_${item.product_id}`;
          const originalQuantity = parseInt(item.quantity || 0);

          // Apply SKU mapping if available
          let actualQuantity = originalQuantity;
          if (mappingCache) {
            const mappings = mappingCache.wooToH3.get(sku);
            if (mappings && mappings.length > 0) {
              const totalMultiplier = mappings.reduce((sum, m) => sum + m.quantity, 0);
              actualQuantity = originalQuantity * totalMultiplier;
            }
          }

          groups[dayOffset].quantity += actualQuantity;
        }
      });
    });

    return groups;
  };

  // 按相对天数偏移聚合数据
  const currentGroups = aggregateOrdersWithOffset(currentOrders, currentStart);
  const compareGroups = aggregateOrdersWithOffset(compareOrders, compareStart);

  // 获取所有当前期的偏移量，按顺序排列
  const offsets = Object.keys(currentGroups).map(Number).sort((a, b) => a - b);

  const result = offsets.map(offset => {
    const current = currentGroups[offset] || { date: '', orders: 0, revenue: 0, quantity: 0 };
    const compare = compareGroups[offset] || { date: '', orders: 0, revenue: 0, quantity: 0 };

    // 计算增长率
    const calculateGrowth = (currentVal: number, compareVal: number) => {
      if (!compareVal || compareVal === 0) return null;
      return ((currentVal - compareVal) / compareVal * 100).toFixed(1);
    };

    return {
      date: current.date, // 使用当前期的日期显示
      current: {
        orders: current.orders,
        revenue: current.revenue,
        quantity: current.quantity,
      },
      compare: {
        orders: compare.orders,
        revenue: compare.revenue,
        quantity: compare.quantity,
      },
      growth: {
        orders: calculateGrowth(current.orders, compare.orders),
        revenue: calculateGrowth(current.revenue, compare.revenue),
        quantity: calculateGrowth(current.quantity, compare.quantity),
      },
    };
  });

  return result;
}