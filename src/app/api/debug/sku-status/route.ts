/**
 * 临时调试 API：查询指定 SKU 在数据库中的状态
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('site_id') || '7f73b272-2537-43c7-914d-4564116b76f9';

  // 要查询的 SKU 列表
  const targetSkus = [
    'SU-17', 'VS2-1117', 'VS5-1117',
    'SU-13', 'VS2-1113', 'VS5-1113',
    'QU5-01', 'QU5-09'
  ];

  // 查询 products 表
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('sku, stock_status, stock_quantity, manage_stock, synced_at')
    .eq('site_id', siteId)
    .in('sku', targetSkus);

  // 查询 product_variations 表
  const { data: variations, error: variationsError } = await supabase
    .from('product_variations')
    .select('sku, stock_status, stock_quantity, manage_stock, synced_at, product_id, products!inner(site_id)')
    .eq('products.site_id', siteId)
    .in('sku', targetSkus);

  // 合并结果
  const results: Record<string, any> = {};

  for (const sku of targetSkus) {
    const fromProducts = products?.find(p => p.sku === sku);
    const fromVariations = variations?.find(v => v.sku === sku);

    results[sku] = {
      in_products: fromProducts ? {
        stock_status: fromProducts.stock_status,
        stock_quantity: fromProducts.stock_quantity,
        manage_stock: fromProducts.manage_stock,
        synced_at: fromProducts.synced_at,
      } : null,
      in_variations: fromVariations ? {
        stock_status: fromVariations.stock_status,
        stock_quantity: fromVariations.stock_quantity,
        manage_stock: fromVariations.manage_stock,
        synced_at: fromVariations.synced_at,
      } : null,
      found: !!(fromProducts || fromVariations),
    };
  }

  return NextResponse.json({
    site_id: siteId,
    query_time: new Date().toISOString(),
    errors: {
      products: productsError?.message || null,
      variations: variationsError?.message || null,
    },
    results,
  });
}