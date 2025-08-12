import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface BatchTrendRequest {
  skus: string[];
  period?: 'day' | 'week' | 'month';
  daysBack?: number;
}

// POST: 批量获取多个SKU的趋势数据
export async function POST(request: NextRequest) {
  try {
    const body: BatchTrendRequest = await request.json();
    const { skus, period = 'day', daysBack = 7 } = body;

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ 
        error: 'SKUs array is required' 
      }, { status: 400 });
    }

    // 限制批量查询数量
    const limitedSkus = skus.slice(0, 50);

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Database not configured' 
      }, { status: 503 });
    }

    // 并行获取所有SKU的趋势数据
    const promises = limitedSkus.map(async (sku) => {
      try {
        const { data, error } = await supabase.rpc('get_sku_sales_trends', {
          p_sku: sku,
          p_period: period,
          p_days_back: daysBack,
        });

        if (error) throw error;

        // 计算趋势
        let trend: 'up' | 'down' | 'stable' = 'stable';
        const trends = data || [];
        
        if (trends.length >= 2) {
          const firstHalf = trends.slice(0, Math.floor(trends.length / 2));
          const secondHalf = trends.slice(Math.floor(trends.length / 2));
          
          const firstAvg = firstHalf.reduce((sum: number, p: any) => 
            sum + (p.sales_quantity || 0), 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((sum: number, p: any) => 
            sum + (p.sales_quantity || 0), 0) / secondHalf.length;
          
          if (secondAvg > firstAvg * 1.1) {
            trend = 'up';
          } else if (secondAvg < firstAvg * 0.9) {
            trend = 'down';
          }
        }

        const totalSales = trends.reduce((sum: number, p: any) => 
          sum + (p.sales_quantity || 0), 0);
        const totalOrders = trends.reduce((sum: number, p: any) => 
          sum + (p.order_count || 0), 0);

        return {
          sku,
          success: true,
          data: {
            trends: trends.map((point: any) => ({
              date: point.period_label,
              value: point.sales_quantity || 0,
              orders: point.order_count || 0,
            })),
            trend,
            totalSales,
            totalOrders,
          }
        };
      } catch (error: any) {
        return {
          sku,
          success: false,
          error: error.message || 'Failed to fetch trends',
          data: {
            trends: [],
            trend: 'stable' as const,
            totalSales: 0,
            totalOrders: 0,
          }
        };
      }
    });

    const results = await Promise.all(promises);

    // 转换为以 SKU 为键的对象
    const resultsMap = results.reduce((acc, result) => {
      acc[result.sku] = result;
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({
      success: true,
      data: resultsMap,
      count: results.length,
    });

  } catch (error: any) {
    console.error('Batch trends API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to fetch batch trends' 
    }, { status: 500 });
  }
}