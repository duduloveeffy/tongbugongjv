/**
 * 调试批次 API - 查看当前卡住的批次详细信息
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get('batch_id');

  try {
    let batch;

    if (batchId) {
      // 查询指定批次
      const { data } = await supabase
        .from('sync_batches')
        .select('*')
        .eq('id', batchId)
        .single();
      batch = data;
    } else {
      // 查询最新的活跃批次
      const { data } = await supabase
        .from('sync_batches')
        .select('*')
        .in('status', ['pending', 'fetching', 'syncing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      batch = data;
    }

    if (!batch) {
      return NextResponse.json({
        success: false,
        error: '未找到批次',
      });
    }

    // 获取批次的站点结果
    const { data: siteResults } = await supabase
      .from('sync_site_results')
      .select('*')
      .eq('batch_id', batch.id)
      .order('step_index', { ascending: true });

    // 获取缓存信息
    let cacheInfo = null;
    if (batch.inventory_cache_id) {
      const { data: cache } = await supabase
        .from('inventory_cache')
        .select('id, created_at, expires_at')
        .eq('id', batch.inventory_cache_id)
        .single();
      cacheInfo = cache;
    }

    // 分析问题
    const analysis: string[] = [];

    analysis.push(`批次 ID: ${batch.id}`);
    analysis.push(`状态: ${batch.status}`);
    analysis.push(`当前步骤: ${batch.current_step}/${batch.total_sites}`);
    analysis.push(`创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
    analysis.push(`开始时间: ${batch.started_at ? new Date(batch.started_at).toLocaleString('zh-CN') : '未开始'}`);
    analysis.push(`过期时间: ${new Date(batch.expires_at).toLocaleString('zh-CN')}`);
    analysis.push('');

    if (batch.error_message) {
      analysis.push(`❌ 错误信息: ${batch.error_message}`);
      analysis.push('');
    }

    if (cacheInfo) {
      analysis.push(`✅ 缓存已创建: ${cacheInfo.id}`);
      analysis.push(`   创建于: ${new Date(cacheInfo.created_at).toLocaleString('zh-CN')}`);
      analysis.push(`   过期于: ${new Date(cacheInfo.expires_at).toLocaleString('zh-CN')}`);
    } else if (batch.current_step > 0) {
      analysis.push(`❌ 缺少缓存 (步骤>0但无缓存ID)`);
    }
    analysis.push('');

    analysis.push('站点同步状态:');
    if (siteResults && siteResults.length > 0) {
      for (const result of siteResults) {
        const emoji =
          result.status === 'completed' ? '✅' :
          result.status === 'running' ? '🔄' :
          result.status === 'failed' ? '❌' :
          '⏳';

        analysis.push(`  ${emoji} 步骤${result.step_index}: ${result.site_name} - ${result.status}`);

        if (result.status === 'running' && result.started_at) {
          const duration = Date.now() - new Date(result.started_at).getTime();
          analysis.push(`     运行时长: ${Math.floor(duration / 1000)}秒`);

          if (duration > 5 * 60 * 1000) {
            analysis.push(`     ⚠️ 运行超过5分钟，可能已卡死`);
          }
        }

        if (result.error_message) {
          analysis.push(`     错误: ${result.error_message}`);
        }

        if (result.status === 'completed') {
          analysis.push(`     统计: 检测${result.total_checked}, +${result.synced_to_instock}有货, +${result.synced_to_outofstock}无货, ${result.failed}失败`);
        }
      }
    } else {
      analysis.push('  ❌ 没有站点结果记录');
    }
    analysis.push('');

    // 诊断建议
    analysis.push('诊断建议:');

    const currentSiteResult = siteResults?.find(r => r.step_index === batch.current_step);

    if (batch.current_step === 0) {
      analysis.push('  批次在步骤0(拉取ERP),调度器下次运行时会执行此步骤');
    } else if (!cacheInfo) {
      analysis.push('  ❌ 致命错误: 步骤>0但缺少缓存,批次无法继续');
      analysis.push('  建议: 终止此批次,重新触发');
    } else if (!currentSiteResult) {
      analysis.push('  ❌ 致命错误: 找不到当前步骤的站点结果记录');
      analysis.push('  建议: 终止此批次,重新触发');
    } else if (currentSiteResult.status === 'pending') {
      analysis.push('  ⏳ 站点同步尚未开始,等待下次调度器触发(每2分钟)');
    } else if (currentSiteResult.status === 'running') {
      const duration = Date.now() - new Date(currentSiteResult.started_at!).getTime();
      if (duration > 5 * 60 * 1000) {
        analysis.push('  ⚠️ 站点同步运行超过5分钟,可能已超时或卡死');
        analysis.push('  建议: 终止此批次,检查 /api/sync/site 端点是否正常');
      } else {
        analysis.push(`  🔄 站点同步正在运行中(已运行${Math.floor(duration / 1000)}秒)`);
      }
    } else if (currentSiteResult.status === 'failed') {
      analysis.push('  ❌ 站点同步失败');
      analysis.push(`  错误: ${currentSiteResult.error_message || '未知'}`);
      analysis.push('  建议: 检查站点API配置和网络连接');
    } else if (currentSiteResult.status === 'completed') {
      analysis.push('  ✅ 当前站点已完成,但批次未更新到下一步');
      analysis.push('  可能原因: 调度器更新失败,等待下次触发');
    }

    return NextResponse.json({
      success: true,
      batch,
      siteResults,
      cacheInfo,
      analysis: analysis.join('\n'),
    });

  } catch (error) {
    console.error('调试批次失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '调试失败',
    }, { status: 500 });
  }
}
