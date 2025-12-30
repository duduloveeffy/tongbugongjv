/**
 * 站点筛选配置 API
 * 保存和读取各站点的筛选配置
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 保存或更新站点筛选配置
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { site_id, sku_filter, exclude_sku_prefixes, category_filters, exclude_warehouses } = body;

    if (!site_id) {
      return NextResponse.json({ success: false, error: '缺少站点ID' }, { status: 400 });
    }

    // 使用 upsert 来插入或更新
    const { data, error } = await supabase
      .from('site_filters')
      .upsert({
        site_id,
        sku_filter,
        exclude_sku_prefixes,
        category_filters,
        exclude_warehouses,
      }, {
        onConflict: 'site_id'
      })
      .select()
      .single();

    if (error) {
      console.error('保存站点筛选配置失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('保存站点筛选配置异常:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

/**
 * 获取站点筛选配置
 */
export async function GET(request: NextRequest) {
  try {
    const siteId = request.nextUrl.searchParams.get('site_id');

    if (!siteId) {
      return NextResponse.json({ success: false, error: '缺少站点ID' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('site_filters')
      .select('*')
      .eq('site_id', siteId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('获取站点筛选配置失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || null });
  } catch (error) {
    console.error('获取站点筛选配置异常:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
