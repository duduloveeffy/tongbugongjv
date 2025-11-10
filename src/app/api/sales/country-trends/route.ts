import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { createH3YunClient } from '@/lib/h3yun/client';
import { buildSkuMappingCache } from '@/lib/h3yun/sku-mapping';
import type { SkuMappingCache } from '@/lib/h3yun/types';
import { h3yunSchemaConfig } from '@/config/h3yun.config';
import { env } from '@/env';
import { getVapsoloSiteType } from '@/lib/vapsolo-utils';

interface QueryParams {
  country: string;
  siteIds?: string[];
  statuses?: string[];
  dateStart: string;
  dateEnd: string;
  groupBy?: 'day' | 'week' | 'month';
}

export async function POST(request: NextRequest) {
  try {
    const body: QueryParams = await request.json();
    const {
      country,
      siteIds = [],
      statuses = ['completed', 'processing'],
      dateStart,
      dateEnd,
      groupBy = 'day'
    } = body;

    if (!country) {
      return NextResponse.json(
        { error: 'Country code is required' },
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

    console.log('[Country Trends] Querying:', {
      country,
      dateStart: adjustedDateStart,
      dateEnd: adjustedDateEnd,
      groupBy,
      siteIds,
      statuses
    });

    // 分页获取该国家的所有订单
    let allOrders: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('orders')
        .select(`
          *,
          wc_sites!inner (
            id,
            name
          ),
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

      // 筛选国家（shipping_country 或 billing_country）
      // 注意：Supabase 的 or 查询需要特殊处理
      query = query.or(`shipping_country.eq.${country},billing_country.eq.${country}`);

      // 筛选站点
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

      if (pageData && pageData.length > 0) {
        allOrders = [...allOrders, ...pageData];
        offset += pageSize;
        hasMore = pageData.length === pageSize;
      } else {
        hasMore = false;
      }

      console.log(`[Country Trends] Fetched page: ${Math.floor(offset / pageSize)}, Records: ${pageData?.length || 0}, Total: ${allOrders.length}`);
    }

    console.log('[Country Trends] Total orders fetched:', allOrders.length);

    // 加载SKU映射（可选功能，失败不影响查询）
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
        console.log('[Country Trends] 尝试加载SKU映射...');
        const client = createH3YunClient(h3yunConfig);
        const mappings = await client.fetchSkuMappings(1000);
        skuMappingCache = buildSkuMappingCache(mappings);
        console.log(`[Country Trends] ✅ SKU映射已加载: ${skuMappingCache.wooToH3.size} 个WooCommerce SKU`);
      } else {
        console.log('[Country Trends] 氚云配置未设置，跳过SKU映射');
      }
    } catch (error) {
      console.warn('[Country Trends] ⚠️ SKU映射加载失败，将使用原始数量:', error);
    }

    // 按时间维度分组聚合
    const trends = groupOrdersByTime(allOrders, groupBy, skuMappingCache);

    return NextResponse.json({
      success: true,
      data: {
        country,
        countryName: country,
        trends,
        totalOrders: allOrders.length,
      },
    });

  } catch (error: any) {
    console.error('Country trends API error:', error);
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

      // 步骤1: 应用批发站点换算（如果是批发站点，1盒=10支）
      let quantityAfterWholesale = originalQuantity;
      const siteName = order.wc_sites?.name || '';
      const siteType = getVapsoloSiteType(siteName);
      if (siteType === 'wholesale') {
        quantityAfterWholesale = originalQuantity * 10;
      }

      // 步骤2: 应用SKU映射（套装产品映射）
      let actualQuantity = quantityAfterWholesale;
      if (mappingCache) {
        const mappings = mappingCache.wooToH3.get(sku);
        if (mappings && mappings.length > 0) {
          // Sum all quantity multipliers (one-to-many support)
          const totalMultiplier = mappings.reduce((sum, m) => sum + m.quantity, 0);
          actualQuantity = quantityAfterWholesale * totalMultiplier;
        }
      }

      groups[key].quantity += actualQuantity;
    });
  });

  return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
}
