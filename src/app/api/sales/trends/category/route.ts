import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { cacheAside, CACHE_TTL, generateCacheKey } from '@/lib/redis-cache';

interface CategoryTrendRequest {
  category: string;
  siteIds?: string[];
  period?: 'day' | 'week' | 'month';
  daysBack?: number;
}

interface CategoryTrendDataPoint {
  period_date: string;
  period_label: string;
  order_count: number;
  sales_quantity: number;
  revenue: number;
  unique_skus: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: CategoryTrendRequest = await request.json();
    const { category, siteIds, period = 'day', daysBack = 30 } = body;

    if (!category) {
      return NextResponse.json({ 
        error: 'Category is required' 
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
      'trends:category',
      category,
      period,
      String(daysBack),
      siteIds?.join(',') || 'all'
    );

    // 使用 Cache-Aside 模式获取数据
    const trendData = await cacheAside<CategoryTrendDataPoint[]>(
      cacheKey,
      async () => {
        const { data, error } = await supabase.rpc('get_category_sales_trends', {
          p_category: category,
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
    const stats = calculateCategoryStats(trendData);

    // 获取品类下的TOP SKUs
    const topSkus = await getTopSkusInCategory(supabase, category, siteIds, daysBack);

    return NextResponse.json({
      success: true,
      data: {
        category,
        period,
        daysBack,
        trends: trendData,
        stats,
        topSkus,
      },
    });

  } catch (error: any) {
    console.error('Category trends API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to fetch category trends' 
    }, { status: 500 });
  }
}

// GET: 获取所有品类列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Database not configured' 
      }, { status: 503 });
    }

    // 获取所有一级品类
    const { data: categories, error } = await supabase
      .from('product_categories')
      .select('category_level1')
      .not('category_level1', 'is', null)
      .order('category_level1');

    if (error) throw error;

    // 去重
    const uniqueCategories = Array.from(
      new Set(categories?.map(c => c.category_level1) || [])
    );

    return NextResponse.json({
      success: true,
      data: uniqueCategories,
    });

  } catch (error: any) {
    console.error('Categories list API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to fetch categories' 
    }, { status: 500 });
  }
}

// 获取品类下的TOP SKUs
async function getTopSkusInCategory(
  supabase: any,
  category: string,
  siteIds: string[] | undefined,
  daysBack: number
): Promise<any[]> {
  try {
    // 使用原生SQL查询获取TOP 10 SKUs
    const query = `
      WITH category_skus AS (
        SELECT DISTINCT sku
        FROM product_categories
        WHERE category_level1 = $1
          ${siteIds ? 'AND site_id = ANY($4)' : ''}
      ),
      sku_sales AS (
        SELECT 
          oi.sku,
          COUNT(DISTINCT o.id) as order_count,
          COALESCE(SUM(oi.quantity), 0) as sales_quantity,
          COALESCE(SUM(oi.total), 0) as revenue
        FROM order_items oi
        INNER JOIN orders o ON oi.order_id = o.id
        INNER JOIN category_skus cs ON oi.sku = cs.sku
        WHERE 
          o.status IN ('completed', 'processing')
          ${siteIds ? 'AND o.site_id = ANY($4)' : ''}
          AND o.date_created >= CURRENT_DATE - INTERVAL '1 day' * $2
        GROUP BY oi.sku
        ORDER BY sales_quantity DESC
        LIMIT 10
      )
      SELECT 
        ss.sku,
        ss.order_count,
        ss.sales_quantity,
        ss.revenue,
        pc.category_level2,
        pc.category_level3
      FROM sku_sales ss
      LEFT JOIN product_categories pc ON ss.sku = pc.sku
      ORDER BY ss.sales_quantity DESC
    `;

    const params = siteIds 
      ? [category, daysBack, null, siteIds]
      : [category, daysBack];

    const { data, error } = await supabase.rpc('exec_sql', {
      query,
      params,
    });

    if (error) {
      console.error('Failed to get top SKUs:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting top SKUs:', error);
    return [];
  }
}

// 计算品类统计信息
function calculateCategoryStats(data: CategoryTrendDataPoint[]) {
  if (!data || data.length === 0) {
    return {
      totalOrders: 0,
      totalSales: 0,
      totalRevenue: 0,
      avgDailySales: 0,
      avgUniqueSkus: 0,
      trend: 'stable',
    };
  }

  const totalOrders = data.reduce((sum, d) => sum + d.order_count, 0);
  const totalSales = data.reduce((sum, d) => sum + d.sales_quantity, 0);
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const avgDailySales = totalSales / data.length;
  const avgUniqueSkus = data.reduce((sum, d) => sum + d.unique_skus, 0) / data.length;

  // 计算趋势
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
    avgUniqueSkus: Math.round(avgUniqueSkus * 10) / 10,
    trend,
  };
}