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
import { detectProducts } from '@/lib/product-detection';

// 低库存阈值：当 WC 显示有货但本地净库存在 1-10 时，同步具体数量而非状态
const LOW_STOCK_THRESHOLD = 10;

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

// 同步规则接口
interface SyncRules {
  sku_warehouse_rules?: Record<string, string[]>; // SKU前缀 → 允许的仓库列表
  instock_threshold?: Record<string, number>;     // SKU前缀 → 有货阈值
}

/**
 * 检查 SKU 是否匹配规则模式
 * 支持通配符 * 作为后缀匹配
 * 例如: "JNR1802*" 匹配 "JNR1802", "JNR1802A", "JNR1802-123" 等
 */
function matchSkuPattern(sku: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return sku.toUpperCase().startsWith(prefix.toUpperCase());
  }
  return sku.toUpperCase() === pattern.toUpperCase();
}

/**
 * 获取 SKU 匹配的仓库规则
 * @returns 允许的仓库列表，如果没有匹配规则则返回 null（表示不限制）
 */
function getSkuWarehouseRule(sku: string, rules: SyncRules): string[] | null {
  if (!rules.sku_warehouse_rules) return null;

  for (const [pattern, warehouses] of Object.entries(rules.sku_warehouse_rules)) {
    if (matchSkuPattern(sku, pattern)) {
      return warehouses;
    }
  }
  return null;
}

/**
 * 获取 SKU 的有货阈值
 * @returns 自定义阈值，如果没有匹配规则则返回 0（默认：库存>0 即为有货）
 */
function getSkuInstockThreshold(sku: string, rules: SyncRules): number {
  if (!rules.instock_threshold) return 0;

  for (const [pattern, threshold] of Object.entries(rules.instock_threshold)) {
    if (matchSkuPattern(sku, pattern)) {
      return threshold;
    }
  }
  return 0;
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
// stockQuantity: 可选参数，传入时同步具体数量而非仅切换状态
async function syncSku(
  sku: string,
  stockStatus: 'instock' | 'outofstock',
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  siteId: string,
  stockQuantity?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanUrl = siteUrl.replace(/\/$/, '');
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // 搜索产品（会返回简单产品或变体产品）
    const searchUrl = `${cleanUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`;
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    // 🔍 诊断：记录响应详情
    const responseText = await searchResponse.text();
    console.log(`[syncSku 诊断] ${sku} API响应:`, {
      httpStatus: searchResponse.status,
      contentType: searchResponse.headers.get('content-type'),
      bodyLength: responseText.length,
      bodyPreview: responseText.substring(0, 200),
    });

    if (!searchResponse.ok) {
      console.error(`[syncSku 诊断] ${sku} 搜索失败:`, {
        siteUrl: cleanUrl,
        siteId,
        apiKeyPrefix: consumerKey.substring(0, 10),
        httpStatus: searchResponse.status,
        responseBody: responseText.substring(0, 500),
      });
      return { success: false, error: `搜索产品失败: HTTP ${searchResponse.status}` };
    }

    // 解析 JSON
    let products;
    try {
      products = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[syncSku 诊断] ${sku} JSON解析失败:`, {
        error: parseError instanceof Error ? parseError.message : 'Unknown',
        responseBody: responseText.substring(0, 500),
      });
      return { success: false, error: `JSON解析失败` };
    }

    if (!products || products.length === 0) {
      console.error(`[syncSku 诊断] ${sku} 产品不存在:`, {
        siteUrl: cleanUrl,
        siteId,
        apiKeyPrefix: consumerKey.substring(0, 10),
        searchUrl,
        productsType: typeof products,
        productsValue: JSON.stringify(products),
      });
      return { success: false, error: `产品不存在 (站点: ${cleanUrl})` };
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

    // 如果传入了具体库存数量（低库存情况），启用库存管理并设置数量
    if (stockQuantity !== undefined) {
      updateData.manage_stock = true;
      updateData.stock_quantity = stockQuantity;
      // 根据数量自动设置状态
      if (stockQuantity <= 0) {
        updateData.stock_status = 'outofstock';
      } else {
        updateData.stock_status = 'instock';
      }
    } else if (stockStatus === 'instock') {
      // 没有传入具体数量，使用旧逻辑
      // 关闭库存管理，让 stock_status 完全控制库存状态
      updateData.manage_stock = false;
    } else if (stockStatus === 'outofstock') {
      // 设置为缺货时，启用库存管理并设置数量为 0
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

/**
 * 生成批次号（基于 slot=0 的触发时间，同一轮同步共享同一批次号）
 *
 * 原理：根据当前时间和 slot 号，反推 slot=0 的触发时间
 * - slot=0 在 :00 触发，slot=1 在 :05 触发，以此类推
 * - 无论站点多少，同一轮同步的所有站点都使用相同的批次号
 *
 * @param slotIndex 当前槽位号，如果是手动触发则为 null
 * @returns 批次号，格式如 2026010614（北京时间）
 */
function generateBatchId(slotIndex: number | null): string {
  const now = new Date();

  if (slotIndex !== null && slotIndex >= 0) {
    // Cron 触发：反推 slot=0 的触发时间
    // slot=0 在 :00，slot=1 在 :05，...，slot=11 在 :55
    // slot=12 在 :02，slot=13 在 :07，...（第二轮）
    const minutesFromSlot0 = slotIndex * 5;
    const slot0Time = new Date(now.getTime() - minutesFromSlot0 * 60 * 1000);
    // 向下取整到整点
    slot0Time.setMinutes(0, 0, 0);
    // 转北京时间
    const beijingTime = new Date(slot0Time.getTime() + 8 * 60 * 60 * 1000);
    return beijingTime.toISOString().slice(0, 13).replace(/[-T]/g, '');
  } else {
    // 手动触发：使用当前时间的整点
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return 'M' + beijingTime.toISOString().slice(0, 16).replace(/[-T:]/g, '');
  }
}

// GET: Cron 触发，支持 slot（动态）或 site_id（兼容旧版）参数
export async function GET(request: NextRequest) {
  const slotParam = request.nextUrl.searchParams.get('slot');
  const slotIndex = slotParam !== null ? parseInt(slotParam, 10) : null;
  const batchId = generateBatchId(slotIndex); // 批次号：同一轮同步共享
  let siteId = request.nextUrl.searchParams.get('site_id');
  let totalConfiguredSites = 0; // 本批次配置的站点总数
  const startedAt = new Date().toISOString();

  console.log(`[SingleSite ${batchId}] 开始单站点同步, slot=${slotParam}, site_id=${siteId}`);

  try {
    // 1. 检查自动同步是否启用
    const config = await getAutoSyncConfigAsync();
    if (!config.enabled) {
      console.log(`[SingleSite ${batchId}] 自动同步已禁用`);
      return NextResponse.json({ success: true, message: '自动同步已禁用', skipped: true });
    }

    // 1.1 如果使用 slot 参数，动态查询对应站点
    if (slotParam !== null) {
      const slotIndex = parseInt(slotParam, 10);
      if (isNaN(slotIndex) || slotIndex < 0) {
        return NextResponse.json({ success: false, error: 'slot 参数必须是非负整数' }, { status: 400 });
      }

      // 查询所有启用且在配置列表中的站点，按 created_at 排序
      const { data: enabledSites, error: sitesError } = await supabase
        .from('wc_sites')
        .select('id, name, created_at')
        .eq('enabled', true)
        .order('created_at', { ascending: true });

      if (sitesError) {
        console.error(`[SingleSite ${batchId}] 查询站点失败:`, sitesError);
        return NextResponse.json({ success: false, error: '查询站点失败' }, { status: 500 });
      }

      // 筛选出在 auto_sync_config.site_ids 中的站点
      const configuredSites = (enabledSites || []).filter(site =>
        config.site_ids?.includes(site.id)
      );

      totalConfiguredSites = configuredSites.length; // 保存站点总数用于通知
      console.log(`[SingleSite ${batchId}] 动态分配: slot=${slotIndex}, 配置站点数=${configuredSites.length}`);

      // 检查 slot 是否有对应站点
      if (slotIndex >= configuredSites.length) {
        console.log(`[SingleSite ${batchId}] slot ${slotIndex} 无对应站点 (共 ${configuredSites.length} 个站点)`);
        return NextResponse.json({
          success: true,
          message: `slot ${slotIndex} 无对应站点`,
          skipped: true,
          total_configured_sites: configuredSites.length
        });
      }

      // 获取对应槽位的站点
      const targetSite = configuredSites[slotIndex];
      if (!targetSite) {
        return NextResponse.json({ success: true, message: '站点未找到', skipped: true });
      }

      siteId = targetSite.id;
      console.log(`[SingleSite ${batchId}] slot ${slotIndex} → 站点 ${targetSite.name} (${siteId})`);
    }

    // 参数验证
    if (!siteId) {
      return NextResponse.json({ success: false, error: '缺少 site_id 或 slot 参数' }, { status: 400 });
    }

    // 1.2 检查站点是否在配置的同步列表中（兼容直接使用 site_id 的情况）
    if (!config.site_ids || !config.site_ids.includes(siteId)) {
      console.log(`[SingleSite ${batchId}] 站点 ${siteId} 不在同步列表中，跳过`);
      return NextResponse.json({ success: true, message: '站点未启用自动同步', skipped: true });
    }

    // 2. 获取站点信息
    const { data: site, error: siteError } = await supabase
      .from('wc_sites')
      .select('id, name, url, api_key, api_secret, enabled')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error(`[SingleSite ${batchId}] 站点不存在: ${siteId}`);
      return NextResponse.json({ success: false, error: '站点不存在' }, { status: 404 });
    }

    // 2.1 获取站点筛选配置（从 site_filters 表，包含同步规则）
    const { data: siteFiltersData } = await supabase
      .from('site_filters')
      .select('sku_filter, exclude_sku_prefixes, category_filters, exclude_warehouses, sync_rules')
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

    console.log(`[SingleSite ${batchId}] 筛选配置: SKU白名单=${mergedFilters.skuFilter ? '有' : '无'}, 排除前缀=${mergedFilters.excludeSkuPrefixes ? '有' : '无'}, 品类=${mergedFilters.categoryFilters.length > 0 ? mergedFilters.categoryFilters.join(',') : '全部'}, 排除仓库=${mergedFilters.excludeWarehouses || '无'}`);

    if (!site.enabled) {
      console.log(`[SingleSite ${batchId}] 站点 ${site.name} 已禁用`);
      return NextResponse.json({ success: true, message: `站点 ${site.name} 已禁用`, skipped: true });
    }

    // 🔍 诊断：输出完整的站点凭据信息（脱敏）
    console.log(`[SingleSite ${batchId}] ========== 站点凭据诊断 ==========`);
    console.log(`[SingleSite ${batchId}] 站点名称: ${site.name}`);
    console.log(`[SingleSite ${batchId}] 站点ID: ${site.id}`);
    console.log(`[SingleSite ${batchId}] 站点URL: ${site.url}`);
    console.log(`[SingleSite ${batchId}] API Key: ${site.api_key?.substring(0, 15)}...${site.api_key?.slice(-4)}`);
    console.log(`[SingleSite ${batchId}] API Secret: ${site.api_secret?.substring(0, 10)}...${site.api_secret?.slice(-4)}`);
    console.log(`[SingleSite ${batchId}] ===================================`);

    console.log(`[SingleSite ${batchId}] 同步站点: ${site.name}`);

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
    console.log(`[SingleSite ${batchId}] 拉取 ERP 数据...`);
    const h3yunData = await client.fetchAllInventory(500);
    console.log(`[SingleSite ${batchId}] 获取 ${h3yunData.length} 条 ERP 记录`);

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

    // 4.1 解析同步规则
    const syncRules: SyncRules = siteFiltersData?.sync_rules || {};
    const hasSkuWarehouseRules = syncRules.sku_warehouse_rules && Object.keys(syncRules.sku_warehouse_rules).length > 0;
    const hasInstockThresholds = syncRules.instock_threshold && Object.keys(syncRules.instock_threshold).length > 0;

    if (hasSkuWarehouseRules || hasInstockThresholds) {
      console.log(`[SingleSite ${batchId}] 同步规则: 仓库规则=${hasSkuWarehouseRules ? Object.keys(syncRules.sku_warehouse_rules!).join(',') : '无'}, 阈值规则=${hasInstockThresholds ? Object.keys(syncRules.instock_threshold!).join(',') : '无'}`);
    }

    // 4.2 应用 SKU 特定仓库规则（在合并前，只保留特定 SKU 的指定仓库数据）
    if (hasSkuWarehouseRules) {
      const beforeCount = rawInventoryData.length;
      rawInventoryData = rawInventoryData.filter(item => {
        const sku = item.产品代码;
        const allowedWarehouses = getSkuWarehouseRule(sku, syncRules);

        // 如果没有匹配规则，保留所有仓库
        if (!allowedWarehouses) return true;

        // 检查当前仓库是否在允许列表中
        const warehouse = (item.仓库 || '').toLowerCase();
        const isAllowed = allowedWarehouses.some(w => warehouse.includes(w.toLowerCase()));
        return isAllowed;
      });
      console.log(`[SingleSite ${batchId}] SKU仓库规则: ${beforeCount} → ${rawInventoryData.length} 条`);
    }

    // 4.3 应用仓库排除（在合并前）
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
      console.log(`[SingleSite ${batchId}] 仓库排除: ${beforeCount} → ${rawInventoryData.length} 条 (排除: ${excludeWarehouseList.join(',')})`);
    }

    // 5. 合并仓库
    let inventoryData = mergeWarehouseData(rawInventoryData);
    console.log(`[SingleSite ${batchId}] 合并后 ${inventoryData.length} 条记录`);

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
      console.log(`[SingleSite ${batchId}] 品类筛选: ${beforeCount} → ${inventoryData.length} 条 (品类: ${mergedFilters.categoryFilters.join(',')})`);
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
      console.log(`[SingleSite ${batchId}] SKU白名单: ${beforeCount} → ${inventoryData.length} 条`);
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
      console.log(`[SingleSite ${batchId}] SKU前缀排除: ${beforeCount} → ${inventoryData.length} 条 (排除: ${excludeList.slice(0, 5).join(',')}${excludeList.length > 5 ? '...' : ''})`);
    }

    // 6. 加载 SKU 映射
    console.log(`[SingleSite ${batchId}] 开始加载 SKU 映射...`);
    let skuMappings: Record<string, string[]> = {};
    try {
      const mappingData = await client.fetchSkuMappings();
      console.log(`[SingleSite ${batchId}] 获取到 ${mappingData?.length || 0} 条映射原始数据`);
      if (mappingData && mappingData.length > 0) {
        console.log(`[SingleSite ${batchId}] 开始构建映射索引...`);
        const mappingIndex = buildMappingIndex(mappingData);
        console.log(`[SingleSite ${batchId}] 映射索引构建完成，开始转换为字典...`);
        for (const [h3yunSku, relations] of mappingIndex.h3yunToWoo.entries()) {
          skuMappings[h3yunSku] = relations.map(r => r.woocommerceSku);
        }
        console.log(`[SingleSite ${batchId}] SKU 映射加载完成: ${Object.keys(skuMappings).length} 个映射`);
      } else {
        console.log(`[SingleSite ${batchId}] 没有 SKU 映射数据`);
      }
    } catch (error) {
      console.warn(`[SingleSite ${batchId}] SKU 映射加载失败:`, error);
    }

    // 7. 获取产品缓存状态（同时获取库存数量用于低库存同步）
    // 同时查询 products 表和 product_variations 表，确保变体产品也能被找到
    console.log(`[SingleSite ${batchId}] 开始查询产品缓存...`);

    // 查询简单产品
    const { data: productCache, error: cacheError } = await supabase
      .from('products')
      .select('sku, stock_status, stock_quantity')
      .eq('site_id', siteId);

    if (cacheError) {
      console.error(`[SingleSite ${batchId}] 产品缓存查询失败:`, cacheError);
    }

    // 查询变体产品（通过 products 表关联获取 site_id）
    const { data: variationCache, error: variationCacheError } = await supabase
      .from('product_variations')
      .select('sku, stock_status, stock_quantity, product_id, products!inner(site_id)')
      .eq('products.site_id', siteId);

    if (variationCacheError) {
      console.error(`[SingleSite ${batchId}] 变体产品缓存查询失败:`, variationCacheError);
    }

    const productStatus = new Map<string, string>();
    const productQuantity = new Map<string, number | null>(); // WooCommerce 当前库存数量

    // 添加简单产品
    productCache?.forEach(p => {
      if (p.sku) {
        productStatus.set(p.sku, p.stock_status);
        productQuantity.set(p.sku, p.stock_quantity);
      }
    });

    // 添加变体产品
    variationCache?.forEach(v => {
      if (v.sku) {
        productStatus.set(v.sku, v.stock_status);
        productQuantity.set(v.sku, v.stock_quantity);
      }
    });

    console.log(`[SingleSite ${batchId}] 产品缓存: 简单产品=${productCache?.length || 0}, 变体产品=${variationCache?.length || 0}, 总计=${productStatus.size} 个`);

    // 7.1 收集所有需要检测的 WooCommerce SKU
    const allWooSkus: string[] = [];
    for (const item of inventoryData) {
      const sku = item.产品代码;
      const wooSkus = skuMappings[sku] || [sku];
      for (const wooSku of wooSkus) {
        if (!productStatus.has(wooSku) && !allWooSkus.includes(wooSku)) {
          allWooSkus.push(wooSku);
        }
      }
    }

    // 7.2 缓存未命中的 SKU，调用 WC API 查询（与手动同步一致）
    if (allWooSkus.length > 0) {
      console.log(`[SingleSite ${batchId}] 缓存未命中 ${allWooSkus.length} 个SKU，调用 WC API 查询...`);

      // 分批处理，每批 100 个
      const batchSize = 100;
      for (let i = 0; i < allWooSkus.length; i += batchSize) {
        const batch = allWooSkus.slice(i, i + batchSize);

        try {
          const detectResult = await detectProducts(
            siteId,
            batch,
            site.url,
            site.api_key,
            site.api_secret,
            false // 不跳过缓存，让 detectProducts 自动写入缓存
          );

          if (detectResult.success) {
            // 将检测结果加入 productStatus Map
            for (const product of detectResult.products) {
              if (product.status !== 'not_found' && product.status !== 'error') {
                productStatus.set(product.sku, product.stockStatus);
              }
            }
            console.log(`[SingleSite ${batchId}] API 批次 ${Math.floor(i / batchSize) + 1}: 检测 ${batch.length} 个，命中 ${detectResult.products.filter(p => p.status !== 'not_found' && p.status !== 'error').length} 个`);
          }
        } catch (detectError) {
          console.warn(`[SingleSite ${batchId}] API 检测批次失败:`, detectError);
        }

        // 批次间延迟，避免 API 限流
        if (i + batchSize < allWooSkus.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      console.log(`[SingleSite ${batchId}] API 检测完成，产品状态总数: ${productStatus.size} 个`);
    }

    // 7.3 低库存 SKU 实时库存拉取（防超卖）
    // 筛选出 0 < ERP库存 ≤ 10 且 WC 状态为 instock 的 SKU，批量获取 WC 实时库存
    const lowStockSkus: string[] = [];
    for (const item of inventoryData) {
      const sku = item.产品代码;
      const netStock = calculateNetStock(item);
      const instockThreshold = getSkuInstockThreshold(sku, syncRules);

      // 只处理无自定义阈值、低库存、且 WC 状态为 instock 的 SKU
      if (instockThreshold === 0 && netStock > 0 && netStock <= LOW_STOCK_THRESHOLD) {
        const wooSkus = skuMappings[sku] || [sku];
        for (const wooSku of wooSkus) {
          const currentStatus = productStatus.get(wooSku);
          if (currentStatus === 'instock' && !lowStockSkus.includes(wooSku)) {
            lowStockSkus.push(wooSku);
          }
        }
      }
    }

    if (lowStockSkus.length > 0) {
      console.log(`[SingleSite ${batchId}] 低库存 SKU 实时库存拉取: ${lowStockSkus.length} 个`);

      const cleanUrl = site.url.replace(/\/$/, '');
      const auth = Buffer.from(`${site.api_key}:${site.api_secret}`).toString('base64');

      // 收集需要更新到 Supabase 的数据
      const supabaseUpdates: Array<{ sku: string; stock_quantity: number }> = [];

      // 分批处理，每批 20 个（避免 URL 过长）
      const batchSize = 20;
      for (let i = 0; i < lowStockSkus.length; i += batchSize) {
        const batch = lowStockSkus.slice(i, i + batchSize);

        try {
          // 使用 sku 参数批量查询
          const skuParam = batch.join(',');
          const searchUrl = `${cleanUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(skuParam)}&per_page=100`;

          const response = await fetch(searchUrl, {
            headers: { 'Authorization': `Basic ${auth}` }
          });

          if (response.ok) {
            const products = await response.json();
            let updated = 0;
            for (const product of products) {
              if (product.sku && product.stock_quantity !== undefined) {
                productQuantity.set(product.sku, product.stock_quantity);
                supabaseUpdates.push({ sku: product.sku, stock_quantity: product.stock_quantity });
                updated++;
              }
              // 处理变体产品
              if (product.variations && Array.isArray(product.variations)) {
                for (const variation of product.variations) {
                  if (variation.sku && variation.stock_quantity !== undefined) {
                    productQuantity.set(variation.sku, variation.stock_quantity);
                    supabaseUpdates.push({ sku: variation.sku, stock_quantity: variation.stock_quantity });
                    updated++;
                  }
                }
              }
            }
            console.log(`[SingleSite ${batchId}] 低库存批次 ${Math.floor(i / batchSize) + 1}: 查询 ${batch.length} 个，更新 ${updated} 个`);
          }
        } catch (error) {
          console.warn(`[SingleSite ${batchId}] 低库存批次查询失败:`, error);
        }

        // 批次间延迟
        if (i + batchSize < lowStockSkus.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // 批量更新 Supabase 缓存
      if (supabaseUpdates.length > 0) {
        try {
          const updatePromises = supabaseUpdates.map(item =>
            supabase
              .from('products')
              .update({ stock_quantity: item.stock_quantity, synced_at: new Date().toISOString() })
              .eq('site_id', siteId)
              .eq('sku', item.sku)
          );
          await Promise.all(updatePromises);
          console.log(`[SingleSite ${batchId}] 低库存实时库存已同步到 Supabase: ${supabaseUpdates.length} 个`);
        } catch (cacheError) {
          console.warn(`[SingleSite ${batchId}] 低库存缓存更新失败:`, cacheError);
        }
      }

      console.log(`[SingleSite ${batchId}] 低库存实时库存拉取完成`);
    }

    // 8. 执行同步
    console.log(`[SingleSite ${batchId}] 同步配置: sync_to_instock=${config.sync_to_instock}, sync_to_outofstock=${config.sync_to_outofstock}`);

    let syncedToInstock = 0;
    let syncedToOutofstock = 0;
    let syncedQuantity = 0; // 新增：同步具体数量的计数
    let skipped = 0;
    let failed = 0;
    const details: Array<{ sku: string; action: string; quantity?: number; error?: string }> = [];

    // 诊断：检查特定 SKU
    const debugSkus = ['SU-01', 'VS2-01', 'VS5-01'];
    for (const debugSku of debugSkus) {
      const inInventory = inventoryData.find(i => i.产品代码 === debugSku);
      const inMapping = skuMappings[debugSku];
      const inCache = productStatus.get(debugSku);
      console.log(`[SingleSite ${batchId}] 诊断 ${debugSku}: 库存=${inInventory ? calculateNetStock(inInventory) : '无'}, 映射=${inMapping ? inMapping.join(',') : '无'}, 缓存状态=${inCache || '无'}`);
    }

    for (const item of inventoryData) {
      const sku = item.产品代码;
      const netStock = calculateNetStock(item);

      // 获取映射的 WooCommerce SKU
      const wooSkus = skuMappings[sku] || [sku];

      for (const wooSku of wooSkus) {
        const currentStatus = productStatus.get(wooSku);

        if (!currentStatus) {
          // 缓存和 API 都没有找到该产品，跳过
          skipped++;
          continue;
        }

        let needSync = false;
        let targetStatus: 'instock' | 'outofstock' | null = null;
        let syncStockQuantity: number | undefined = undefined; // 低库存时同步具体数量

        // 获取 SKU 的自定义有货阈值（如果没有配置则为 0，即默认 >0 为有货）
        const instockThreshold = getSkuInstockThreshold(sku, syncRules);
        // 判断按阈值规则是否算作"有货"
        const isInStock = netStock > instockThreshold;

        // 判断同步条件（应用自定义阈值）
        if (currentStatus === 'instock' && !isInStock && config.sync_to_outofstock) {
          // 情况1：WC有货但本地库存不足阈值 → 同步为无货
          needSync = true;
          targetStatus = 'outofstock';
        } else if (currentStatus === 'instock' && isInStock && netStock <= LOW_STOCK_THRESHOLD && config.sync_to_outofstock) {
          // 情况2：WC有货且本地有货但低库存(1-10) → 同步具体数量（仅针对无自定义阈值的SKU）
          // 注意：有自定义阈值的 SKU 不做低库存数量同步，因为它们已经用阈值控制了
          if (instockThreshold === 0) {
            // 防超卖：取 ERP 库存和 WC 库存的最小值
            // 因为 WC 可能有客户下单导致库存减少，而 ERP 不会实时同步这个变化
            const wcQuantity = productQuantity.get(wooSku);
            const effectiveQuantity = wcQuantity !== null && wcQuantity !== undefined && wcQuantity < netStock
              ? wcQuantity
              : netStock;

            // 只有当计算出的数量与 WC 当前数量不同时才需要同步
            if (wcQuantity === null || wcQuantity === undefined || effectiveQuantity !== wcQuantity) {
              needSync = true;
              targetStatus = 'instock'; // 保持有货状态，但更新数量
              syncStockQuantity = effectiveQuantity;
            }
          }
        } else if (currentStatus === 'outofstock' && isInStock && config.sync_to_instock) {
          // 情况3：WC无货但本地库存超过阈值 → 同步为有货
          needSync = true;
          targetStatus = 'instock';
        }

        // 诊断：记录 SU-01 相关的处理
        if (sku === 'SU-01' || wooSku === 'VS2-01' || wooSku === 'VS5-01') {
          console.log(`[SingleSite ${batchId}] 处理 ${sku}→${wooSku}: 净库存=${netStock}, WC状态=${currentStatus}, 需同步=${needSync}, 目标=${targetStatus}, 同步数量=${syncStockQuantity ?? '无'}`);
        }

        if (!needSync || !targetStatus) {
          skipped++;
          continue;
        }

        // 执行同步（传入 stockQuantity 参数）
        const result = await syncSku(wooSku, targetStatus, site.url, site.api_key, site.api_secret, siteId, syncStockQuantity);

        if (result.success) {
          if (syncStockQuantity !== undefined) {
            // 低库存数量同步
            syncedQuantity++;
            details.push({ sku: wooSku, action: 'sync_quantity', quantity: syncStockQuantity });
            console.log(`[SingleSite ${batchId}] ${wooSku} → 数量=${syncStockQuantity} ✓`);
          } else if (targetStatus === 'instock') {
            syncedToInstock++;
            details.push({ sku: wooSku, action: 'to_instock' });
            console.log(`[SingleSite ${batchId}] ${wooSku} → ${targetStatus} ✓`);
          } else {
            syncedToOutofstock++;
            details.push({ sku: wooSku, action: 'to_outofstock' });
            console.log(`[SingleSite ${batchId}] ${wooSku} → ${targetStatus} ✓`);
          }
        } else {
          failed++;
          details.push({ sku: wooSku, action: 'failed', error: result.error });
          // 🔍 诊断：同步失败时输出完整上下文
          console.error(`[SingleSite ${batchId}] ========== 同步失败诊断 ==========`);
          console.error(`[SingleSite ${batchId}] SKU: ${wooSku} (ERP: ${sku})`);
          console.error(`[SingleSite ${batchId}] 错误: ${result.error}`);
          console.error(`[SingleSite ${batchId}] 目标状态: ${targetStatus}, 同步数量: ${syncStockQuantity ?? '无'}`);
          console.error(`[SingleSite ${batchId}] ERP净库存: ${netStock}`);
          console.error(`[SingleSite ${batchId}] 缓存状态: ${currentStatus}`);
          console.error(`[SingleSite ${batchId}] 缓存数量: ${productQuantity.get(wooSku) ?? 'null'}`);
          console.error(`[SingleSite ${batchId}] 站点URL: ${site.url}`);
          console.error(`[SingleSite ${batchId}] 站点ID: ${siteId}`);
          console.error(`[SingleSite ${batchId}] SKU映射: ${skuMappings[sku]?.join(',') || '无映射'}`);
          console.error(`[SingleSite ${batchId}] ===================================`);
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
      synced_quantity: syncedQuantity, // 新增：低库存数量同步计数
      skipped_count: skipped,
      failed,
    };

    // 10. 记录同步日志到 auto_sync_logs 表
    let status: 'success' | 'partial' | 'no_changes' | 'failed' = 'success';
    if (failed > 0) {
      status = 'partial';
    } else if (syncedToInstock === 0 && syncedToOutofstock === 0 && syncedQuantity === 0) {
      // 也要考虑 syncedQuantity
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
      console.warn(`[SingleSite ${batchId}] 记录日志失败:`, logError);
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
      console.warn(`[SingleSite ${batchId}] 更新配置失败:`, configError);
    }

    // 12. 发送企业微信通知
    console.log(`[SingleSite ${batchId}] 企业微信通知配置: webhook=${config.wechat_webhook_url ? '已配置' : '未配置'}, notify_on_success=${config.notify_on_success}, notify_on_failure=${config.notify_on_failure}, notify_on_no_changes=${config.notify_on_no_changes}, status=${status}`);

    if (config.wechat_webhook_url) {
      const statusStr = status as string;
      const isFailure = statusStr === 'partial' || statusStr === 'failed';
      const shouldNotify =
        (config.notify_on_success && statusStr === 'success') ||
        (config.notify_on_failure && isFailure) ||
        (config.notify_on_no_changes && statusStr === 'no_changes');

      console.log(`[SingleSite ${batchId}] shouldNotify=${shouldNotify}`);

      if (shouldNotify) {
        const durationSec = ((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000).toFixed(1);
        const statusText = status === 'success' ? '成功' :
                          status === 'partial' ? '部分失败' :
                          status === 'no_changes' ? '无变化' : '失败';

        // 格式化开始时间（北京时间）
        const startTimeBeijing = new Date(new Date(startedAt).getTime() + 8 * 60 * 60 * 1000)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19);

        // 提取同步的 SKU 列表
        const instockSkus = details.filter(d => d.action === 'to_instock').map(d => d.sku);
        const outofstockSkus = details.filter(d => d.action === 'to_outofstock').map(d => d.sku);
        const quantitySkus = details.filter(d => d.action === 'sync_quantity').map(d => `${d.sku}(${d.quantity})`);

        const notificationContent = [
          `**批次号**: ${batchId}`,
          `**开始时间**: ${startTimeBeijing}`,
          `**站点**: ${site.name}`,
          `**槽位**: ${slotParam !== null ? `${slotParam}/${totalConfiguredSites}` : '手动触发'}`,
          `**状态**: ${statusText}`,
          `**检测 SKU**: ${inventoryData.length}`,
          `**同步有货**: <font color="info">+${syncedToInstock}</font>`,
          `**同步无货**: <font color="warning">+${syncedToOutofstock}</font>`,
          syncedQuantity > 0 ? `**同步数量**: <font color="comment">${syncedQuantity}</font>` : '',
          failed > 0 ? `**失败**: <font color="warning">${failed}</font>` : '',
          `**耗时**: ${durationSec}秒`,
          // 显示具体 SKU（最多显示 10 个）
          instockSkus.length > 0 ? `\n> 🟢 **有货 SKU**: ${instockSkus.slice(0, 10).join(', ')}${instockSkus.length > 10 ? ` ...等${instockSkus.length}个` : ''}` : '',
          outofstockSkus.length > 0 ? `> 🔴 **无货 SKU**: ${outofstockSkus.slice(0, 10).join(', ')}${outofstockSkus.length > 10 ? ` ...等${outofstockSkus.length}个` : ''}` : '',
          quantitySkus.length > 0 ? `> 🟠 **数量同步**: ${quantitySkus.slice(0, 10).join(', ')}${quantitySkus.length > 10 ? ` ...等${quantitySkus.length}个` : ''}` : '',
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
          console.log(`[SingleSite ${batchId}] 企业微信通知发送成功`);
        } else {
          console.warn(`[SingleSite ${batchId}] 企业微信通知发送失败`);
        }
      }

      // 13. 本轮同步总结通知（最后一个站点完成时发送）
      const isLastSlot = slotParam !== null && Number(slotParam) === totalConfiguredSites - 1;
      if (isLastSlot && config.notify_on_success) {
        console.log(`[SingleSite ${batchId}] 最后一个站点完成，发送本轮总结通知`);

        // 查询本批次所有站点的同步日志（通过时间范围匹配同一批次）
        // 批次开始时间 = slot=0 触发时间，结束时间 = 当前时间
        const batchStartTime = new Date();
        batchStartTime.setMinutes(0, 0, 0); // 本小时整点

        const { data: batchLogs } = await supabase
          .from('auto_sync_logs')
          .select('*')
          .gte('started_at', batchStartTime.toISOString())
          .lte('completed_at', completedAt)
          .order('started_at', { ascending: true });

        if (batchLogs && batchLogs.length > 0) {
          // 汇总统计
          const totalSites = batchLogs.length;
          const successCount = batchLogs.filter(l => l.status === 'success' || l.status === 'no_changes').length;
          const failedCount = batchLogs.filter(l => l.status === 'failed' || l.status === 'partial').length;
          const totalChecked = batchLogs.reduce((sum, l) => sum + (l.total_skus_checked || 0), 0);
          const totalToInstock = batchLogs.reduce((sum, l) => sum + (l.skus_synced_to_instock || 0), 0);
          const totalToOutofstock = batchLogs.reduce((sum, l) => sum + (l.skus_synced_to_outofstock || 0), 0);
          const totalFailed = batchLogs.reduce((sum, l) => sum + (l.skus_failed || 0), 0);

          // 计算总耗时（从第一个站点开始到最后一个站点结束）
          const firstStartTime = new Date(batchLogs[0].started_at).getTime();
          const lastEndTime = new Date(completedAt).getTime();
          const totalDurationSec = ((lastEndTime - firstStartTime) / 1000).toFixed(1);

          // 站点明细
          const siteDetails = batchLogs.map(log => {
            const siteName = log.sites_processed ? Object.keys(log.sites_processed)[0] : '未知';
            const statusIcon = log.status === 'success' ? '✅' :
                              log.status === 'no_changes' ? '➖' : '❌';
            return `${statusIcon} ${siteName}: +${log.skus_synced_to_instock || 0}/-${log.skus_synced_to_outofstock || 0}`;
          }).join('\n> ');

          const summaryContent = [
            `**批次号**: ${batchId}`,
            `**站点数**: ${totalSites}/${totalConfiguredSites}`,
            `**成功/失败**: ${successCount}/${failedCount}`,
            `**检测 SKU**: ${totalChecked}`,
            `**同步有货**: <font color="info">+${totalToInstock}</font>`,
            `**同步无货**: <font color="warning">-${totalToOutofstock}</font>`,
            totalFailed > 0 ? `**失败**: <font color="warning">${totalFailed}</font>` : '',
            `**总耗时**: ${totalDurationSec}秒`,
            `\n> **站点明细**:\n> ${siteDetails}`,
          ].filter(Boolean).join('\n');

          const allSuccess = failedCount === 0;
          await sendWechatNotification(
            config.wechat_webhook_url,
            `本轮同步总结`,
            summaryContent,
            allSuccess
          );
          console.log(`[SingleSite ${batchId}] 本轮总结通知已发送`);
        }
      }
    }

    console.log(`[SingleSite ${batchId}] 完成:`, summary);

    return NextResponse.json({
      success: true,
      ...summary,
      details: details.slice(0, 50),
    });

  } catch (error) {
    console.error(`[SingleSite ${batchId}] 错误:`, error);

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