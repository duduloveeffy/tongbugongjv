/**
 * 清理卡住的批次
 * 将状态为 syncing 但实际上已卡住的批次标记为 failed
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function cleanupStuckBatches() {
  console.log('=== 清理卡住的批次 ===\n');

  // 1. 查找所有 syncing 状态的批次
  const { data: batches } = await supabase
    .from('sync_batches')
    .select('*')
    .eq('status', 'syncing');

  if (!batches || batches.length === 0) {
    console.log('没有需要清理的批次');
    return;
  }

  console.log(`找到 ${batches.length} 个 syncing 状态的批次\n`);

  for (const batch of batches) {
    const createdAt = new Date(batch.created_at);
    const now = new Date();
    const ageMinutes = (now - createdAt) / 1000 / 60;
    const expiresAt = new Date(batch.expires_at);
    const isExpired = now > expiresAt;

    console.log(`批次 ${batch.id}:`);
    console.log(`  创建时间: ${createdAt.toLocaleString('zh-CN')}`);
    console.log(`  年龄: ${ageMinutes.toFixed(1)} 分钟`);
    console.log(`  已过期: ${isExpired ? '是' : '否'}`);

    // 查询站点结果
    const { data: siteResults } = await supabase
      .from('sync_site_results')
      .select('*')
      .eq('batch_id', batch.id);

    const runningResults = siteResults?.filter(r => r.status === 'running') || [];
    const pendingResults = siteResults?.filter(r => r.status === 'pending') || [];

    console.log(`  运行中的站点: ${runningResults.length}`);
    console.log(`  待处理的站点: ${pendingResults.length}`);

    // 判断是否需要清理
    let shouldCleanup = false;
    let reason = '';

    if (isExpired) {
      shouldCleanup = true;
      reason = '批次已过期';
    } else if (ageMinutes > 10 && pendingResults.length > 0 && runningResults.length === 0) {
      // 批次存在超过 10 分钟,但所有站点都还是 pending,说明卡住了
      shouldCleanup = true;
      reason = '批次存在超过 10 分钟但所有站点都未开始处理';
    } else if (runningResults.length > 0) {
      // 检查运行中的站点是否超时
      for (const result of runningResults) {
        const startedAt = new Date(result.started_at);
        const runningMinutes = (now - startedAt) / 1000 / 60;
        if (runningMinutes > 5) {
          shouldCleanup = true;
          reason = `站点 ${result.site_name} 运行超过 5 分钟,可能已超时`;
          break;
        }
      }
    }

    if (shouldCleanup) {
      console.log(`  ✅ 需要清理: ${reason}`);

      // 更新批次状态为 failed
      await supabase
        .from('sync_batches')
        .update({
          status: 'failed',
          error_message: `自动清理: ${reason}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', batch.id);

      // 将运行中的站点标记为 failed
      if (runningResults.length > 0) {
        for (const result of runningResults) {
          await supabase
            .from('sync_site_results')
            .update({
              status: 'failed',
              error_message: '站点同步超时（自动清理）',
              completed_at: new Date().toISOString(),
            })
            .eq('id', result.id);
        }
      }

      console.log(`  已标记为 failed\n`);
    } else {
      console.log(`  ⏳ 暂不清理（批次可能仍在正常运行）\n`);
    }
  }

  console.log('清理完成！');
}

cleanupStuckBatches().catch(console.error);
