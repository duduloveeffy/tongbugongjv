/**
 * 根据统计数据查找批次
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function findBatch() {
  // 获取最近10个批次
  const { data: batches } = await supabase
    .from('sync_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('查找检测了 1253 个 SKU 的批次...\n');

  for (const batch of batches || []) {
    const { data: siteResults } = await supabase
      .from('sync_site_results')
      .select('*')
      .eq('batch_id', batch.id);

    const result = siteResults?.[0];
    if (result?.stats?.total_checked === 1253) {
      console.log(`=== 找到批次 ${batch.id} ===`);
      console.log(`创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
      console.log(`状态: ${batch.status}`);

      if (result.started_at && result.completed_at) {
        const duration = (new Date(result.completed_at) - new Date(result.started_at)) / 1000 / 60;
        console.log(`耗时: ${duration.toFixed(1)} 分钟`);
      }

      console.log(`\n站点: ${result.site_name}`);
      console.log(`  检测SKU数: ${result.stats.total_checked}`);
      console.log(`  有货: ${result.stats.synced_to_instock || 0}`);
      console.log(`  无货: ${result.stats.synced_to_outofstock || 0}`);

      // 检查缓存
      const { data: cache } = await supabase
        .from('inventory_cache')
        .select('created_at')
        .eq('batch_id', batch.id)
        .single();

      if (cache) {
        console.log(`\n缓存创建时间: ${new Date(cache.created_at).toLocaleString('zh-CN')}`);
      }

      console.log('\n---\n');
    }
  }
}

findBatch().catch(console.error);
