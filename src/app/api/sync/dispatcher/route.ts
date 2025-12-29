/**
 * 同步调度器 API
 *
 * 职责：
 * 1. 每 2 分钟被 Vercel Cron 触发
 * 2. 检查是否有进行中的同步批次
 * 3. 如果无批次：创建新批次，执行步骤 0（拉取 ERP 数据并缓存）
 * 4. 如果有批次：执行下一个站点同步
 * 5. 所有站点完成后：发送通知，标记批次完成
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createH3YunClient } from '@/lib/h3yun/client';
import { transformH3YunBatch, extractUniqueWarehouses } from '@/lib/h3yun/transformer';
import type { H3YunConfig, WarehouseMapping } from '@/lib/h3yun/types';
import { env } from '@/env';
import { h3yunSchemaConfig } from '@/config/h3yun.config';
import {
  getAutoSyncConfigAsync,
  saveAutoSyncConfigAsync,
  addAutoSyncLogAsync,
  updateAutoSyncLogAsync,
  type AutoSyncLog,
} from '@/lib/local-config-store';
import { buildMappingIndex, type MappingIndex } from '@/lib/h3yun/mapping-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 筛选配置接口
interface FilterConfig {
  isMergedMode: boolean;
  hideZeroStock: boolean;
  hideNormalStatus: boolean;
  showNeedSync: boolean;
  categoryFilter: string;
  categoryFilters: string[];
  skuFilter: string;
  excludeSkuPrefixes: string;
  excludeWarehouses: string;
}

// 库存项接口
interface InventoryItem {
  产品代码: string;
  产品名称: string;
  可售库存: string;
  缺货: string;
  仓库: string;
  一级品类: string;
  二级品类: string;
  三级品类: string;
  [key: string]: string | number | boolean | object | undefined;
}

// 同步批次接口
interface SyncBatch {
  id: string;
  status: 'pending' | 'fetching' | 'syncing' | 'completed' | 'failed';
  current_step: number;
  total_sites: number;
  site_ids: string[];
  inventory_cache_id: string | null;
  stats: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// 在合并前过滤仓库
function filterWarehousesBeforeMerge(data: InventoryItem[], excludeWarehouses: string): InventoryItem[] {
  if (!excludeWarehouses?.trim()) return data;

  const warehousesToExclude = excludeWarehouses
    .split(/[,，]/)
    .map(w => w.trim())
    .filter(w => w)
    .map(w => w.toLowerCase());

  if (warehousesToExclude.length === 0) return data;

  return data.filter(item => {
    const warehouseLower = (item.仓库 || '').toLowerCase();
    return !warehousesToExclude.some(excluded => warehouseLower.includes(excluded));
  });
}

// 合并仓库数据
function mergeWarehouseData(data: InventoryItem[]): InventoryItem[] {
  const grouped = new Map<string, InventoryItem[]>();

  data.forEach(item => {
    const sku = item.产品代码;
    if (!grouped.has(sku)) {
      grouped.set(sku, []);
    }
    grouped.get(sku)!.push(item);
  });

  const merged: InventoryItem[] = [];
  grouped.forEach((items) => {
    if (items.length === 0) return;

    const first = items[0]!;
    const mergedItem: InventoryItem = {
      产品代码: first.产品代码,
      产品名称: first.产品名称,
      一级品类: first.一级品类,
      二级品类: first.二级品类,
      三级品类: first.三级品类,
      仓库: '合并',
      可售库存: String(items.reduce((sum, item) => sum + (Number(item.可售库存) || 0), 0)),
      缺货: String(items.reduce((sum, item) => sum + (Number(item.缺货) || 0), 0)),
    };

    merged.push(mergedItem);
  });

  return merged;
}

// 发送企业微信通知
async function sendWechatNotification(
  webhookUrl: string,
  title: string,
  content: string,
  isSuccess: boolean
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: {
          content: `### ${isSuccess ? '✅' : '❌'} ${title}\n${content}`
        }
      })
    });

    return response.ok;
  } catch (error) {
    console.error('[Dispatcher] 发送企业微信通知失败:', error);
    return false;
  }
}

// 步骤 0：拉取 ERP 数据并缓存
async function executeStep0(batchId: string, logId: string): Promise<{ success: boolean; error?: string }> {
  console.log(`[Dispatcher ${logId}] 执行步骤 0: 拉取 ERP 数据`);

  try {
    // 获取自动同步配置
    const config = await getAutoSyncConfigAsync();
    const filters = config.filters as FilterConfig;

    // 检查氚云配置
    const engineCode = env.H3YUN_ENGINE_CODE;
    const engineSecret = env.H3YUN_ENGINE_SECRET;

    if (!engineCode || !engineSecret || !h3yunSchemaConfig.inventorySchemaCode) {
      return { success: false, error: '氚云 ERP 配置不完整' };
    }

    const h3yunConfig: H3YunConfig = {
      engineCode,
      engineSecret,
      schemaCode: h3yunSchemaConfig.inventorySchemaCode,
      warehouseSchemaCode: h3yunSchemaConfig.warehouseSchemaCode,
      skuMappingSchemaCode: h3yunSchemaConfig.skuMappingSchemaCode,
    };

    // 1. 拉取库存数据
    const client = createH3YunClient(h3yunConfig);
    const h3yunData = await client.fetchAllInventory(500);
    console.log(`[Dispatcher ${logId}] 获取到 ${h3yunData.length} 条氚云库存记录`);

    // 2. 获取仓库映射
    const warehouseIds = extractUniqueWarehouses(h3yunData);
    const warehouseNameMap = await client.fetchWarehouseNames(warehouseIds);
    const warehouseMappings: WarehouseMapping[] = Array.from(warehouseNameMap.entries())
      .map(([id, name]) => ({ id, name }));

    // 3. 转换数据
    const transformResult = transformH3YunBatch(h3yunData, warehouseMappings);
    if (!transformResult.success || !transformResult.data) {
      return { success: false, error: '数据转换失败' };
    }

    let inventoryData: InventoryItem[] = transformResult.data;
    console.log(`[Dispatcher ${logId}] 转换后 ${inventoryData.length} 条库存记录`);

    // 4. 全局排除仓库（合并前）
    if (filters.excludeWarehouses) {
      inventoryData = filterWarehousesBeforeMerge(inventoryData, filters.excludeWarehouses);
      console.log(`[Dispatcher ${logId}] 全局排除仓库后 ${inventoryData.length} 条`);
    }

    // 5. 合并仓库（全局设置）
    if (filters.isMergedMode) {
      inventoryData = mergeWarehouseData(inventoryData);
      console.log(`[Dispatcher ${logId}] 合并仓库后 ${inventoryData.length} 条`);
    }

    // 6. 加载 SKU 映射表
    console.log(`[Dispatcher ${logId}] 加载 SKU 映射表...`);
    let skuMappings: Record<string, string[]> = {};

    try {
      const mappingData = await client.fetchSkuMappings();
      if (mappingData && mappingData.length > 0) {
        const mappingIndex = buildMappingIndex(mappingData);
        // 转换为可序列化的格式：SkuMappingRelation[] → string[]（只保留 woocommerceSku）
        for (const [h3yunSku, relations] of mappingIndex.h3yunToWoo.entries()) {
          skuMappings[h3yunSku] = relations.map(r => r.woocommerceSku);
        }
        console.log(`[Dispatcher ${logId}] SKU 映射加载成功: ${mappingData.length} 条`);
      }
    } catch (error) {
      console.warn(`[Dispatcher ${logId}] SKU 映射加载失败，将使用原始 SKU:`, error);
    }

    // 7. 保存到缓存表
    const { data: cache, error: cacheError } = await supabase
      .from('inventory_cache')
      .insert({
        batch_id: batchId,
        inventory_data: inventoryData,
        sku_mappings: skuMappings,
        filter_config: filters,
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 小时后过期
      })
      .select('id')
      .single();

    if (cacheError) {
      console.error(`[Dispatcher ${logId}] 保存缓存失败:`, cacheError);
      return { success: false, error: `保存缓存失败: ${cacheError.message}` };
    }

    // 8. 更新批次状态
    await supabase
      .from('sync_batches')
      .update({
        status: 'syncing',
        current_step: 1, // 下一步是站点 1
        inventory_cache_id: cache.id,
        started_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    console.log(`[Dispatcher ${logId}] 步骤 0 完成，缓存 ID: ${cache.id}`);
    return { success: true };

  } catch (error) {
    console.error(`[Dispatcher ${logId}] 步骤 0 失败:`, error);
    return { success: false, error: error instanceof Error ? error.message : '拉取 ERP 数据失败' };
  }
}

// 触发单站点同步
async function triggerSiteSyncInternal(
  batchId: string,
  siteIndex: number,
  logId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[Dispatcher ${logId}] 触发站点 ${siteIndex} 同步`);

  try {
    // 内部调用站点同步 API
    const baseUrl = process.env.NODE_ENV === 'development'
      ? (process.env.DEV_BASE_URL || 'http://localhost:3000')
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

    const response = await fetch(`${baseUrl}/api/sync/site`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_id: batchId, site_index: siteIndex }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || `HTTP ${response.status}` };
    }

    return { success: true };

  } catch (error) {
    console.error(`[Dispatcher ${logId}] 触发站点同步失败:`, error);
    return { success: false, error: error instanceof Error ? error.message : '触发站点同步失败' };
  }
}

// 完成批次：发送通知
async function completeBatch(batch: SyncBatch, logId: string): Promise<void> {
  console.log(`[Dispatcher ${logId}] 批次完成，开始汇总和通知`);

  try {
    // 1. 获取所有站点结果
    const { data: siteResults } = await supabase
      .from('sync_site_results')
      .select('*')
      .eq('batch_id', batch.id)
      .order('step_index', { ascending: true });

    // 2. 计算总体统计
    const totalStats = {
      total_sites: siteResults?.length || 0,
      total_checked: siteResults?.reduce((sum, r) => sum + (r.total_checked || 0), 0) || 0,
      total_synced_to_instock: siteResults?.reduce((sum, r) => sum + (r.synced_to_instock || 0), 0) || 0,
      total_synced_to_outofstock: siteResults?.reduce((sum, r) => sum + (r.synced_to_outofstock || 0), 0) || 0,
      total_failed: siteResults?.reduce((sum, r) => sum + (r.failed || 0), 0) || 0,
      total_skipped: siteResults?.reduce((sum, r) => sum + (r.skipped || 0), 0) || 0,
      duration_ms: Date.now() - new Date(batch.created_at).getTime(),
    };

    const hasChanges = totalStats.total_synced_to_instock > 0 || totalStats.total_synced_to_outofstock > 0;
    const hasFailed = totalStats.total_failed > 0;
    const status = hasFailed ? 'partial' : (hasChanges ? 'success' : 'no_changes');

    // 3. 更新批次状态
    await supabase
      .from('sync_batches')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        stats: totalStats,
      })
      .eq('id', batch.id);

    // 4. 更新自动同步配置
    await saveAutoSyncConfigAsync({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_summary: totalStats,
    });

    // 5. 发送企业微信通知
    const config = await getAutoSyncConfigAsync();

    if (config.wechat_webhook_url) {
      const shouldNotify =
        (config.notify_on_success && status === 'success') ||
        (config.notify_on_failure && status === 'partial') ||
        (config.notify_on_no_changes && status === 'no_changes');

      if (shouldNotify && siteResults) {
        // 构建站点详情
        const changedSiteDetails: string[] = [];
        const unchangedSiteNames: string[] = [];

        for (const result of siteResults) {
          const hasChanges = (result.synced_to_instock || 0) > 0 || (result.synced_to_outofstock || 0) > 0 || (result.failed || 0) > 0;

          if (!hasChanges) {
            unchangedSiteNames.push(result.site_name);
            continue;
          }

          changedSiteDetails.push(`\n**📦 ${result.site_name}**`);

          const details = result.details as Array<{ sku: string; action: string; error?: string }> || [];

          const instockSkus = details.filter(d => d.action === 'to_instock').map(d => d.sku);
          if (instockSkus.length > 0) {
            changedSiteDetails.push(`> 🟢 有货(${instockSkus.length}): ${instockSkus.slice(0, 10).join(', ')}${instockSkus.length > 10 ? ` ...等${instockSkus.length}个` : ''}`);
          }

          const outofstockSkus = details.filter(d => d.action === 'to_outofstock').map(d => d.sku);
          if (outofstockSkus.length > 0) {
            changedSiteDetails.push(`> 🔴 无货(${outofstockSkus.length}): ${outofstockSkus.slice(0, 10).join(', ')}${outofstockSkus.length > 10 ? ` ...等${outofstockSkus.length}个` : ''}`);
          }

          const failedSkus = details.filter(d => d.action === 'failed').map(d => `${d.sku}(${d.error || '未知'})`);
          if (failedSkus.length > 0) {
            changedSiteDetails.push(`> ⚠️ 失败(${failedSkus.length}): ${failedSkus.slice(0, 5).join(', ')}${failedSkus.length > 5 ? ` ...等${failedSkus.length}个` : ''}`);
          }
        }

        const siteDetails: string[] = [...changedSiteDetails];
        if (unchangedSiteNames.length > 0) {
          siteDetails.push(`\n**✅ 无变化站点 (${unchangedSiteNames.length}个)**`);
          siteDetails.push(`> ${unchangedSiteNames.join(', ')}`);
        }

        const content = [
          `**检测SKU数**: ${totalStats.total_checked}`,
          `**同步为有货**: ${totalStats.total_synced_to_instock}`,
          `**同步为无货**: ${totalStats.total_synced_to_outofstock}`,
          `**失败**: ${totalStats.total_failed}`,
          `**耗时**: ${(totalStats.duration_ms / 1000 / 60).toFixed(1)}分钟`,
          ...siteDetails,
        ].join('\n');

        const title = status === 'success' ? '库存自动同步完成'
          : status === 'partial' ? '库存自动同步部分失败'
          : status === 'no_changes' ? '库存自动同步无变化'
          : '库存自动同步失败';

        await sendWechatNotification(
          config.wechat_webhook_url,
          title,
          content,
          status === 'success' || status === 'no_changes'
        );
      }
    }

    console.log(`[Dispatcher ${logId}] 批次完成通知已发送，状态: ${status}`);

  } catch (error) {
    console.error(`[Dispatcher ${logId}] 完成批次失败:`, error);
  }
}

// 主处理函数（Vercel Cron 触发）
export async function GET(_request: NextRequest) {
  const logId = crypto.randomUUID().slice(0, 8);
  console.log(`[Dispatcher ${logId}] 调度器触发 (Cron)`);

  try {
    // 1. 检查自动同步是否启用（Cron 触发需要检查）
    const config = await getAutoSyncConfigAsync();

    if (!config.enabled) {
      console.log(`[Dispatcher ${logId}] 自动同步已禁用`);
      return NextResponse.json({ success: true, message: '自动同步已禁用', skipped: true });
    }

    if (!config.site_ids || config.site_ids.length === 0) {
      console.log(`[Dispatcher ${logId}] 未配置同步站点`);
      return NextResponse.json({ success: false, error: '未配置同步站点' }, { status: 400 });
    }

    // 2. 查找进行中的批次（未完成且未过期）
    const { data: activeBatches } = await supabase
      .from('sync_batches')
      .select('*')
      .in('status', ['pending', 'fetching', 'syncing'])
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    let batch: SyncBatch | null = activeBatches?.[0] || null;

    // 3. 如果没有进行中的批次，创建新批次
    if (!batch) {
      console.log(`[Dispatcher ${logId}] 创建新批次`);

      // 获取启用的站点 ID
      const { data: sites } = await supabase
        .from('wc_sites')
        .select('id')
        .in('id', config.site_ids)
        .eq('enabled', true);

      const siteIds = sites?.map(s => s.id) || [];

      if (siteIds.length === 0) {
        console.log(`[Dispatcher ${logId}] 没有启用的站点`);
        return NextResponse.json({ success: false, error: '没有启用的站点' }, { status: 400 });
      }

      // 创建批次
      const { data: newBatch, error: createError } = await supabase
        .from('sync_batches')
        .insert({
          status: 'fetching',
          current_step: 0,
          total_sites: siteIds.length,
          site_ids: siteIds,
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 小时后过期
        })
        .select()
        .single();

      if (createError || !newBatch) {
        console.error(`[Dispatcher ${logId}] 创建批次失败:`, createError);
        return NextResponse.json({ success: false, error: '创建批次失败' }, { status: 500 });
      }

      batch = newBatch as SyncBatch;

      // 创建站点结果记录
      const siteResultRecords = siteIds.map((siteId, index) => ({
        batch_id: batch!.id,
        site_id: siteId,
        site_name: '', // 稍后更新
        step_index: index + 1,
        status: 'pending',
      }));

      // 获取站点名称
      const { data: siteNames } = await supabase
        .from('wc_sites')
        .select('id, name')
        .in('id', siteIds);

      const siteNameMap = new Map(siteNames?.map(s => [s.id, s.name]) || []);

      for (const record of siteResultRecords) {
        record.site_name = siteNameMap.get(record.site_id) || '未知站点';
      }

      await supabase.from('sync_site_results').insert(siteResultRecords);

      console.log(`[Dispatcher ${logId}] 新批次创建成功: ${batch.id}, ${siteIds.length} 个站点`);
    }

    // 4. 根据当前步骤执行操作
    const currentStep = batch.current_step;

    if (currentStep === 0) {
      // 步骤 0：拉取 ERP 数据
      const result = await executeStep0(batch.id, logId);

      if (!result.success) {
        // 标记批次失败
        await supabase
          .from('sync_batches')
          .update({
            status: 'failed',
            error_message: result.error,
            completed_at: new Date().toISOString(),
          })
          .eq('id', batch.id);

        return NextResponse.json({
          success: false,
          error: result.error,
          batch_id: batch.id,
          step: 0,
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'ERP 数据拉取完成，等待下次触发执行站点同步',
        batch_id: batch.id,
        step: 0,
        next_step: 1,
      });

    } else if (currentStep <= batch.total_sites) {
      // 步骤 1-N：同步站点
      const result = await triggerSiteSyncInternal(batch.id, currentStep, logId);

      if (!result.success) {
        console.error(`[Dispatcher ${logId}] 站点 ${currentStep} 同步失败: ${result.error}`);
        // 继续下一个站点，不中断整个批次
      }

      // 更新批次进度
      const nextStep = currentStep + 1;
      const isLastSite = nextStep > batch.total_sites;

      if (isLastSite) {
        // 所有站点完成，执行完成逻辑
        await completeBatch(batch, logId);

        return NextResponse.json({
          success: true,
          message: '所有站点同步完成',
          batch_id: batch.id,
          step: currentStep,
          completed: true,
        });
      } else {
        // 更新下一步
        await supabase
          .from('sync_batches')
          .update({ current_step: nextStep })
          .eq('id', batch.id);

        return NextResponse.json({
          success: true,
          message: `站点 ${currentStep} 同步完成`,
          batch_id: batch.id,
          step: currentStep,
          next_step: nextStep,
        });
      }

    } else {
      // 批次已完成但状态未更新，执行完成逻辑
      await completeBatch(batch, logId);

      return NextResponse.json({
        success: true,
        message: '批次已完成',
        batch_id: batch.id,
        completed: true,
      });
    }

  } catch (error) {
    console.error(`[Dispatcher ${logId}] 调度器错误:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '调度器错误',
    }, { status: 500 });
  }
}

// 支持 POST 方法手动触发（跳过启用检查）
export async function POST(_request: NextRequest) {
  const logId = crypto.randomUUID().slice(0, 8);
  console.log(`[Dispatcher ${logId}] 手动触发调度`);

  try {
    // 手动触发不检查 enabled，只检查站点配置
    const config = await getAutoSyncConfigAsync();

    if (!config.site_ids || config.site_ids.length === 0) {
      console.log(`[Dispatcher ${logId}] 未配置同步站点`);
      return NextResponse.json({ success: false, error: '未配置同步站点，请先选择要同步的站点' }, { status: 400 });
    }

    // 2. 查找进行中的批次（未完成且未过期）
    const { data: activeBatches } = await supabase
      .from('sync_batches')
      .select('*')
      .in('status', ['pending', 'fetching', 'syncing'])
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    let batch: SyncBatch | null = activeBatches?.[0] || null;

    // 3. 如果没有进行中的批次，创建新批次
    if (!batch) {
      console.log(`[Dispatcher ${logId}] 创建新批次`);

      // 获取启用的站点 ID
      const { data: sites } = await supabase
        .from('wc_sites')
        .select('id')
        .in('id', config.site_ids)
        .eq('enabled', true);

      const siteIds = sites?.map(s => s.id) || [];

      if (siteIds.length === 0) {
        console.log(`[Dispatcher ${logId}] 没有启用的站点`);
        return NextResponse.json({ success: false, error: '选择的站点都已禁用，请先启用站点' }, { status: 400 });
      }

      // 创建批次
      const { data: newBatch, error: createError } = await supabase
        .from('sync_batches')
        .insert({
          status: 'fetching',
          current_step: 0,
          total_sites: siteIds.length,
          site_ids: siteIds,
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 小时后过期
        })
        .select()
        .single();

      if (createError || !newBatch) {
        console.error(`[Dispatcher ${logId}] 创建批次失败:`, createError);
        return NextResponse.json({ success: false, error: '创建批次失败' }, { status: 500 });
      }

      batch = newBatch as SyncBatch;

      // 创建站点结果记录
      const siteResultRecords = siteIds.map((siteId, index) => ({
        batch_id: batch!.id,
        site_id: siteId,
        site_name: '', // 稍后更新
        step_index: index + 1,
        status: 'pending',
      }));

      // 获取站点名称
      const { data: siteNames } = await supabase
        .from('wc_sites')
        .select('id, name')
        .in('id', siteIds);

      const siteNameMap = new Map(siteNames?.map(s => [s.id, s.name]) || []);

      for (const record of siteResultRecords) {
        record.site_name = siteNameMap.get(record.site_id) || '未知站点';
      }

      await supabase.from('sync_site_results').insert(siteResultRecords);

      console.log(`[Dispatcher ${logId}] 新批次创建成功: ${batch.id}, ${siteIds.length} 个站点`);
    }

    // 4. 根据当前步骤执行操作
    const currentStep = batch.current_step;

    if (currentStep === 0) {
      // 步骤 0：拉取 ERP 数据
      const result = await executeStep0(batch.id, logId);

      if (!result.success) {
        // 标记批次失败
        await supabase
          .from('sync_batches')
          .update({
            status: 'failed',
            error_message: result.error,
            completed_at: new Date().toISOString(),
          })
          .eq('id', batch.id);

        return NextResponse.json({
          success: false,
          error: result.error,
          batch_id: batch.id,
          step: 0,
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'ERP 数据拉取完成，正在准备同步站点',
        batch_id: batch.id,
        step: 0,
        next_step: 1,
      });

    } else if (currentStep <= batch.total_sites) {
      // 步骤 1-N：同步站点
      const result = await triggerSiteSyncInternal(batch.id, currentStep, logId);

      if (!result.success) {
        console.error(`[Dispatcher ${logId}] 站点 ${currentStep} 同步失败: ${result.error}`);
        // 继续下一个站点，不中断整个批次
      }

      // 更新批次进度
      const nextStep = currentStep + 1;
      const isLastSite = nextStep > batch.total_sites;

      if (isLastSite) {
        // 所有站点完成，执行完成逻辑
        await completeBatch(batch, logId);

        return NextResponse.json({
          success: true,
          message: '所有站点同步完成',
          batch_id: batch.id,
          step: currentStep,
          completed: true,
        });
      } else {
        // 更新下一步
        await supabase
          .from('sync_batches')
          .update({ current_step: nextStep })
          .eq('id', batch.id);

        return NextResponse.json({
          success: true,
          message: `站点 ${currentStep} 同步完成`,
          batch_id: batch.id,
          step: currentStep,
          next_step: nextStep,
        });
      }

    } else {
      // 批次已完成但状态未更新，执行完成逻辑
      await completeBatch(batch, logId);

      return NextResponse.json({
        success: true,
        message: '批次已完成',
        batch_id: batch.id,
        completed: true,
      });
    }

  } catch (error) {
    console.error(`[Dispatcher ${logId}] 手动调度错误:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '调度器错误',
    }, { status: 500 });
  }
}
