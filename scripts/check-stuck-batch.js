/**
 * 检查卡住的批次详情
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkStuckBatch() {
  // 查找 syncing 状态的批次
  const { data: batches } = await supabase
    .from('sync_batches')
    .select('*')
    .eq('status', 'syncing')
    .order('created_at', { ascending: false });

  if (!batches || batches.length === 0) {
    console.log('没有卡住的批次');
    return;
  }

  for (const batch of batches) {
    console.log(`\n=== 批次 ${batch.id} ===`);
    console.log(`状态: ${batch.status}`);
    console.log(`步骤: ${batch.current_step}/${batch.total_sites}`);
    console.log(`创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
    console.log(`开始时间: ${batch.started_at ? new Date(batch.started_at).toLocaleString('zh-CN') : '(无)'}`);
    console.log(`过期时间: ${new Date(batch.expires_at).toLocaleString('zh-CN')}`);

    const now = new Date();
    const expiresAt = new Date(batch.expires_at);
    const isExpired = now > expiresAt;
    console.log(`是否过期: ${isExpired ? '是' : '否'}`);

    // 查询站点结果
    const { data: siteResults } = await supabase
      .from('sync_site_results')
      .select('*')
      .eq('batch_id', batch.id)
      .order('step_index');

    console.log(`\n站点结果:`);
    if (!siteResults || siteResults.length === 0) {
      console.log('  (无)');
    } else {
      siteResults.forEach(result => {
        console.log(`  ${result.step_index}. ${result.site_name}`);
        console.log(`     状态: ${result.status}`);
        console.log(`     开始: ${result.started_at ? new Date(result.started_at).toLocaleString('zh-CN') : '(未开始)'}`);
        console.log(`     完成: ${result.completed_at ? new Date(result.completed_at).toLocaleString('zh-CN') : '(未完成)'}`);
        if (result.error_message) {
          console.log(`     错误: ${result.error_message}`);
        }
        if (result.stats) {
          console.log(`     统计: 检查${result.stats.total_checked || 0}, 有货+${result.stats.synced_to_instock || 0}, 无货+${result.stats.synced_to_outofstock || 0}, 失败${result.stats.failed || 0}, 跳过${result.stats.skipped || 0}`);
        }
      });
    }

    // 建议
    console.log(`\n建议:`);
    if (isExpired) {
      console.log('  该批次已过期，下次 cron 触发时会创建新批次');
    } else {
      const runningResults = siteResults?.filter(r => r.status === 'running');
      const pendingResults = siteResults?.filter(r => r.status === 'pending');

      if (runningResults && runningResults.length > 0) {
        console.log(`  有 ${runningResults.length} 个站点正在运行中，可能还在处理或已超时`);
        runningResults.forEach(r => {
          const startedAt = new Date(r.started_at);
          const duration = (now - startedAt) / 1000 / 60; // 分钟
          console.log(`    - ${r.site_name}: 已运行 ${duration.toFixed(1)} 分钟`);
          if (duration > 5) {
            console.log(`      ⚠️ 运行时间过长，可能已超时！`);
          }
        });
      }

      if (pendingResults && pendingResults.length > 0) {
        console.log(`  有 ${pendingResults.length} 个站点还未开始`);
      }
    }
  }
}

checkStuckBatch().catch(console.error);
