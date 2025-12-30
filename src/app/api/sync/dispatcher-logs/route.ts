/**
 * 调度器实时日志 API
 *
 * 从数据库读取最近的批次执行日志
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(_request: NextRequest) {
  try {
    // 1. 获取最近的批次
    const { data: batches } = await supabase
      .from('sync_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    // 2. 获取最近的站点结果
    const { data: siteResults } = await supabase
      .from('sync_site_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    // 3. 构建日志
    const logs: string[] = [];

    logs.push('=== 最近批次 ===');
    if (batches && batches.length > 0) {
      for (const batch of batches) {
        logs.push(`\n[批次 ${batch.id.slice(0, 8)}]`);
        logs.push(`  状态: ${batch.status}`);
        logs.push(`  步骤: ${batch.current_step}/${batch.total_sites}`);
        logs.push(`  创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
        if (batch.started_at) {
          logs.push(`  开始时间: ${new Date(batch.started_at).toLocaleString('zh-CN')}`);
        }
        if (batch.completed_at) {
          logs.push(`  完成时间: ${new Date(batch.completed_at).toLocaleString('zh-CN')}`);
        }
        if (batch.error_message) {
          logs.push(`  错误: ${batch.error_message}`);
        }
        if (batch.inventory_cache_id) {
          logs.push(`  缓存ID: ${batch.inventory_cache_id}`);
        }
      }
    } else {
      logs.push('  无批次记录');
    }

    logs.push('\n=== 最近站点同步 ===');
    if (siteResults && siteResults.length > 0) {
      for (const result of siteResults) {
        logs.push(`\n[${result.site_name}]`);
        logs.push(`  状态: ${result.status}`);
        logs.push(`  步骤: ${result.step_index}`);
        if (result.total_checked) {
          logs.push(`  检测: ${result.total_checked} 个SKU`);
        }
        if (result.synced_to_instock || result.synced_to_outofstock) {
          logs.push(`  同步: +${result.synced_to_instock} 有货, +${result.synced_to_outofstock} 无货`);
        }
        if (result.failed) {
          logs.push(`  失败: ${result.failed}`);
        }
        if (result.error_message) {
          logs.push(`  错误: ${result.error_message}`);
        }
        if (result.started_at) {
          logs.push(`  时间: ${new Date(result.started_at).toLocaleString('zh-CN')}`);
        }
      }
    } else {
      logs.push('  无站点记录');
    }

    return NextResponse.json({
      success: true,
      logs: logs.join('\n'),
      batches,
      siteResults,
    });

  } catch (error) {
    console.error('获取调度器日志失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '获取日志失败',
    }, { status: 500 });
  }
}
