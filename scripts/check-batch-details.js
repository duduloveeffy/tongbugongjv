/**
 * 检查特定批次的详细信息和跳过原因
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkBatchDetails() {
  // 获取最近一个完成的批次
  const { data: batches } = await supabase
    .from('sync_batches')
    .select('*')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!batches || batches.length === 0) {
    console.log('没有完成的批次');
    return;
  }

  const batch = batches[0];
  console.log(`=== 批次 ${batch.id} ===`);
  console.log(`创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
  console.log(`状态: ${batch.status}\n`);

  // 获取站点结果
  const { data: siteResults } = await supabase
    .from('sync_site_results')
    .select('*')
    .eq('batch_id', batch.id);

  for (const result of siteResults || []) {
    console.log(`站点: ${result.site_name}`);
    console.log(`  检测SKU数: ${result.total_checked}`);
    console.log(`  有货: ${result.synced_to_instock}`);
    console.log(`  无货: ${result.synced_to_outofstock}`);
    console.log(`  失败: ${result.failed}`);
    console.log(`  跳过: ${result.skipped}\n`);

    // 检查详细信息
    if (result.details && result.details.length > 0) {
      console.log(`详细信息 (前20条):`);
      const sample = result.details.slice(0, 20);
      const actionCounts = {};

      for (const detail of result.details) {
        actionCounts[detail.action] = (actionCounts[detail.action] || 0) + 1;
      }

      console.log(`\n动作统计:`);
      for (const [action, count] of Object.entries(actionCounts)) {
        console.log(`  ${action}: ${count}`);
      }

      console.log(`\n前20条详细记录:`);
      for (const detail of sample) {
        console.log(`  SKU: ${detail.sku}, 动作: ${detail.action}${detail.error ? `, 错误: ${detail.error}` : ''}`);
      }
    }
  }
}

checkBatchDetails().catch(console.error);
