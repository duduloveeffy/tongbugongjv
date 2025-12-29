/**
 * 批次状态查询 API
 *
 * GET: 返回当前活跃批次的状态和站点同步进度
 * DELETE: 终止当前批次
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    // 1. 查找最近的批次（包括已完成的，最多返回最近一个）
    const { data: batches, error: batchError } = await supabase
      .from('sync_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (batchError) {
      console.error('查询批次失败:', batchError);
      return NextResponse.json({ success: false, error: '查询批次失败' }, { status: 500 });
    }

    const batch = batches?.[0] || null;

    if (!batch) {
      return NextResponse.json({
        success: true,
        batch: null,
        siteResults: [],
      });
    }

    // 2. 获取站点同步结果
    const { data: siteResults, error: resultsError } = await supabase
      .from('sync_site_results')
      .select('*')
      .eq('batch_id', batch.id)
      .order('step_index', { ascending: true });

    if (resultsError) {
      console.error('查询站点结果失败:', resultsError);
    }

    // 3. 如果站点名为空，尝试补充站点名
    const resultsWithNames = await Promise.all(
      (siteResults || []).map(async (result) => {
        if (result.site_name) return result;

        // 查询站点名
        const { data: site } = await supabase
          .from('wc_sites')
          .select('name')
          .eq('id', result.site_id)
          .single();

        return {
          ...result,
          site_name: site?.name || `站点 ${result.step_index}`,
        };
      })
    );

    return NextResponse.json({
      success: true,
      batch,
      siteResults: resultsWithNames,
    });

  } catch (error) {
    console.error('批次状态查询错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '查询失败',
    }, { status: 500 });
  }
}

// 终止当前批次
export async function DELETE() {
  try {
    // 1. 查找活跃批次
    const { data: batches, error: batchError } = await supabase
      .from('sync_batches')
      .select('id, status')
      .in('status', ['pending', 'fetching', 'syncing'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (batchError) {
      console.error('查询批次失败:', batchError);
      return NextResponse.json({ success: false, error: '查询批次失败' }, { status: 500 });
    }

    const batch = batches?.[0];

    if (!batch) {
      return NextResponse.json({
        success: true,
        message: '没有活跃的批次需要终止',
      });
    }

    // 2. 更新批次状态为 failed
    const { error: updateError } = await supabase
      .from('sync_batches')
      .update({
        status: 'failed',
        error_message: '手动终止',
        completed_at: new Date().toISOString(),
      })
      .eq('id', batch.id);

    if (updateError) {
      console.error('更新批次状态失败:', updateError);
      return NextResponse.json({ success: false, error: '终止失败' }, { status: 500 });
    }

    // 3. 将所有 pending/running 的站点结果标记为 failed
    await supabase
      .from('sync_site_results')
      .update({
        status: 'failed',
        error_message: '批次被手动终止',
        completed_at: new Date().toISOString(),
      })
      .eq('batch_id', batch.id)
      .in('status', ['pending', 'running']);

    console.log(`批次 ${batch.id} 已被手动终止`);

    return NextResponse.json({
      success: true,
      message: '批次已终止',
      batch_id: batch.id,
    });

  } catch (error) {
    console.error('终止批次错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '终止失败',
    }, { status: 500 });
  }
}