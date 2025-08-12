import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import type { InventoryItem } from '@/lib/inventory-utils';

// POST: 同步库存数据中的品类映射到数据库
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inventoryData }: { inventoryData: InventoryItem[] } = body;

    if (!inventoryData || !Array.isArray(inventoryData)) {
      return NextResponse.json({ 
        error: 'Inventory data is required' 
      }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Database not configured' 
      }, { status: 503 });
    }

    // 提取唯一的SKU和品类映射
    const categoryMappings = new Map<string, {
      category_level1: string;
      category_level2: string;
      category_level3: string;
    }>();

    for (const item of inventoryData) {
      if (item.产品代码 && !categoryMappings.has(item.产品代码)) {
        categoryMappings.set(item.产品代码, {
          category_level1: item.一级品类 || '',
          category_level2: item.二级品类 || '',
          category_level3: item.三级品类 || '',
        });
      }
    }

    // 批量插入或更新品类映射
    const upsertData = Array.from(categoryMappings.entries()).map(([sku, categories]) => ({
      sku,
      ...categories,
      updated_at: new Date().toISOString(),
    }));

    if (upsertData.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No categories to sync',
        synced: 0,
      });
    }

    // 批量 upsert（插入或更新）
    const batchSize = 100;
    let totalSynced = 0;
    const errors: string[] = [];

    for (let i = 0; i < upsertData.length; i += batchSize) {
      const batch = upsertData.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('product_categories')
        .upsert(batch, {
          onConflict: 'sku',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Failed to sync batch:', error);
        errors.push(`Batch ${i / batchSize + 1}: ${error.message}`);
      } else {
        totalSynced += batch.length;
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      message: `Synced ${totalSynced} product categories`,
      synced: totalSynced,
      total: upsertData.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Category sync API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to sync categories' 
    }, { status: 500 });
  }
}

// GET: 获取所有品类统计
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Database not configured' 
      }, { status: 503 });
    }

    // 获取品类统计
    const { data, error } = await supabase
      .from('product_categories')
      .select('category_level1, category_level2, category_level3')
      .not('category_level1', 'is', null);

    if (error) throw error;

    // 统计各级品类数量
    const level1Set = new Set<string>();
    const level2Set = new Set<string>();
    const level3Set = new Set<string>();

    for (const item of data || []) {
      if (item.category_level1) level1Set.add(item.category_level1);
      if (item.category_level2) level2Set.add(item.category_level2);
      if (item.category_level3) level3Set.add(item.category_level3);
    }

    // 构建品类树结构
    const categoryTree: any = {};
    for (const item of data || []) {
      if (!item.category_level1) continue;
      
      if (!categoryTree[item.category_level1]) {
        categoryTree[item.category_level1] = {};
      }
      
      if (item.category_level2) {
        if (!categoryTree[item.category_level1][item.category_level2]) {
          categoryTree[item.category_level1][item.category_level2] = new Set();
        }
        
        if (item.category_level3) {
          categoryTree[item.category_level1][item.category_level2].add(item.category_level3);
        }
      }
    }

    // 转换Set为数组
    const tree = Object.entries(categoryTree).map(([level1, level2Map]) => ({
      name: level1,
      children: Object.entries(level2Map as any).map(([level2, level3Set]) => ({
        name: level2,
        children: Array.from(level3Set as Set<string>).map(level3 => ({
          name: level3,
        })),
      })),
    }));

    return NextResponse.json({
      success: true,
      stats: {
        totalProducts: data?.length || 0,
        level1Count: level1Set.size,
        level2Count: level2Set.size,
        level3Count: level3Set.size,
      },
      categories: {
        level1: Array.from(level1Set).sort(),
        level2: Array.from(level2Set).sort(),
        level3: Array.from(level3Set).sort(),
      },
      tree,
    });

  } catch (error: any) {
    console.error('Category stats API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to fetch category stats' 
    }, { status: 500 });
  }
}