import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { cacheAside, CACHE_TTL, generateCacheKey } from '@/lib/redis-cache';

interface SkuTrendRequest {
  sku: string;
  siteIds?: string[];
  period?: 'day' | 'week' | 'month';
  daysBack?: number;
}

interface TrendDataPoint {
  period_date: string;
  period_label: string;
  order_count: number;
  sales_quantity: number;
  revenue: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: SkuTrendRequest = await request.json();
    const { sku, siteIds, period = 'day', daysBack = 30 } = body;

    if (!sku) {
      return NextResponse.json({ 
        error: 'SKU is required' 
      }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Database not configured' 
      }, { status: 503 });
    }

    // 生成缓存键
    const cacheKey = generateCacheKey(
      'trends:sku',
      sku,
      period,
      String(daysBack),
      siteIds?.join(',') || 'all'
    );

    // 使用 Cache-Aside 模式获取数据
    const trendData = await cacheAside<TrendDataPoint[]>(
      cacheKey,
      async () => {
        const { data, error } = await supabase.rpc('get_sku_sales_trends', {
          p_sku: sku,
          p_site_ids: siteIds || null,
          p_period: period,
          p_days_back: daysBack,
        });

        if (error) throw error;
        return data || [];
      },
      CACHE_TTL.SALES // 6小时缓存
    );

    // 计算统计信息
    const stats = calculateStats(trendData);

    return NextResponse.json({
      success: true,
      data: {
        sku,
        period,
        daysBack,
        trends: trendData,
        stats,
      },
    });

  } catch (error: any) {
    console.error('SKU trends API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to fetch SKU trends' 
    }, { status: 500 });
  }
}

// GET: 获取SKU的品类信息和排名
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sku = searchParams.get('sku');
    const siteIds = searchParams.get('siteIds')?.split(',');

    if (!sku) {
      return NextResponse.json({ 
        error: 'SKU is required' 
      }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Database not configured' 
      }, { status: 503 });
    }

    // 获取SKU的品类信息
    const { data: categoryData, error: categoryError } = await supabase
      .from('product_categories')
      .select('category_level1, category_level2, category_level3')
      .eq('sku', sku)
      .limit(1)
      .single();

    if (categoryError && categoryError.code !== 'PGRST116') {
      throw categoryError;
    }

    let rankInfo = null;
    if (categoryData?.category_level1) {
      // 获取SKU在品类中的排名
      const { data: rankData, error: rankError } = await supabase.rpc(
        'get_sku_category_rank',
        {
          p_sku: sku,
          p_category: categoryData.category_level1,
          p_site_ids: siteIds || null,
          p_days_back: 30,
        }
      );

      if (!rankError && rankData && rankData.length > 0) {
        rankInfo = rankData[0];
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sku,
        category: categoryData || null,
        rank: rankInfo,
      },
    });

  } catch (error: any) {
    console.error('SKU info API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to fetch SKU info' 
    }, { status: 500 });
  }
}

// 计算趋势统计信息
function calculateStats(data: TrendDataPoint[]) {
  if (!data || data.length === 0) {
    return {
      totalOrders: 0,
      totalSales: 0,
      totalRevenue: 0,
      avgDailySales: 0,
      trend: 'stable',
    };
  }

  const totalOrders = data.reduce((sum, d) => sum + d.order_count, 0);
  const totalSales = data.reduce((sum, d) => sum + d.sales_quantity, 0);
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const avgDailySales = totalSales / data.length;

  // 计算趋势（比较前半部分和后半部分）
  const midPoint = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, midPoint);
  const secondHalf = data.slice(midPoint);
  
  const firstHalfSales = firstHalf.reduce((sum, d) => sum + d.sales_quantity, 0);
  const secondHalfSales = secondHalf.reduce((sum, d) => sum + d.sales_quantity, 0);
  
  let trend = 'stable';
  if (secondHalfSales > firstHalfSales * 1.2) {
    trend = 'up';
  } else if (secondHalfSales < firstHalfSales * 0.8) {
    trend = 'down';
  }

  return {
    totalOrders,
    totalSales,
    totalRevenue,
    avgDailySales: Math.round(avgDailySales * 100) / 100,
    trend,
  };
}