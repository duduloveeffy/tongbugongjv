import { NextRequest, NextResponse } from 'next/server';

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
      siteUrl, 
      consumerKey, 
      consumerSecret, 
      skus, 
      statuses = 'completed,processing', 
      dateStart, 
      dateEnd 
    } = body;

    if (!siteUrl || !consumerKey || !consumerSecret || !skus || !Array.isArray(skus)) {
      console.error('Missing required parameters:', { siteUrl: !!siteUrl, consumerKey: !!consumerKey, consumerSecret: !!consumerSecret, skus: !!skus, isArray: Array.isArray(skus) });
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (skus.length === 0) {
      return NextResponse.json({ error: 'No SKUs provided' }, { status: 400 });
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = siteUrl.replace(/\/$/, '');
    
    // 获取所有订单数据（优化：只获取必要字段）
    const allOrders = await fetchAllOrders(baseUrl, auth, statuses, dateStart, dateEnd);
    
    // 使用Map进行高效的SKU索引
    const salesDataMap = calculateSalesData(allOrders, skus);
    
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
      totalOrders: allOrders.length,
      processedSkus: skus.length,
      data: result
    });

  } catch (error: any) {
    console.error('Sales analysis API error:', error);
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

function calculateSalesData(orders: any[], targetSkus: string[]): Map<string, SalesData> {
  const salesDataMap = new Map<string, SalesData>();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
    const isWithin30Days = orderDate >= thirtyDaysAgo;
    
    // 记录当前订单中已处理的SKU（避免重复计算订单数）
    const processedSkusInOrder = new Set<string>();
    const processedSkus30d = new Set<string>();
    
    if (order.line_items && Array.isArray(order.line_items)) {
      order.line_items.forEach((lineItem: any) => {
        const sku = lineItem.sku;
        
        // 只处理目标SKU，提高效率
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
            
            // 30天内的数据
            if (isWithin30Days) {
              salesData.salesQuantity30d += quantity;
              
              // 30天订单数（每个订单中的SKU只计算一次）
              if (!processedSkus30d.has(sku)) {
                salesData.orderCount30d += 1;
                processedSkus30d.add(sku);
              }
            }
          }
        }
      });
    }
  });

  return salesDataMap;
}