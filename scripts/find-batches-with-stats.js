/**
 * 查找有统计数据的批次
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function findBatchesWithStats() {
  console.log('=== 查找有统计数据的批次 ===\n');

  // 获取最近20个批次
  const { data: batches } = await supabase
    .from('sync_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (!batches || batches.length === 0) {
    console.log('没有批次');
    return;
  }

  for (const batch of batches) {
    const { data: siteResults } = await supabase
      .from('sync_site_results')
      .select('*')
      .eq('batch_id', batch.id);

    for (const result of siteResults || []) {
      if (result.stats?.total_checked > 0) {
        console.log(`=== 批次 ${batch.id} ===`);
        console.log(`创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
        console.log(`状态: ${batch.status}`);
        console.log(`站点: ${result.site_name}`);
        console.log(`  检测SKU数: ${result.stats.total_checked}`);
        console.log(`  有货: ${result.stats.synced_to_instock || 0}`);
        console.log(`  无货: ${result.stats.synced_to_outofstock || 0}`);
        console.log(`  无变化: ${result.stats.no_change || 0}`);
        console.log('');
        return; // 找到第一个就停止
      }
    }
  }

  console.log('未找到有统计数据的批次');
}

findBatchesWithStats().catch(console.error);
