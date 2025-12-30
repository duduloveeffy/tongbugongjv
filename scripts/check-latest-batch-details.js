/**
 * 检查最新批次的详细信息
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkLatestBatch() {
  // 获取最新批次
  const { data: batches } = await supabase
    .from('sync_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!batches || batches.length === 0) {
    console.log('没有批次');
    return;
  }

  const batch = batches[0];
  console.log(`=== 批次 ${batch.id} ===`);
  console.log(`状态: ${batch.status}`);
  console.log(`创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
  console.log(`步骤: ${batch.current_step}/${batch.total_sites}`);

  // 获取站点结果
  const { data: siteResults } = await supabase
    .from('sync_site_results')
    .select('*')
    .eq('batch_id', batch.id);

  if (!siteResults || siteResults.length === 0) {
    console.log('\n没有站点结果');
    return;
  }

  console.log(`\n站点结果:`);
  siteResults.forEach(result => {
    console.log(`\n站点: ${result.site_name}`);
    console.log(`  状态: ${result.status}`);
    console.log(`  检测SKU数: ${result.stats?.total_checked || 0}`);
    console.log(`  有货: ${result.stats?.synced_to_instock || 0}`);
    console.log(`  无货: ${result.stats?.synced_to_outofstock || 0}`);
    console.log(`  失败: ${result.stats?.failed || 0}`);
    console.log(`  跳过: ${result.stats?.skipped || 0}`);

    if (result.started_at && result.completed_at) {
      const duration = (new Date(result.completed_at) - new Date(result.started_at)) / 1000;
      console.log(`  耗时: ${duration.toFixed(1)} 秒`);
    }
  });

  // 检查缓存记录
  const { data: cache } = await supabase
    .from('inventory_cache')
    .select('*')
    .eq('batch_id', batch.id)
    .single();

  if (cache) {
    console.log(`\n缓存信息:`);
    console.log(`  库存记录数: ${cache.inventory_data?.length || 0}`);
    console.log(`  SKU映射数: ${Object.keys(cache.sku_mappings || {}).length}`);
    console.log(`  筛选配置: ${JSON.stringify(cache.filter_config || {})}`);
  }
}

checkLatestBatch().catch(console.error);
