import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteUrl = searchParams.get('siteUrl');
  const consumerKey = searchParams.get('consumerKey');
  const consumerSecret = searchParams.get('consumerSecret');
  const statuses = searchParams.get('statuses');
  const dateStart = searchParams.get('dateStart');
  const dateEnd = searchParams.get('dateEnd');

  if (!siteUrl || !consumerKey || !consumerSecret || !statuses) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  try {
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = siteUrl.replace(/\/$/, '');
    
    // 分页获取所有订单数据
    let allOrders: any[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;
    
    while (hasMore) {
      // 构建查询参数
      const params = new URLSearchParams();
      params.append('status', statuses);
      params.append('per_page', perPage.toString());
      params.append('page', page.toString());
      params.append('orderby', 'date');
      params.append('order', 'desc');
      
      if (dateStart) {
        params.append('after', dateStart);
      }
      if (dateEnd) {
        params.append('before', dateEnd);
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      let orders: any[] = [];
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
          return NextResponse.json({ error: 'WooCommerce API request failed' }, { status: response.status });
        }

        orders = await response.json();
        allOrders = allOrders.concat(orders);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // Handle specific error types
        if (fetchError.name === 'AbortError') {
          console.error('Request timeout after 30 seconds');
          return NextResponse.json({ error: 'Request timeout - WooCommerce API took too long to respond' }, { status: 504 });
        } else if (fetchError.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
          console.error('Connection timeout to WooCommerce site');
          return NextResponse.json({ error: 'Connection timeout - Unable to connect to WooCommerce site' }, { status: 504 });
        } else {
          console.error('Fetch error:', fetchError);
          throw fetchError; // Re-throw to be caught by outer try-catch
        }
      }
      
      // 检查是否还有更多数据
      if (orders.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
      
      // 安全限制：最多获取100页数据（10000个订单）
      if (page > 100) {
        console.warn('达到最大页数限制，停止获取更多订单数据');
        break;
      }
    }
    
    console.log(`成功获取 ${allOrders.length} 个订单数据`);
    return NextResponse.json(allOrders);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 