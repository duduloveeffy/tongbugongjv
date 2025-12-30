/**
 * 检查最近批次的 SKU 数量
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkRecentBatches() {
  console.log('=== 检查最近批次的 SKU 数量 ===\n');

  // 获取最近5个批次
  const { data: batches } = await supabase
    .from('sync_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!batches || batches.length === 0) {
    console.log('没有批次');
    return;
  }

  for (const batch of batches) {
    const { data: siteResults } = await supabase
      .from('sync_site_results')
      .select('*')
      .eq('batch_id', batch.id);

    console.log(`批次 ${batch.id.substring(0, 8)}...`);
    console.log(`  创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
    console.log(`  状态: ${batch.status}`);

    for (const result of siteResults || []) {
      console.log(`  站点: ${result.site_name}`);
      console.log(`    检测SKU数: ${result.total_checked || 0}`);
      console.log(`    有货: ${result.synced_to_instock || 0}`);
      console.log(`    无货: ${result.synced_to_outofstock || 0}`);
      console.log(`    失败: ${result.failed || 0}`);
      console.log(`    跳过: ${result.skipped || 0}`);
    }
    console.log('');
  }
}

checkRecentBatches().catch(console.error);
