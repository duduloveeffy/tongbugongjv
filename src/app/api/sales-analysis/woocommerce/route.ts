import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface SalesData {
  orderCount: number;
  salesQuantity: number;
  orderCount30d: number;
  salesQuantity30d: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      siteId,  // 从Supabase获取站点配置
      skus, 
      statuses = 'completed,processing', 
      dateStart, 
      dateEnd,
      daysBack = 30,
      // 直接提供的凭证（向后兼容）
      siteUrl,
      consumerKey,
      consumerSecret
    } = body;

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ error: 'No SKUs provided' }, { status: 400 });
    }

    let apiUrl: string;
    let apiKey: string;
    let apiSecret: string;
    let siteName = 'WooCommerce Site';

    // 如果提供了siteId，从Supabase获取站点配置
    if (siteId) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        return NextResponse.json({ 
          error: 'Supabase not configured' 
        }, { status: 503 });
      }

      const { data: site, error } = await supabase
        .from('wc_sites')
        .select('*')
        .eq('id', siteId)
        .single();

      if (error || !site) {
        return NextResponse.json({ 
          error: 'Site not found' 
        }, { status: 404 });
      }

      if (!site.enabled) {
        return NextResponse.json({ 
          error: 'Site is disabled' 
        }, { status: 400 });
      }

      apiUrl = site.url;
      apiKey = site.api_key;
      apiSecret = site.api_secret;
      siteName = site.name;
    } 
    // 向后兼容：直接使用提供的凭证
    else if (siteUrl && consumerKey && consumerSecret) {
      apiUrl = siteUrl;
      apiKey = consumerKey;
      apiSecret = consumerSecret;
    } else {
      return NextResponse.json({ 
        error: 'Missing site credentials' 
      }, { status: 400 });
    }

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const baseUrl = apiUrl.replace(/\/$/, '');
    
    // 获取所有订单数据
    const allOrders = await fetchAllOrders(baseUrl, auth, statuses, dateStart, dateEnd);
    
    // 使用Map进行高效的SKU索引
    const salesDataMap = calculateSalesData(allOrders, skus, daysBack);
    
    // 转换为响应格式
    const result: Record<string, SalesData> = {};
    skus.forEach((sku: string) => {
      result[sku] = salesDataMap.get(sku) || {
        orderCount: 0,
        salesQuantity: 0,
        orderCount30d: 0,
        salesQuantity30d: 0,
      };
    });

    return NextResponse.json({
      success: true,
      source: 'woocommerce',
      siteName,
      siteId,
      totalOrders: allOrders.length,
      processedSkus: skus.length,
      data: result
    });

  } catch (error: any) {
    console.error('WooCommerce sales analysis error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      success: false 
    }, { status: 500 });
  }
}

// GET: 获取可用的WooCommerce站点列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    // 获取所有启用的站点
    const { data: sites, error } = await supabase
      .from('wc_sites')
      .select('id, name, url, enabled, last_sync_at')
      .eq('enabled', true)
      .order('name');

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to fetch sites',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sites: sites || []
    });

  } catch (error: any) {
    console.error('Get sites error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      success: false 
    }, { status: 500 });
  }
}

async function fetchAllOrders(
  baseUrl: string, 
  auth: string, 
  statuses: string, 
  dateStart?: string, 
  dateEnd?: string
): Promise<any[]> {
  let allOrders: any[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams();
    params.append('status', statuses);
    params.append('per_page', perPage.toString());
    params.append('page', page.toString());
    params.append('orderby', 'date');
    params.append('order', 'desc');
    
    // 只请求必要的字段，减少数据传输
    params.append('_fields', 'id,date_created,line_items');
    
    if (dateStart) {
      params.append('after', dateStart);
    }
    if (dateEnd) {
      params.append('before', dateEnd);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(`${baseUrl}/wp-json/wc/v3/orders?${params.toString()}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`WooCommerce API request failed: ${response.status}`);
      }

      const orders = await response.json();
      allOrders = allOrders.concat(orders);
      
      // 检查是否还有更多数据
      if (orders.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
      
      // 安全限制：最多获取100页数据
      if (page > 100) {
        console.warn('达到最大页数限制，停止获取更多订单数据');
        break;
      }

      // 添加小延迟避免速率限制
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout - WooCommerce API took too long to respond');
      } else {
        throw fetchError;
      }
    }
  }

  return allOrders;
}

function calculateSalesData(
  orders: any[], 
  targetSkus: string[],
  daysBack: number = 30
): Map<string, SalesData> {
  const salesDataMap = new Map<string, SalesData>();
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);

  // 初始化销量数据
  targetSkus.forEach(sku => {
    salesDataMap.set(sku, {
      orderCount: 0,
      salesQuantity: 0,
      orderCount30d: 0,
      salesQuantity30d: 0,
    });
  });

  // 使用Set提高SKU查找效率
  const targetSkuSet = new Set(targetSkus);

  // 遍历订单进行统计
  orders.forEach((order: any) => {
    const orderDate = new Date(order.date_created);
    const isWithinPeriod = orderDate >= daysAgo;
    
    // 记录当前订单中已处理的SKU
    const processedSkusInOrder = new Set<string>();
    const processedSkusPeriod = new Set<string>();
    
    if (order.line_items && Array.isArray(order.line_items)) {
      order.line_items.forEach((lineItem: any) => {
        const sku = lineItem.sku;
        
        // 只处理目标SKU
        if (sku && targetSkuSet.has(sku)) {
          const salesData = salesDataMap.get(sku);
          if (salesData) {
            const quantity = Number(lineItem.quantity) || 0;
            
            // 累加销售数量
            salesData.salesQuantity += quantity;
            
            // 计算订单数（每个订单中的SKU只计算一次）
            if (!processedSkusInOrder.has(sku)) {
              salesData.orderCount += 1;
              processedSkusInOrder.add(sku);
            }
            
            // 指定时间段内的数据
            if (isWithinPeriod) {
              salesData.salesQuantity30d += quantity;
              
              if (!processedSkusPeriod.has(sku)) {
                salesData.orderCount30d += 1;
                processedSkusPeriod.add(sku);
              }
            }
          }
        }
      });
    }
  });

  return salesDataMap;
}