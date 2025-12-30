/**
 * 清理卡住和过期的同步批次
 * 可以通过 cron 定期调用
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  const now = new Date();
  const results = {
    expired_batches: 0,
    stuck_batches: 0,
    stuck_sites: 0,
  };

  try {
    // 1. 查找所有未完成的批次
    const { data: batches } = await supabase
      .from('sync_batches')
      .select('*')
      .in('status', ['pending', 'fetching', 'syncing']);

    if (!batches || batches.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要清理的批次',
        results,
      });
    }

    for (const batch of batches) {
      const createdAt = new Date(batch.created_at);
      const expiresAt = new Date(batch.expires_at);
      const ageMinutes = (now.getTime() - createdAt.getTime()) / 1000 / 60;
      const isExpired = now > expiresAt;

      let shouldCleanup = false;
      let reason = '';

      // 查询站点结果
      const { data: siteResults } = await supabase
        .from('sync_site_results')
        .select('*')
        .eq('batch_id', batch.id);

      const runningResults = siteResults?.filter(r => r.status === 'running') || [];
      const pendingResults = siteResults?.filter(r => r.status === 'pending') || [];

      if (isExpired) {
        shouldCleanup = true;
        reason = '批次已过期';
        results.expired_batches++;
      } else if (ageMinutes > 15 && pendingResults.length > 0 && runningResults.length === 0) {
        // 批次存在超过 15 分钟,但所有站点都还是 pending,说明卡住了
        shouldCleanup = true;
        reason = '批次存在超过 15 分钟但所有站点都未开始处理';
        results.stuck_batches++;
      } else if (runningResults.length > 0) {
        // 检查运行中的站点是否超时
        for (const result of runningResults) {
          const startedAt = new Date(result.started_at);
          const runningMinutes = (now.getTime() - startedAt.getTime()) / 1000 / 60;
          if (runningMinutes > 10) {
            shouldCleanup = true;
            reason = `站点 ${result.site_name} 运行超过 10 分钟,已超时`;
            results.stuck_sites++;
            break;
          }
        }
      }

      if (shouldCleanup) {
        console.log(`[Cleanup] 清理批次 ${batch.id}: ${reason}`);

        // 更新批次状态为 failed
        await supabase
          .from('sync_batches')
          .update({
            status: 'failed',
            error_message: `自动清理: ${reason}`,
            completed_at: now.toISOString(),
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
                completed_at: now.toISOString(),
              })
              .eq('id', result.id);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `清理完成: ${results.expired_batches} 个过期批次, ${results.stuck_batches} 个卡住批次, ${results.stuck_sites} 个超时站点`,
      results,
    });

  } catch (error) {
    console.error('[Cleanup] 清理失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '清理失败',
    }, { status: 500 });
  }
}

// GET 方法用于查看状态（不执行清理）
export async function GET() {
  try {
    const { data: batches } = await supabase
      .from('sync_batches')
      .select('*')
      .in('status', ['pending', 'fetching', 'syncing']);

    const now = new Date();
    const analysis = batches?.map(batch => {
      const createdAt = new Date(batch.created_at);
      const expiresAt = new Date(batch.expires_at);
      const ageMinutes = (now.getTime() - createdAt.getTime()) / 1000 / 60;
      const isExpired = now > expiresAt;

      return {
        id: batch.id,
        status: batch.status,
        age_minutes: Math.round(ageMinutes),
        is_expired: isExpired,
        current_step: batch.current_step,
        total_sites: batch.total_sites,
      };
    }) || [];

    return NextResponse.json({
      success: true,
      total_incomplete_batches: batches?.length || 0,
      batches: analysis,
    });

  } catch (error) {
    console.error('[Cleanup] 查询失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '查询失败',
    }, { status: 500 });
  }
}
