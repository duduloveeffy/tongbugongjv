import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET: 从Supabase获取订单数据用于前端分析
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const siteIds = searchParams.get('siteIds')?.split(',').filter(Boolean);
    const statuses = searchParams.get('statuses')?.split(',').filter(Boolean) || ['completed', 'processing'];
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '1000');

    // 构建查询
    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items!inner(
          id,
          item_id,
          sku,
          name,
          quantity,
          price,
          total,
          subtotal,
          total_tax,
          tax_class
        ),
        wc_sites!inner(
          id,
          name,
          url
        )
      `)
      .in('status', statuses)
      .order('date_created', { ascending: false })
      .limit(limit);

    // 添加站点筛选
    if (siteIds && siteIds.length > 0) {
      query = query.in('site_id', siteIds);
    }

    // 添加日期筛选
    if (startDate) {
      query = query.gte('date_created', startDate);
    }
    if (endDate) {
      query = query.lte('date_created', endDate);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error('Failed to fetch orders from Supabase:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch orders',
        details: error.message 
      }, { status: 500 });
    }

    // 转换为前端期望的格式
    const formattedOrders = orders?.map(order => ({
      id: order.order_id,
      status: order.status,
      date_created: order.date_created,
      date_completed: order.date_completed,
      total: order.total?.toString() || '0',
      currency: order.currency || 'EUR',
      line_items: order.order_items?.map((item: any) => ({
        id: item.item_id,
        name: item.name,
        quantity: item.quantity || 0,
        price: item.price?.toString() || '0',
        total: item.total?.toString() || '0',
        sku: item.sku || '',
      })) || [],
      billing: {
        first_name: order.billing_first_name || '',
        last_name: order.billing_last_name || '',
        email: order.billing_email || '',
      },
      site_info: {
        id: order.site_id,
        name: order.wc_sites?.name || 'Unknown Site',
        url: order.wc_sites?.url || '',
      }
    })) || [];

    // 计算统计信息
    const stats = {
      totalOrders: formattedOrders.length,
      totalRevenue: formattedOrders.reduce((sum, order) => sum + parseFloat(order.total), 0),
      ordersBySite: {} as Record<string, number>,
      ordersByStatus: {} as Record<string, number>,
    };

    // 按站点统计
    formattedOrders.forEach(order => {
      const siteName = order.site_info.name;
      stats.ordersBySite[siteName] = (stats.ordersBySite[siteName] || 0) + 1;
      stats.ordersByStatus[order.status] = (stats.ordersByStatus[order.status] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      orders: formattedOrders,
      stats,
      count: formattedOrders.length,
    });

  } catch (error: any) {
    console.error('Supabase orders API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      success: false 
    }, { status: 500 });
  }
}

// POST: 从选定站点获取最新订单数据
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { siteIds, daysBack = 30 } = body;

    if (!siteIds || siteIds.length === 0) {
      // 如果没有指定站点，获取所有启用的站点
      const { data: sites } = await supabase
        .from('wc_sites')
        .select('id')
        .eq('enabled', true);
      
      if (sites) {
        siteIds.push(...sites.map(s => s.id));
      }
    }

    // 计算日期范围
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // 获取订单数据
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(
          id,
          item_id,
          sku,
          name,
          quantity,
          price,
          total,
          subtotal,
          total_tax
        ),
        wc_sites(
          id,
          name,
          url
        )
      `)
      .in('site_id', siteIds)
      .gte('date_created', startDate.toISOString())
      .lte('date_created', endDate.toISOString())
      .in('status', ['completed', 'processing', 'pending'])
      .order('date_created', { ascending: false });

    if (error) {
      console.error('Failed to fetch orders:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch orders',
        details: error.message 
      }, { status: 500 });
    }

    // 转换格式
    const formattedOrders = orders?.map(order => ({
      id: order.order_id,
      status: order.status,
      date_created: order.date_created,
      date_completed: order.date_completed,
      total: order.total?.toString() || '0',
      currency: order.currency || 'EUR',
      line_items: order.order_items?.map((item: any) => ({
        id: item.item_id,
        name: item.name,
        quantity: item.quantity || 0,
        price: item.price?.toString() || '0',
        total: item.total?.toString() || '0',
        sku: item.sku || '',
      })) || [],
      billing: {
        first_name: order.billing_first_name || '',
        last_name: order.billing_last_name || '',
        email: order.billing_email || '',
      },
    })) || [];

    return NextResponse.json({
      success: true,
      orders: formattedOrders,
      count: formattedOrders.length,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      }
    });

  } catch (error: any) {
    console.error('Load orders error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      success: false 
    }, { status: 500 });
  }
}