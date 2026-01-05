/**
 * 单站点定时同步 API
 *
 * 每个站点独立执行，避免请求链过深导致 508 错误
 * 通过 Vercel Cron 定时触发，每个站点间隔 5 分钟
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createH3YunClient } from '@/lib/h3yun/client';
import { transformH3YunBatch, extractUniqueWarehouses } from '@/lib/h3yun/transformer';
import type { H3YunConfig, WarehouseMapping } from '@/lib/h3yun/types';
import { env } from '@/env';
import { h3yunSchemaConfig } from '@/config/h3yun.config';
import { getAutoSyncConfigAsync } from '@/lib/local-config-store';
import { buildMappingIndex } from '@/lib/h3yun/mapping-service';

// 发送企业微信通知
async function sendWechatNotification(
  webhookUrl: string,
  title: string,
  content: string,
  isSuccess: boolean
): Promise<boolean> {
  console.log(`[SingleSite] 发送企业微信通知: ${title}, webhook=${webhookUrl?.substring(0, 50)}...`);
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

    const responseText = await response.text();
    console.log(`[SingleSite] 企业微信响应: status=${response.status}, body=${responseText.substring(0, 200)}`);
    return response.ok;
  } catch (error) {
    console.error('[SingleSite] 发送企业微信通知失败:', error);
    return false;
  }
}

// 延长超时时间
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

// 计算净库存
function calculateNetStock(item: InventoryItem): number {
  const 可售库存 = Number(item.可售库存) || 0;
  const 缺货 = Number(item.缺货) || 0;
  return 可售库存 - 缺货;
}

// 同步单个 SKU（支持简单产品和变体产品，并更新本地缓存）
async function syncSku(
  sku: string,
  stockStatus: 'instock' | 'outofstock',
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  siteId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanUrl = siteUrl.replace(/\/$/, '');
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // 搜索产品（会返回简单产品或变体产品）
    const searchUrl = `${cleanUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Basic ${auth}` }
    });

    if (!searchResponse.ok) {
      return { success: false, error: `搜索产品失败: HTTP ${searchResponse.status}` };
    }

    const products = await searchResponse.json();
    if (!products || products.length === 0) {
      return { success: false, error: '产品不存在' };
    }

    const product = products[0];

    // 检查是否是变体产品
    const isVariation = product.type === 'variation';

    let updateUrl: string;
    if (isVariation) {
      // 变体产品需要使用变体 API 端点
      const parentId = product.parent_id;
      updateUrl = `${cleanUrl}/wp-json/wc/v3/products/${parentId}/variations/${product.id}`;
    } else {
      // 普通产品使用标准端点
      updateUrl = `${cleanUrl}/wp-json/wc/v3/products/${product.id}`;
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {
      stock_status: stockStatus
    };

    // 设置库存管理方式以确保 stock_status 生效
    if (stockStatus === 'instock') {
      updateData.manage_stock = false;
    } else if (stockStatus === 'outofstock') {
      updateData.manage_stock = true;
      updateData.stock_quantity = 0;
    }

    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });

    if (!updateResponse.ok) {
      return { success: false, error: `更新失败: HTTP ${updateResponse.status}` };
    }

    const updatedProduct = await updateResponse.json();

    // 同步成功后更新本地缓存（与手动同步一致）
    try {
      const cacheUpdateData = {
        stock_status: updatedProduct.stock_status,
        stock_quantity: updatedProduct.stock_quantity,
        manage_stock: updatedProduct.manage_stock,
        synced_at: new Date().toISOString(),
      };

      // 并行更新 products 和 product_variations 表
      await Promise.all([
        supabase
          .from('products')
          .update(cacheUpdateData)
          .eq('site_id', siteId)
          .eq('sku', sku),
        supabase
          .from('product_variations')
          .update(cacheUpdateData)
          .eq('sku', sku)
      ]);
    } catch (cacheError) {
      // 缓存更新失败不影响主流程
      console.warn(`[syncSku] 缓存更新失败: ${sku}`, cacheError);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '同步失败' };
  }
}

// GET: Cron 触发，通过 URL 参数指定站点
export async function GET(request: NextRequest) {
  const logId = crypto.randomUUID().slice(0, 8);
  const siteId = request.nextUrl.searchParams.get('site_id');
  const startedAt = new Date().toISOString();

  console.log(`[SingleSite ${logId}] 开始单站点同步, site_id=${siteId}`);

  if (!siteId) {
    return NextResponse.json({ success: false, error: '缺少 site_id 参数' }, { status: 400 });
  }

  try {
    // 1. 检查自动同步是否启用
    const config = await getAutoSyncConfigAsync();
    if (!config.enabled) {
      console.log(`[SingleSite ${logId}] 自动同步已禁用`);
      return NextResponse.json({ success: true, message: '自动同步已禁用', skipped: true });
    }

    // 2. 获取站点信息
    const { data: site, error: siteError } = await supabase
      .from('wc_sites')
      .select('id, name, url, api_key, api_secret, enabled')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error(`[SingleSite ${logId}] 站点不存在: ${siteId}`);
      return NextResponse.json({ success: false, error: '站点不存在' }, { status: 404 });
    }

    // 2.1 获取站点筛选配置（从 site_filters 表）
    const { data: siteFiltersData } = await supabase
      .from('site_filters')
      .select('sku_filter, exclude_sku_prefixes, category_filters, exclude_warehouses')
      .eq('site_id', siteId)
      .single();

    // 2.2 合并筛选配置：站点配置优先，留空则使用全局配置
    const globalFilters = config.filters || {};
    const mergedFilters = {
      skuFilter: siteFiltersData?.sku_filter || globalFilters.skuFilter || '',
      excludeSkuPrefixes: siteFiltersData?.exclude_sku_prefixes || globalFilters.excludeSkuPrefixes || '',
      categoryFilters: siteFiltersData?.category_filters || globalFilters.categoryFilters || [],
      excludeWarehouses: siteFiltersData?.exclude_warehouses || globalFilters.excludeWarehouses || '',
    };

    console.log(`[SingleSite ${logId}] 筛选配置: SKU白名单=${mergedFilters.skuFilter ? '有' : '无'}, 排除前缀=${mergedFilters.excludeSkuPrefixes ? '有' : '无'}, 品类=${mergedFilters.categoryFilters.length > 0 ? mergedFilters.categoryFilters.join(',') : '全部'}, 排除仓库=${mergedFilters.excludeWarehouses || '无'}`);

    if (!site.enabled) {
      console.log(`[SingleSite ${logId}] 站点 ${site.name} 已禁用`);
      return NextResponse.json({ success: true, message: `站点 ${site.name} 已禁用`, skipped: true });
    }

    console.log(`[SingleSite ${logId}] 同步站点: ${site.name}`);

    // 3. 拉取 ERP 数据
    const engineCode = env.H3YUN_ENGINE_CODE;
    const engineSecret = env.H3YUN_ENGINE_SECRET;

    if (!engineCode || !engineSecret || !h3yunSchemaConfig.inventorySchemaCode) {
      return NextResponse.json({ success: false, error: '氚云配置不完整' }, { status: 500 });
    }

    const h3yunConfig: H3YunConfig = {
      engineCode,
      engineSecret,
      schemaCode: h3yunSchemaConfig.inventorySchemaCode,
      warehouseSchemaCode: h3yunSchemaConfig.warehouseSchemaCode,
      skuMappingSchemaCode: h3yunSchemaConfig.skuMappingSchemaCode,
    };

    const client = createH3YunClient(h3yunConfig);
    console.log(`[SingleSite ${logId}] 拉取 ERP 数据...`);
    const h3yunData = await client.fetchAllInventory(500);
    console.log(`[SingleSite ${logId}] 获取 ${h3yunData.length} 条 ERP 记录`);

    // 4. 获取仓库映射并转换数据
    const warehouseIds = extractUniqueWarehouses(h3yunData);
    const warehouseNameMap = await client.fetchWarehouseNames(warehouseIds);
    const warehouseMappings: WarehouseMapping[] = Array.from(warehouseNameMap.entries())
      .map(([id, name]) => ({ id, name }));

    const transformResult = transformH3YunBatch(h3yunData, warehouseMappings);
    if (!transformResult.success || !transformResult.data) {
      return NextResponse.json({ success: false, error: '数据转换失败' }, { status: 500 });
    }

    let rawInventoryData = transformResult.data as InventoryItem[];

    // 4.1 应用仓库排除（在合并前）
    if (mergedFilters.excludeWarehouses.trim()) {
      const excludeWarehouseList = mergedFilters.excludeWarehouses
        .split(/[,，\n]/)
        .map((s: string) => s.trim().toLowerCase())
        .filter((s: string) => s);
      const beforeCount = rawInventoryData.length;
      rawInventoryData = rawInventoryData.filter(item => {
        const warehouse = (item.仓库 || '').toLowerCase();
        return !excludeWarehouseList.some((exc: string) => warehouse.includes(exc));
      });
      console.log(`[SingleSite ${logId}] 仓库排除: ${beforeCount} → ${rawInventoryData.length} 条 (排除: ${excludeWarehouseList.join(',')})`);
    }

    // 5. 合并仓库
    let inventoryData = mergeWarehouseData(rawInventoryData);
    console.log(`[SingleSite ${logId}] 合并后 ${inventoryData.length} 条记录`);

    // 5.1 应用品类筛选（使用 includes 模糊匹配，与手动同步一致）
    if (mergedFilters.categoryFilters.length > 0) {
      const beforeCount = inventoryData.length;
      inventoryData = inventoryData.filter(item => {
        return mergedFilters.categoryFilters.some((filter: string) => {
          const filterLower = filter.toLowerCase();
          return (item.一级品类 || '').toLowerCase().includes(filterLower) ||
                 (item.二级品类 || '').toLowerCase().includes(filterLower) ||
                 (item.三级品类 || '').toLowerCase().includes(filterLower);
        });
      });
      console.log(`[SingleSite ${logId}] 品类筛选: ${beforeCount} → ${inventoryData.length} 条 (品类: ${mergedFilters.categoryFilters.join(',')})`);
    }

    // 5.2 应用 SKU 白名单筛选（同时匹配产品代码和产品名称，与手动同步一致）
    if (mergedFilters.skuFilter.trim()) {
      const skuWhitelist = mergedFilters.skuFilter
        .split(/[,，\n]/)
        .map((s: string) => s.trim().toLowerCase())
        .filter((s: string) => s);
      const beforeCount = inventoryData.length;
      inventoryData = inventoryData.filter(item => {
        const sku = item.产品代码.toLowerCase();
        const name = (item.产品名称 || '').toLowerCase();
        return skuWhitelist.some((filter: string) =>
          sku.includes(filter) || name.includes(filter)
        );
      });
      console.log(`[SingleSite ${logId}] SKU白名单: ${beforeCount} → ${inventoryData.length} 条`);
    }

    // 5.3 应用 SKU 前缀排除
    if (mergedFilters.excludeSkuPrefixes.trim()) {
      const excludeList = mergedFilters.excludeSkuPrefixes
        .split(/[,，\n]/)
        .map((s: string) => s.trim().toLowerCase())
        .filter((s: string) => s);
      const beforeCount = inventoryData.length;
      inventoryData = inventoryData.filter(item => {
        const sku = item.产品代码.toLowerCase();
        return !excludeList.some((prefix: string) => sku.startsWith(prefix));
      });
      console.log(`[SingleSite ${logId}] SKU前缀排除: ${beforeCount} → ${inventoryData.length} 条 (排除: ${excludeList.slice(0, 5).join(',')}${excludeList.length > 5 ? '...' : ''})`);
    }

    // 6. 加载 SKU 映射
    console.log(`[SingleSite ${logId}] 开始加载 SKU 映射...`);
    let skuMappings: Record<string, string[]> = {};
    try {
      const mappingData = await client.fetchSkuMappings();
      console.log(`[SingleSite ${logId}] 获取到 ${mappingData?.length || 0} 条映射原始数据`);
      if (mappingData && mappingData.length > 0) {
        console.log(`[SingleSite ${logId}] 开始构建映射索引...`);
        const mappingIndex = buildMappingIndex(mappingData);
        console.log(`[SingleSite ${logId}] 映射索引构建完成，开始转换为字典...`);
        for (const [h3yunSku, relations] of mappingIndex.h3yunToWoo.entries()) {
          skuMappings[h3yunSku] = relations.map(r => r.woocommerceSku);
        }
        console.log(`[SingleSite ${logId}] SKU 映射加载完成: ${Object.keys(skuMappings).length} 个映射`);
      } else {
        console.log(`[SingleSite ${logId}] 没有 SKU 映射数据`);
      }
    } catch (error) {
      console.warn(`[SingleSite ${logId}] SKU 映射加载失败:`, error);
    }

    // 7. 获取产品缓存状态
    console.log(`[SingleSite ${logId}] 开始查询产品缓存...`);
    const { data: productCache, error: cacheError } = await supabase
      .from('products')
      .select('sku, stock_status')
      .eq('site_id', siteId);

    if (cacheError) {
      console.error(`[SingleSite ${logId}] 产品缓存查询失败:`, cacheError);
    }

    const productStatus = new Map<string, string>();
    productCache?.forEach(p => {
      if (p.sku) productStatus.set(p.sku, p.stock_status);
    });

    console.log(`[SingleSite ${logId}] 产品缓存: ${productStatus.size} 个`);

    // 8. 执行同步
    console.log(`[SingleSite ${logId}] 同步配置: sync_to_instock=${config.sync_to_instock}, sync_to_outofstock=${config.sync_to_outofstock}`);

    let syncedToInstock = 0;
    let syncedToOutofstock = 0;
    let skipped = 0;
    let failed = 0;
    const details: Array<{ sku: string; action: string; error?: string }> = [];

    // 诊断：检查特定 SKU
    const debugSkus = ['SU-01', 'VS2-01', 'VS5-01'];
    for (const debugSku of debugSkus) {
      const inInventory = inventoryData.find(i => i.产品代码 === debugSku);
      const inMapping = skuMappings[debugSku];
      const inCache = productStatus.get(debugSku);
      console.log(`[SingleSite ${logId}] 诊断 ${debugSku}: 库存=${inInventory ? calculateNetStock(inInventory) : '无'}, 映射=${inMapping ? inMapping.join(',') : '无'}, 缓存状态=${inCache || '无'}`);
    }

    for (const item of inventoryData) {
      const sku = item.产品代码;
      const netStock = calculateNetStock(item);

      // 获取映射的 WooCommerce SKU
      const wooSkus = skuMappings[sku] || [sku];

      for (const wooSku of wooSkus) {
        const currentStatus = productStatus.get(wooSku);

        if (!currentStatus) {
          skipped++;
          continue;
        }

        let needSync = false;
        let targetStatus: 'instock' | 'outofstock' | null = null;

        if (currentStatus === 'instock' && netStock <= 0 && config.sync_to_outofstock) {
          needSync = true;
          targetStatus = 'outofstock';
        } else if (currentStatus === 'outofstock' && netStock > 0 && config.sync_to_instock) {
          needSync = true;
          targetStatus = 'instock';
        }

        // 诊断：记录 SU-01 相关的处理
        if (sku === 'SU-01' || wooSku === 'VS2-01' || wooSku === 'VS5-01') {
          console.log(`[SingleSite ${logId}] 处理 ${sku}→${wooSku}: 净库存=${netStock}, WC状态=${currentStatus}, 需同步=${needSync}, 目标=${targetStatus}`);
        }

        if (!needSync || !targetStatus) {
          skipped++;
          continue;
        }

        // 执行同步
        const result = await syncSku(wooSku, targetStatus, site.url, site.api_key, site.api_secret, siteId);

        if (result.success) {
          if (targetStatus === 'instock') {
            syncedToInstock++;
            details.push({ sku: wooSku, action: 'to_instock' });
          } else {
            syncedToOutofstock++;
            details.push({ sku: wooSku, action: 'to_outofstock' });
          }
          console.log(`[SingleSite ${logId}] ${wooSku} → ${targetStatus} ✓`);
        } else {
          failed++;
          details.push({ sku: wooSku, action: 'failed', error: result.error });
          console.error(`[SingleSite ${logId}] ${wooSku} 同步失败: ${result.error}`);
        }
      }
    }

    const completedAt = new Date().toISOString();

    // 9. 更新站点最后同步时间
    await supabase
      .from('wc_sites')
      .update({ last_sync_at: completedAt })
      .eq('id', siteId);

    const summary = {
      site_name: site.name,
      total_checked: inventoryData.length,
      synced_to_instock: syncedToInstock,
      synced_to_outofstock: syncedToOutofstock,
      skipped_count: skipped,
      failed,
    };

    // 10. 记录同步日志到 auto_sync_logs 表
    let status: 'success' | 'partial' | 'no_changes' | 'failed' = 'success';
    if (failed > 0) {
      status = 'partial';
    } else if (syncedToInstock === 0 && syncedToOutofstock === 0) {
      status = 'no_changes';
    }

    try {
      await supabase
        .from('auto_sync_logs')
        .insert({
          config_id: config.id || 'default',
          started_at: startedAt,
          completed_at: completedAt,
          status,
          total_skus_checked: inventoryData.length,
          skus_synced_to_instock: syncedToInstock,
          skus_synced_to_outofstock: syncedToOutofstock,
          skus_failed: failed,
          sites_processed: { [site.name]: summary },
          error_message: null,
          notification_sent: false,
          notification_error: null,
        });
    } catch (logError) {
      console.warn(`[SingleSite ${logId}] 记录日志失败:`, logError);
    }

    // 11. 更新 auto_sync_config 的上次运行信息
    try {
      await supabase
        .from('auto_sync_config')
        .update({
          last_run_at: completedAt,
          last_run_status: status,
          last_run_summary: {
            total_sites: 1,
            total_checked: inventoryData.length,
            total_synced_to_instock: syncedToInstock,
            total_synced_to_outofstock: syncedToOutofstock,
            total_failed: failed,
            total_skipped: skipped,
            duration_ms: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          },
        })
        .eq('name', 'default');
    } catch (configError) {
      console.warn(`[SingleSite ${logId}] 更新配置失败:`, configError);
    }

    // 12. 发送企业微信通知
    console.log(`[SingleSite ${logId}] 企业微信通知配置: webhook=${config.wechat_webhook_url ? '已配置' : '未配置'}, notify_on_success=${config.notify_on_success}, notify_on_failure=${config.notify_on_failure}, notify_on_no_changes=${config.notify_on_no_changes}, status=${status}`);

    if (config.wechat_webhook_url) {
      const shouldNotify =
        (config.notify_on_success && status === 'success') ||
        (config.notify_on_failure && (status === 'partial' || status === 'failed')) ||
        (config.notify_on_no_changes && status === 'no_changes');

      console.log(`[SingleSite ${logId}] shouldNotify=${shouldNotify}`);

      if (shouldNotify) {
        const durationSec = ((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000).toFixed(1);
        const statusText = status === 'success' ? '成功' :
                          status === 'partial' ? '部分失败' :
                          status === 'no_changes' ? '无变化' : '失败';

        const notificationContent = [
          `**站点**: ${site.name}`,
          `**状态**: ${statusText}`,
          `**检测 SKU**: ${inventoryData.length}`,
          `**同步有货**: <font color="info">+${syncedToInstock}</font>`,
          `**同步无货**: <font color="warning">+${syncedToOutofstock}</font>`,
          failed > 0 ? `**失败**: <font color="warning">${failed}</font>` : '',
          `**耗时**: ${durationSec}秒`,
        ].filter(Boolean).join('\n');

        const isSuccess = status === 'success' || status === 'no_changes';
        const notificationSent = await sendWechatNotification(
          config.wechat_webhook_url,
          `库存同步 - ${site.name}`,
          notificationContent,
          isSuccess
        );

        // 更新通知状态到日志
        if (notificationSent) {
          console.log(`[SingleSite ${logId}] 企业微信通知发送成功`);
        } else {
          console.warn(`[SingleSite ${logId}] 企业微信通知发送失败`);
        }
      }
    }

    console.log(`[SingleSite ${logId}] 完成:`, summary);

    return NextResponse.json({
      success: true,
      ...summary,
      details: details.slice(0, 50),
    });

  } catch (error) {
    console.error(`[SingleSite ${logId}] 错误:`, error);

    // 记录失败日志
    try {
      await supabase
        .from('auto_sync_logs')
        .insert({
          config_id: 'default',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: 'failed',
          total_skus_checked: 0,
          skus_synced_to_instock: 0,
          skus_synced_to_outofstock: 0,
          skus_failed: 0,
          sites_processed: null,
          error_message: error instanceof Error ? error.message : '同步失败',
          notification_sent: false,
          notification_error: null,
        });
    } catch (_logError) {
      // 忽略日志记录失败
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '同步失败'
    }, { status: 500 });
  }
}