import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// wc_sites 表允许更新的字段
const SITE_FIELDS = ['name', 'url', 'api_key', 'api_secret', 'enabled'];

// site_filters 表的字段（已拆分到独立表）
const FILTER_FIELDS = ['sku_filter', 'exclude_sku_prefixes', 'category_filters', 'exclude_warehouses'];

// 更新单个站点
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 分离 wc_sites 表字段和 site_filters 表字段
    const siteUpdates: Record<string, any> = {};
    const filterUpdates: Record<string, any> = {};

    for (const field of SITE_FIELDS) {
      if (field in body) {
        siteUpdates[field] = body[field];
      }
    }

    for (const field of FILTER_FIELDS) {
      if (field in body) {
        filterUpdates[field] = body[field];
      }
    }

    const hasSiteUpdates = Object.keys(siteUpdates).length > 0;
    const hasFilterUpdates = Object.keys(filterUpdates).length > 0;

    if (!hasSiteUpdates && !hasFilterUpdates) {
      return NextResponse.json(
        { success: false, error: '没有有效的更新字段' },
        { status: 400 }
      );
    }

    let siteData = null;

    // 更新 wc_sites 表
    if (hasSiteUpdates) {
      siteUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('wc_sites')
        .update(siteUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[Sites API] 更新站点失败:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }
      siteData = data;
    }

    // 更新 site_filters 表（使用 upsert 确保记录存在）
    if (hasFilterUpdates) {
      filterUpdates.site_id = id;
      filterUpdates.updated_at = new Date().toISOString();

      const { error: filterError } = await supabase
        .from('site_filters')
        .upsert(filterUpdates, { onConflict: 'site_id' });

      if (filterError) {
        console.error('[Sites API] 更新站点筛选配置失败:', filterError);
        return NextResponse.json(
          { success: false, error: filterError.message },
          { status: 500 }
        );
      }
    }

    // 如果只更新了 filter，需要获取完整的 site 数据
    if (!siteData) {
      const { data, error } = await supabase
        .from('wc_sites')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('[Sites API] 获取站点数据失败:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }
      siteData = data;
    }

    // 获取最新的 filter 数据并合并返回
    const { data: filterData } = await supabase
      .from('site_filters')
      .select('sku_filter, exclude_sku_prefixes, category_filters, exclude_warehouses')
      .eq('site_id', id)
      .single();

    // 合并站点数据和筛选配置（保持前端兼容性）
    const result = {
      ...siteData,
      sku_filter: filterData?.sku_filter ?? null,
      exclude_sku_prefixes: filterData?.exclude_sku_prefixes ?? null,
      category_filters: filterData?.category_filters ?? null,
      exclude_warehouses: filterData?.exclude_warehouses ?? null,
    };

    return NextResponse.json({ success: true, site: result });
  } catch (error) {
    console.error('[Sites API] 更新站点异常:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '更新失败' },
      { status: 500 }
    );
  }
}

// 获取单个站点（包含筛选配置）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 使用 JOIN 获取站点和筛选配置
    const { data, error } = await supabase
      .from('wc_sites')
      .select(`
        *,
        site_filters (
          sku_filter,
          exclude_sku_prefixes,
          category_filters,
          exclude_warehouses
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[Sites API] 获取站点失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 将 site_filters 数组扁平化为字段（保持前端兼容性）
    const filterArr = (data as any).site_filters as any[] | null;
    const filter = (filterArr && filterArr.length > 0) ? filterArr[0] : null;

    const result = {
      ...data,
      site_filters: undefined, // 移除嵌套的 site_filters
      sku_filter: filter?.sku_filter ?? null,
      exclude_sku_prefixes: filter?.exclude_sku_prefixes ?? null,
      category_filters: filter?.category_filters ?? null,
      exclude_warehouses: filter?.exclude_warehouses ?? null,
    };

    return NextResponse.json({ success: true, site: result });
  } catch (error) {
    console.error('[Sites API] 获取站点异常:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取失败' },
      { status: 500 }
    );
  }
}
