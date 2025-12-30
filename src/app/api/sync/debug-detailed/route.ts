/**
 * 详细诊断 API - 检查同步流程的每个环节
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    checks: [] as Array<{ name: string; status: string; details: any }>,
  };

  try {
    // 1. 检查最新批次
    diagnostics.checks.push({ name: '检查最新批次', status: '进行中', details: null });
    const { data: latestBatch } = await supabase
      .from('sync_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (latestBatch) {
      diagnostics.checks[diagnostics.checks.length - 1] = {
        name: '检查最新批次',
        status: '✅ 完成',
        details: {
          batch_id: latestBatch.id,
          status: latestBatch.status,
          current_step: latestBatch.current_step,
          total_sites: latestBatch.total_sites,
          created_at: latestBatch.created_at,
          updated_at: latestBatch.updated_at,
          cache_key: latestBatch.cache_key,
        },
      };

      // 2. 检查缓存
      if (latestBatch.cache_key) {
        diagnostics.checks.push({ name: '检查缓存数据', status: '进行中', details: null });
        const { data: cache } = await supabase
          .from('h3yun_inventory_cache')
          .select('*')
          .eq('cache_key', latestBatch.cache_key)
          .single();

        diagnostics.checks[diagnostics.checks.length - 1] = {
          name: '检查缓存数据',
          status: cache ? '✅ 存在' : '❌ 缺失',
          details: cache
            ? {
                inventory_count: Array.isArray(cache.inventory_data) ? cache.inventory_data.length : 0,
                sku_mappings_count: cache.sku_mappings ? Object.keys(cache.sku_mappings).length : 0,
                created_at: cache.created_at,
              }
            : null,
        };
      }

      // 3. 检查站点结果
      diagnostics.checks.push({ name: '检查站点同步结果', status: '进行中', details: null });
      const { data: siteResults } = await supabase
        .from('sync_site_results')
        .select('*')
        .eq('batch_id', latestBatch.id)
        .order('step_index', { ascending: true });

      const resultSummary = {
        total: siteResults?.length || 0,
        pending: siteResults?.filter((r) => r.status === 'pending').length || 0,
        syncing: siteResults?.filter((r) => r.status === 'syncing').length || 0,
        completed: siteResults?.filter((r) => r.status === 'completed').length || 0,
        failed: siteResults?.filter((r) => r.status === 'failed').length || 0,
        sites: siteResults?.map((r) => ({
          step: r.step_index,
          site: r.site_name,
          status: r.status,
          error: r.error_message,
          updated_at: r.updated_at,
        })),
      };

      diagnostics.checks[diagnostics.checks.length - 1] = {
        name: '检查站点同步结果',
        status: '✅ 完成',
        details: resultSummary,
      };

      // 4. 检查当前应该执行的步骤
      const currentStep = latestBatch.current_step;
      diagnostics.checks.push({
        name: '当前应执行步骤',
        status: '✅ 分析',
        details: {
          current_step: currentStep,
          description: currentStep === 0 ? '步骤 0: 拉取 ERP 数据' : `步骤 ${currentStep}: 同步站点 ${currentStep}`,
          expected_action:
            currentStep === 0
              ? '应该调用 H3Yun API 拉取库存数据'
              : `应该调用 /api/sync/site 同步第 ${currentStep} 个站点`,
        },
      });
    } else {
      diagnostics.checks[diagnostics.checks.length - 1] = {
        name: '检查最新批次',
        status: '❌ 无批次',
        details: '数据库中没有任何批次记录',
      };
    }

    // 5. 检查配置
    diagnostics.checks.push({ name: '检查自动同步配置', status: '进行中', details: null });
    const { data: config } = await supabase
      .from('auto_sync_config')
      .select('*')
      .limit(1)
      .single();

    diagnostics.checks[diagnostics.checks.length - 1] = {
      name: '检查自动同步配置',
      status: config ? '✅ 存在' : '❌ 缺失',
      details: config
        ? {
            enabled: config.enabled,
            site_count: config.site_ids?.length || 0,
            site_ids: config.site_ids,
          }
        : null,
    };

    // 6. 测试内部调用
    diagnostics.checks.push({ name: '测试内部 API 调用', status: '进行中', details: null });
    try {
      const testUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/sync/debug-env`
        : 'http://localhost:3000/api/sync/debug-env';

      const testResponse = await fetch(testUrl, {
        headers: { 'x-internal-call': 'dispatcher' },
      });

      const testData = await testResponse.json();

      diagnostics.checks[diagnostics.checks.length - 1] = {
        name: '测试内部 API 调用',
        status: testResponse.ok ? '✅ 成功' : '❌ 失败',
        details: {
          status: testResponse.status,
          url: testUrl,
          response: testData,
        },
      };
    } catch (error) {
      diagnostics.checks[diagnostics.checks.length - 1] = {
        name: '测试内部 API 调用',
        status: '❌ 错误',
        details: error instanceof Error ? error.message : '未知错误',
      };
    }

    return NextResponse.json({
      success: true,
      diagnostics,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '诊断失败',
        diagnostics,
      },
      { status: 500 }
    );
  }
}
