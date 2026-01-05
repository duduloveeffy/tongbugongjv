/**
 * 检查 products 表缓存中目标 SKU 的数据
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const targetSkus = ['AK-HO2-14', 'AK-HO2-10', 'AK-HO5-06'];

  // 获取站点信息
  const { data: sites } = await supabase
    .from('wc_sites')
    .select('id, name')
    .eq('name', 'vapsolo-de');

  console.log('站点:', sites);

  if (!sites || sites.length === 0) {
    console.log('未找到站点');
    return;
  }

  const siteId = sites[0].id;

  // 查询 products 表中这些 SKU 的缓存
  const { data: products, error } = await supabase
    .from('products')
    .select('sku, status, stock_status')
    .eq('site_id', siteId)
    .in('sku', targetSkus);

  console.log('\nProducts 表缓存查询:');
  console.log('Error:', error);
  console.log('Results:', products);

  // 统计该站点缓存的总产品数
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', siteId);

  console.log('\n该站点缓存的总产品数:', count);

  // 查询 inventory_cache 中这些 SKU 的 ERP 数据
  const { data: latestBatch } = await supabase
    .from('sync_batches')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (latestBatch) {
    const { data: cache } = await supabase
      .from('inventory_cache')
      .select('inventory_data, sku_mappings')
      .eq('batch_id', latestBatch.id)
      .single();

    if (cache && cache.inventory_data) {
      console.log('\n=== ERP 库存缓存中的目标 SKU ===');
      for (const sku of targetSkus) {
        const item = cache.inventory_data.find(i => i.产品代码 === sku);
        if (item) {
          console.log(sku + ':');
          console.log('  可售库存:', item.可售库存);
          console.log('  缺货:', item.缺货);
          console.log('  净库存:', (Number(item.可售库存) || 0) - (Number(item.缺货) || 0));
        } else {
          console.log(sku + ': 未找到');
        }
      }

      // 检查 SKU 映射
      if (cache.sku_mappings) {
        console.log('\n=== SKU 映射表中的目标 SKU ===');
        for (const sku of targetSkus) {
          const mapping = cache.sku_mappings[sku];
          console.log(sku + ':', mapping || '无映射');
        }
      }
    }
  }
}

check().catch(console.error);
