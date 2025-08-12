import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { sku, checkType = 'items' } = body;

    console.log(`Checking SKU: ${sku}, Type: ${checkType}`);

    if (checkType === 'items') {
      // 直接查询order_items表
      console.log('Querying order_items table...');
      
      // 尝试多种匹配方式
      const { data: exactMatch, error: exactError } = await supabase
        .from('order_items')
        .select('*')
        .eq('sku', sku)
        .limit(10);

      const { data: upperMatch, error: upperError } = await supabase
        .from('order_items')
        .select('*')
        .eq('sku', sku.toUpperCase())
        .limit(10);

      const { data: lowerMatch, error: lowerError } = await supabase
        .from('order_items')
        .select('*')
        .eq('sku', sku.toLowerCase())
        .limit(10);

      // 使用ilike进行模糊匹配
      const { data: fuzzyMatch, error: fuzzyError } = await supabase
        .from('order_items')
        .select('*')
        .ilike('sku', `%${sku.replace(/-/g, '%')}%`)
        .limit(10);

      return NextResponse.json({
        sku,
        exactMatch: exactMatch?.length || 0,
        exactItems: exactMatch || [],
        upperMatch: upperMatch?.length || 0,
        upperItems: upperMatch || [],
        lowerMatch: lowerMatch?.length || 0,
        lowerItems: lowerMatch || [],
        fuzzyMatch: fuzzyMatch?.length || 0,
        fuzzyItems: fuzzyMatch || [],
        errors: {
          exact: exactError?.message,
          upper: upperError?.message,
          lower: lowerError?.message,
          fuzzy: fuzzyError?.message
        }
      });
    }

    if (checkType === 'similar') {
      // 查找相似的SKU
      const pattern = sku.substring(0, 8); // 取前8个字符
      console.log(`Looking for similar SKUs with pattern: ${pattern}`);
      
      const { data: similarSkus, error } = await supabase
        .from('order_items')
        .select('sku')
        .ilike('sku', `${pattern}%`)
        .limit(50);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // 去重并统计
      const uniqueSkus = new Map<string, number>();
      similarSkus?.forEach(item => {
        const itemSku = item.sku;
        uniqueSkus.set(itemSku, (uniqueSkus.get(itemSku) || 0) + 1);
      });

      const skuList = Array.from(uniqueSkus.entries())
        .map(([sku, count]) => ({ sku, count }))
        .sort((a, b) => b.count - a.count);

      return NextResponse.json({
        pattern,
        totalFound: skuList.length,
        similarSkus: skuList.slice(0, 20), // 返回前20个
        searchedSku: sku
      });
    }

    if (checkType === 'recent') {
      // 检查最近的订单和同步状态
      console.log('Checking recent orders and sync status...');
      
      // 获取最近的订单
      const { data: recentOrders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_id, date_created, site_id, status')
        .order('date_created', { ascending: false })
        .limit(10);

      // 获取最近的同步任务
      const { data: syncTasks, error: syncError } = await supabase
        .from('sync_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      // 统计order_items总数
      const { count: totalItems } = await supabase
        .from('order_items')
        .select('*', { count: 'exact', head: true });

      // 获取不同的SKU数量
      const { data: uniqueSkuSample } = await supabase
        .from('order_items')
        .select('sku')
        .limit(1000);

      const uniqueSkuCount = new Set(uniqueSkuSample?.map(item => item.sku)).size;

      return NextResponse.json({
        recentOrders: recentOrders || [],
        syncTasks: syncTasks || [],
        stats: {
          totalOrderItems: totalItems || 0,
          uniqueSkusSample: uniqueSkuCount,
          lastOrderDate: recentOrders?.[0]?.date_created,
          lastSyncDate: syncTasks?.[0]?.created_at
        },
        errors: {
          orders: ordersError?.message,
          sync: syncError?.message
        }
      });
    }

    // 完整的数据库诊断
    if (checkType === 'full') {
      console.log('Running full database diagnostic...');
      
      // 1. 直接查询该SKU的所有相关数据
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          *,
          orders!inner(
            id,
            order_id,
            date_created,
            status,
            site_id,
            wc_sites!inner(
              id,
              name,
              url
            )
          )
        `)
        .or(`sku.eq.${sku},sku.eq.${sku.toUpperCase()},sku.eq.${sku.toLowerCase()},sku.ilike.%${sku}%`)
        .limit(20);

      // 2. 检查产品表
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .or(`sku.eq.${sku},sku.ilike.%${sku}%`)
        .limit(10);

      // 3. 检查产品变体表
      const { data: variations } = await supabase
        .from('product_variations')
        .select('*')
        .or(`sku.eq.${sku},sku.ilike.%${sku}%`)
        .limit(10);

      return NextResponse.json({
        diagnostic: {
          searchedSku: sku,
          timestamp: new Date().toISOString(),
          results: {
            orderItems: {
              count: orderItems?.length || 0,
              items: orderItems || []
            },
            products: {
              count: products?.length || 0,
              items: products || []
            },
            variations: {
              count: variations?.length || 0,
              items: variations || []
            }
          },
          errors: {
            items: itemsError?.message
          }
        }
      });
    }

    return NextResponse.json({ 
      error: 'Invalid check type' 
    }, { status: 400 });

  } catch (error: any) {
    console.error('Debug check error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}