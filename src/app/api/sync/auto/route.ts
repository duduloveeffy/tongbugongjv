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
import { detectProducts } from '@/lib/product-detection';
import { buildMappingIndex, getWooCommerceSkus, type MappingIndex } from '@/lib/h3yun/mapping-service';

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

// 站点筛选配置接口（从 site_filters 表读取）
interface SiteFilterInfo {
  sku_filter: string | null;
  exclude_sku_prefixes: string | null;
  category_filters: string[] | null;
  exclude_warehouses: string | null;
}

// 站点信息接口（通过 JOIN site_filters 获取筛选配置）
// 注意：Supabase JOIN 返回数组，即使是一对一关系
interface SiteInfoRaw {
  id: string;
  name: string;
  url: string;
  api_key: string;
  api_secret: string;
  // Supabase JOIN 返回数组格式
  site_filters: SiteFilterInfo[];
}

// 处理后的站点信息（site_filters 转为单个对象或 null）
interface SiteInfo {
  id: string;
  name: string;
  url: string;
  api_key: string;
  api_secret: string;
  // 关联的筛选配置（从 site_filters 表 JOIN 获取，取第一个元素）
  site_filters: SiteFilterInfo | null;
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

// 同步结果接口
interface SyncResult {
  site_id: string;
  site_name: string;
  total_checked: number;
  synced_to_instock: number;
  synced_to_outofstock: number;
  failed: number;
  skipped: number;
  details: Array<{
    sku: string;
    action: 'to_instock' | 'to_outofstock' | 'failed' | 'skipped';
    error?: string;
  }>;
}

// 计算净可售库存（与 inventory-utils.ts 中的逻辑一致）
function calculateNetStock(item: InventoryItem): number {
  const 可售库存 = Number(item.可售库存) || 0;
  const 缺货 = Number(item.缺货) || 0;
  return 可售库存 - 缺货;
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

// 筛选库存数据
function filterInventoryData(data: InventoryItem[], filters: FilterConfig): InventoryItem[] {
  const { skuFilter, categoryFilter, categoryFilters, hideZeroStock, excludeSkuPrefixes } = filters;

  return data.filter(item => {
    // SKU前缀排除
    if (excludeSkuPrefixes?.trim()) {
      const excludeList = excludeSkuPrefixes.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
      if (excludeList.some(prefix => item.产品代码.toLowerCase().startsWith(prefix.toLowerCase()))) {
        return false;
      }
    }

    // SKU筛选
    if (skuFilter?.trim()) {
      const skuList = skuFilter.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
      const matchesSku = skuList.some(sku =>
        item.产品代码.toLowerCase().includes(sku.toLowerCase()) ||
        item.产品名称.toLowerCase().includes(sku.toLowerCase())
      );
      if (!matchesSku) return false;
    }

    // 品类筛选
    if (categoryFilters?.length > 0) {
      const matchesCategory = categoryFilters.some(filter => {
        const filterLower = filter.toLowerCase();
        return (item.一级品类 || '').toLowerCase().includes(filterLower) ||
               (item.二级品类 || '').toLowerCase().includes(filterLower) ||
               (item.三级品类 || '').toLowerCase().includes(filterLower);
      });
      if (!matchesCategory) return false;
    } else if (categoryFilter && categoryFilter !== '全部') {
      const matchesCategory =
        (item.一级品类 || '').toLowerCase().includes(categoryFilter.toLowerCase()) ||
        (item.二级品类 || '').toLowerCase().includes(categoryFilter.toLowerCase()) ||
        (item.三级品类 || '').toLowerCase().includes(categoryFilter.toLowerCase());
      if (!matchesCategory) return false;
    }

    // 隐藏零库存
    if (hideZeroStock) {
      const netStock = calculateNetStock(item);
      if (netStock <= 0) return false;
    }

    return true;
  });
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
    console.error('[Auto Sync] 发送企业微信通知失败:', error);
    return false;
  }
}

// 使用现有逻辑检测产品状态（直接调用函数，不通过HTTP）
// 与 /sync 页面使用完全相同的逻辑
async function detectProductsDirectly(
  skus: string[],
  siteId: string,
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  logId: string
): Promise<Map<string, { stockStatus: string; isOnline: boolean }>> {
  const results = new Map<string, { stockStatus: string; isOnline: boolean }>();

  try {
    // 直接调用 detectProducts 函数，绕过 HTTP 和中间件
    // 与 /sync 页面使用相同的缓存逻辑
    const data = await detectProducts(siteId, skus, siteUrl, consumerKey, consumerSecret);

    console.log(`[Auto Sync ${logId}] 🔍 detectProducts 原始返回: success=${data.success}, products.length=${data.products?.length || 0}`);
    console.log(`[Auto Sync ${logId}] 🔍 缓存统计: cacheHits=${data.stats.cacheHits}, apiCalls=${data.stats.apiCalls}, notFound=${data.stats.notFound}`);

    if (data.success && data.products) {
      // 🔍 调试：输出每个产品的原始状态
      let instockCount = 0;
      let outofstockCount = 0;
      let otherCount = 0;

      for (const product of data.products) {
        if (product.status !== 'not_found' && product.status !== 'error') {
          results.set(product.sku, {
            stockStatus: product.stockStatus,
            isOnline: product.isOnline,
          });

          if (product.stockStatus === 'instock') instockCount++;
          else if (product.stockStatus === 'outofstock') outofstockCount++;
          else otherCount++;
        }
      }

      console.log(`[Auto Sync ${logId}] 🔍 产品状态分布: instock=${instockCount}, outofstock=${outofstockCount}, other=${otherCount}`);
    }

    console.log(`[Auto Sync ${logId}] 产品检测完成: ${results.size}/${skus.length} 个产品有状态`);
  } catch (error) {
    console.error(`[Auto Sync ${logId}] 产品检测失败:`, error);
  }

  return results;
}

// 使用现有 API 同步单个 SKU
async function syncSkuWithExistingApi(
  sku: string,
  stockStatus: 'instock' | 'outofstock',
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  siteId: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 调用现有的 /api/wc-update-stock API
    // 使用 FormData 格式（与 API 端点期望的格式一致）
    const formData = new FormData();
    formData.append('siteUrl', siteUrl);
    formData.append('consumerKey', consumerKey);
    formData.append('consumerSecret', consumerSecret);
    formData.append('sku', sku);
    formData.append('stockStatus', stockStatus);
    formData.append('siteId', siteId);

    const response = await fetch(`${baseUrl}/api/wc-update-stock`, {
      method: 'POST',
      // 不设置 Content-Type，让 fetch 自动设置 multipart/form-data
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[syncSkuWithExistingApi] 请求失败: URL=${baseUrl}/api/wc-update-stock, status=${response.status}, error=`, errorData);
      return { success: false, error: errorData.error || `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '同步失败' };
  }
}

// 主处理函数
export async function GET(_request: NextRequest) {
  const startTime = Date.now();
  const logId = crypto.randomUUID();
  // 内部 API 调用始终使用 localhost（避免绕到 Vercel 导致认证问题）
  // 开发环境使用环境变量或默认端口 3001
  const baseUrl = process.env.NODE_ENV === 'development'
    ? (process.env.DEV_BASE_URL || 'http://localhost:3000')
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

  console.log(`[Auto Sync ${logId}] 开始自动同步任务`);

  // 创建日志记录
  let log: AutoSyncLog | null = null;

  try {
    // 1. 获取自动同步配置（从 Supabase）
    const config = await getAutoSyncConfigAsync();

    if (!config.enabled) {
      console.log(`[Auto Sync ${logId}] 自动同步已禁用`);
      return NextResponse.json({ success: true, message: '自动同步已禁用', skipped: true });
    }

    if (!config.site_ids || config.site_ids.length === 0) {
      console.log(`[Auto Sync ${logId}] 未配置同步站点`);
      return NextResponse.json({ success: false, error: '未配置同步站点' }, { status: 400 });
    }

    // 创建运行日志
    log = await addAutoSyncLogAsync({
      config_id: config.id,
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'running',
      total_skus_checked: 0,
      skus_synced_to_instock: 0,
      skus_synced_to_outofstock: 0,
      skus_failed: 0,
      sites_processed: null,
      error_message: null,
      notification_sent: false,
      notification_error: null,
    });

    // 2. 获取站点信息（从 Supabase，通过 JOIN site_filters 获取筛选配置）
    const { data: sites, error: sitesError } = await supabase
      .from('wc_sites')
      .select(`
        id, name, url, api_key, api_secret,
        site_filters (
          sku_filter,
          exclude_sku_prefixes,
          category_filters,
          exclude_warehouses
        )
      `)
      .in('id', config.site_ids)
      .eq('enabled', true);

    if (sitesError || !sites || sites.length === 0) {
      console.log(`[Auto Sync ${logId}] 未找到有效站点`);
      return NextResponse.json({ success: false, error: '未找到有效站点' }, { status: 400 });
    }

    // 转换站点数据：将 site_filters 数组转为单个对象（一对一关系）
    const processedSites: SiteInfo[] = (sites as SiteInfoRaw[]).map(s => {
      const filterArr = s.site_filters;
      const filter = (filterArr && filterArr.length > 0) ? filterArr[0] : null;
      return {
        id: s.id,
        name: s.name,
        url: s.url,
        api_key: s.api_key,
        api_secret: s.api_secret,
        site_filters: filter ?? null,
      };
    });

    // 统计有筛选配置的站点数量
    const sitesWithFilters = processedSites.filter(s => {
      const f = s.site_filters;
      return f && (f.sku_filter || f.exclude_sku_prefixes || (f.category_filters && f.category_filters.length > 0) || f.exclude_warehouses);
    }).length;

    console.log(`[Auto Sync ${logId}] 将同步 ${sites.length} 个站点，${sitesWithFilters} 个有筛选配置`);

    // 3. 从氚云拉取库存数据
    console.log(`[Auto Sync ${logId}] 开始从氚云拉取库存数据...`);

    // 先检查环境变量
    const engineCode = env.H3YUN_ENGINE_CODE;
    const engineSecret = env.H3YUN_ENGINE_SECRET;

    if (!engineCode || !engineSecret || !h3yunSchemaConfig.inventorySchemaCode) {
      return NextResponse.json({ success: false, error: '氚云 ERP 配置不完整' }, { status: 500 });
    }

    const h3yunConfig: H3YunConfig = {
      engineCode,
      engineSecret,
      schemaCode: h3yunSchemaConfig.inventorySchemaCode,
      warehouseSchemaCode: h3yunSchemaConfig.warehouseSchemaCode,
      skuMappingSchemaCode: h3yunSchemaConfig.skuMappingSchemaCode,
    };

    const client = createH3YunClient(h3yunConfig);
    const h3yunData = await client.fetchAllInventory(500);
    console.log(`[Auto Sync ${logId}] 获取到 ${h3yunData.length} 条氚云库存记录`);

    // 4. 获取仓库映射
    const warehouseIds = extractUniqueWarehouses(h3yunData);
    const warehouseNameMap = await client.fetchWarehouseNames(warehouseIds);
    const warehouseMappings: WarehouseMapping[] = Array.from(warehouseNameMap.entries())
      .map(([id, name]) => ({ id, name }));

    // 5. 转换数据
    const transformResult = transformH3YunBatch(h3yunData, warehouseMappings);
    if (!transformResult.success || !transformResult.data) {
      return NextResponse.json({ success: false, error: '数据转换失败' }, { status: 500 });
    }

    let inventoryData: InventoryItem[] = transformResult.data;
    console.log(`[Auto Sync ${logId}] 转换后 ${inventoryData.length} 条库存记录`);

    // 6. 全局配置（用于默认值和仓库合并）
    const filters = config.filters as FilterConfig;

    // 全局排除仓库（合并前，影响所有站点）
    if (filters.excludeWarehouses) {
      inventoryData = filterWarehousesBeforeMerge(inventoryData, filters.excludeWarehouses);
      console.log(`[Auto Sync ${logId}] 全局排除仓库后 ${inventoryData.length} 条`);
    }

    // 合并仓库（全局设置，影响所有站点）
    if (filters.isMergedMode) {
      inventoryData = mergeWarehouseData(inventoryData);
      console.log(`[Auto Sync ${logId}] 合并仓库后 ${inventoryData.length} 条`);
    }

    // 🆕 注意：SKU/品类过滤已移至站点级别，每个站点单独过滤
    console.log(`[Auto Sync ${logId}] 全局处理后 ${inventoryData.length} 条库存记录（SKU过滤在站点级别执行）`);

    // 7. 加载 SKU 映射表（与 /sync 页面一致）
    console.log(`[Auto Sync ${logId}] 加载 SKU 映射表...`);
    let mappingIndex: MappingIndex | null = null;

    try {
      const mappingData = await client.fetchSkuMappings();
      if (mappingData && mappingData.length > 0) {
        mappingIndex = buildMappingIndex(mappingData);
        console.log(`[Auto Sync ${logId}] SKU 映射加载成功: ${mappingData.length} 条, 氚云SKU数: ${mappingIndex.h3yunToWoo.size}`);
      } else {
        console.log(`[Auto Sync ${logId}] 映射表为空，使用原始 SKU 模式`);
      }
    } catch (error) {
      console.warn(`[Auto Sync ${logId}] SKU 映射加载失败，将使用原始 SKU:`, error);
    }

    // 8. 为每个站点执行同步
    const allResults: SyncResult[] = [];

    for (const site of processedSites) {
      console.log(`[Auto Sync ${logId}] 开始处理站点: ${site.name}`);

      const siteResult: SyncResult = {
        site_id: site.id,
        site_name: site.name,
        total_checked: 0,
        synced_to_instock: 0,
        synced_to_outofstock: 0,
        failed: 0,
        skipped: 0,
        details: [],
      };

      // 🆕 站点级过滤：合并全局配置和站点配置
      // 站点配置优先，如果站点没配置则使用全局配置（从 site_filters 表读取）
      const sf = site.site_filters; // 站点筛选配置（可能为 null）
      const siteFilters: FilterConfig = {
        isMergedMode: filters.isMergedMode,
        hideZeroStock: filters.hideZeroStock,
        hideNormalStatus: filters.hideNormalStatus,
        showNeedSync: filters.showNeedSync,
        categoryFilter: filters.categoryFilter,
        // 站点级配置覆盖全局配置（从 site_filters 表获取）
        skuFilter: sf?.sku_filter?.trim() || filters.skuFilter,
        excludeSkuPrefixes: sf?.exclude_sku_prefixes?.trim() || filters.excludeSkuPrefixes,
        categoryFilters: (sf?.category_filters && sf.category_filters.length > 0)
          ? sf.category_filters
          : filters.categoryFilters,
        excludeWarehouses: sf?.exclude_warehouses?.trim() || filters.excludeWarehouses,
      };

      console.log(`[Auto Sync ${logId}] 站点 ${site.name} 过滤配置:`, {
        skuFilter: siteFilters.skuFilter ? `"${siteFilters.skuFilter.substring(0, 50)}..."` : '(无)',
        excludeSkuPrefixes: siteFilters.excludeSkuPrefixes ? `"${siteFilters.excludeSkuPrefixes.substring(0, 50)}..."` : '(无)',
        categoryFilters: siteFilters.categoryFilters?.length || 0,
        excludeWarehouses: siteFilters.excludeWarehouses ? `"${siteFilters.excludeWarehouses}"` : '(无)',
      });

      // 🆕 为每个站点单独过滤库存数据
      let siteInventoryData = [...inventoryData]; // 使用已合并仓库的数据副本

      // 应用站点级过滤（SKU筛选、品类筛选、排除前缀）
      siteInventoryData = filterInventoryData(siteInventoryData, siteFilters);
      console.log(`[Auto Sync ${logId}] 站点 ${site.name} 筛选后 ${siteInventoryData.length} 条库存记录`);

      // 获取该站点筛选后的氚云 SKU
      const h3yunSkus = siteInventoryData.map(item => item.产品代码);
      siteResult.total_checked = h3yunSkus.length;

      // 构建 SKU 检测映射（与 /sync 页面一致）
      // WooCommerce SKU → 氚云 SKU（用于检测结果回溯）
      const skuDetectionMap = new Map<string, string>();
      // 氚云 SKU → WooCommerce SKU 列表（用于同步时找到所有需要同步的 WooCommerce SKU）
      const h3yunToWooMap = new Map<string, string[]>();
      let detectionSkus: string[] = [];

      if (mappingIndex) {
        for (const h3yunSku of h3yunSkus) {
          const wooSkus = getWooCommerceSkus(h3yunSku, mappingIndex);
          if (wooSkus.length > 0) {
            // 有映射：使用 WooCommerce SKU 检测
            h3yunToWooMap.set(h3yunSku, wooSkus); // 保存氚云→WooCommerce映射（用于同步）
            for (const wooSku of wooSkus) {
              detectionSkus.push(wooSku);
              skuDetectionMap.set(wooSku, h3yunSku);
            }
          } else {
            // 无映射：使用原始氚云 SKU
            h3yunToWooMap.set(h3yunSku, [h3yunSku]);
            detectionSkus.push(h3yunSku);
            skuDetectionMap.set(h3yunSku, h3yunSku);
          }
        }
        console.log(`[Auto Sync ${logId}] SKU 映射扩展: 原始 ${h3yunSkus.length} → 检测 ${detectionSkus.length}`);
      } else {
        // 无映射表：直接使用原始 SKU
        detectionSkus = [...h3yunSkus];
        h3yunSkus.forEach(sku => {
          skuDetectionMap.set(sku, sku);
          h3yunToWooMap.set(sku, [sku]);
        });
      }

      // 使用现有逻辑检测产品状态（直接调用函数，不通过HTTP）
      // 注意：这里使用映射后的 WooCommerce SKU 进行检测
      const productStatusRaw = await detectProductsDirectly(
        detectionSkus,
        site.id,
        site.url,
        site.api_key,
        site.api_secret,
        logId
      );

      // 将检测结果映射回氚云 SKU
      // 如果一个氚云 SKU 对应多个 WooCommerce SKU，取第一个有效结果
      const productStatus = new Map<string, { stockStatus: string; isOnline: boolean }>();
      for (const [wooSku, status] of productStatusRaw.entries()) {
        const h3yunSku = skuDetectionMap.get(wooSku);
        if (h3yunSku && !productStatus.has(h3yunSku)) {
          productStatus.set(h3yunSku, status);
        }
      }

      console.log(`[Auto Sync ${logId}] 检测结果映射: 原始 ${productStatusRaw.size} → 氚云 ${productStatus.size}`);
      console.log(`[Auto Sync ${logId}] 站点 ${site.name}: ${productStatus.size}/${h3yunSkus.length} 个产品有状态`);

      // 🔍 调试：输出配置的同步方向
      console.log(`[Auto Sync ${logId}] 🔍 同步配置: sync_to_instock=${config.sync_to_instock}, sync_to_outofstock=${config.sync_to_outofstock}`);

      // 🔍 调试：收集需要同步但被跳过的产品
      const debugNeedSync: Array<{sku: string; netStock: number; currentStatus: string; reason: string}> = [];

      // 判断并同步（使用站点级过滤后的数据）
      for (const item of siteInventoryData) {
        const sku = item.产品代码;
        const netStock = calculateNetStock(item);
        const status = productStatus.get(sku);

        if (!status) {
          // 产品在 WooCommerce 中不存在
          siteResult.skipped++;
          siteResult.details.push({ sku, action: 'skipped' });
          continue;
        }

        const currentStockStatus = status.stockStatus;
        let needSync = false;
        let targetStatus: 'instock' | 'outofstock' | null = null;

        // 判断是否需要同步（与 sync-core.ts 中的 calculateSyncNeed 逻辑一致）
        // 需要同步为无货：显示有货但净库存≤0
        if (currentStockStatus === 'instock' && netStock <= 0 && config.sync_to_outofstock) {
          needSync = true;
          targetStatus = 'outofstock';
        }
        // 需要同步为有货：显示无货但净库存>0
        else if (currentStockStatus === 'outofstock' && netStock > 0 && config.sync_to_instock) {
          needSync = true;
          targetStatus = 'instock';
        }

        // 🔍 调试：检测潜在需要同步但未同步的情况
        const potentialNeedToOutofstock = currentStockStatus === 'instock' && netStock <= 0;
        const potentialNeedToInstock = currentStockStatus === 'outofstock' && netStock > 0;

        if (potentialNeedToOutofstock && !needSync) {
          debugNeedSync.push({
            sku,
            netStock,
            currentStatus: currentStockStatus,
            reason: `需要同步为outofstock但config.sync_to_outofstock=${config.sync_to_outofstock}`
          });
        }
        if (potentialNeedToInstock && !needSync) {
          debugNeedSync.push({
            sku,
            netStock,
            currentStatus: currentStockStatus,
            reason: `需要同步为instock但config.sync_to_instock=${config.sync_to_instock}`
          });
        }

        if (!needSync || !targetStatus) {
          siteResult.skipped++;
          siteResult.details.push({ sku, action: 'skipped' });
          continue;
        }

        // 获取需要同步的所有 WooCommerce SKU（支持一对多映射）
        const wooSkusToSync = h3yunToWooMap.get(sku) || [sku];
        let syncSuccessCount = 0;
        let syncFailedCount = 0;
        let lastError = '';

        // 同步所有映射的 WooCommerce SKU（与 /sync 页面一致）
        for (const wooSku of wooSkusToSync) {
          const syncResult = await syncSkuWithExistingApi(
            wooSku,  // 使用 WooCommerce SKU，不是氚云 SKU
            targetStatus,
            site.url,
            site.api_key,
            site.api_secret,
            site.id,
            baseUrl
          );

          if (syncResult.success) {
            syncSuccessCount++;
            console.log(`[Auto Sync ${logId}] ${wooSku} → ${targetStatus === 'instock' ? '有货' : '无货'} ✓`);
          } else {
            syncFailedCount++;
            lastError = syncResult.error || '未知错误';
            console.log(`[Auto Sync ${logId}] ${wooSku} 同步失败: ${lastError}`);
          }

          // 多个 SKU 时添加延迟
          if (wooSkusToSync.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // 统计结果（以氚云 SKU 为单位）
        if (syncSuccessCount > 0 && syncFailedCount === 0) {
          // 全部成功
          if (targetStatus === 'instock') {
            siteResult.synced_to_instock++;
            siteResult.details.push({ sku, action: 'to_instock' });
          } else {
            siteResult.synced_to_outofstock++;
            siteResult.details.push({ sku, action: 'to_outofstock' });
          }
          if (wooSkusToSync.length > 1) {
            console.log(`[Auto Sync ${logId}] ${sku} (${wooSkusToSync.length}个WooSKU) → ${targetStatus === 'instock' ? '有货' : '无货'} ✓`);
          }
        } else if (syncSuccessCount > 0) {
          // 部分成功
          siteResult.failed++;
          siteResult.details.push({ sku, action: 'failed', error: `部分成功: ${syncSuccessCount}/${wooSkusToSync.length}` });
          console.log(`[Auto Sync ${logId}] ${sku} 部分同步成功: ${syncSuccessCount}/${wooSkusToSync.length}`);
        } else {
          // 全部失败
          siteResult.failed++;
          siteResult.details.push({ sku, action: 'failed', error: lastError });
        }

        // 添加延迟避免 API 限流
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // 🔍 调试：输出需要同步但被跳过的产品
      if (debugNeedSync.length > 0) {
        console.log(`[Auto Sync ${logId}] 🚨 发现 ${debugNeedSync.length} 个产品需要同步但被配置跳过:`);
        debugNeedSync.forEach(item => {
          console.log(`[Auto Sync ${logId}]   - ${item.sku}: netStock=${item.netStock}, 当前状态=${item.currentStatus}, 原因: ${item.reason}`);
        });
      }

      // 🔍 调试：列出所有状态不一致的产品（需要同步的）
      const needSyncProducts: Array<{sku: string; netStock: number; currentStatus: string; targetStatus: string}> = [];
      for (const item of siteInventoryData) {
        const sku = item.产品代码;
        const netStock = calculateNetStock(item);
        const status = productStatus.get(sku);
        if (!status) continue;

        const currentStockStatus = status.stockStatus;
        // 需要同步为无货：显示有货但净库存≤0
        if (currentStockStatus === 'instock' && netStock <= 0) {
          needSyncProducts.push({ sku, netStock, currentStatus: currentStockStatus, targetStatus: 'outofstock' });
        }
        // 需要同步为有货：显示无货但净库存>0
        else if (currentStockStatus === 'outofstock' && netStock > 0) {
          needSyncProducts.push({ sku, netStock, currentStatus: currentStockStatus, targetStatus: 'instock' });
        }
      }

      if (needSyncProducts.length > 0) {
        console.log(`[Auto Sync ${logId}] 🔍 需要同步的产品列表 (共 ${needSyncProducts.length} 个):`);
        needSyncProducts.forEach(item => {
          console.log(`[Auto Sync ${logId}]   📦 ${item.sku}: netStock=${item.netStock}, 当前=${item.currentStatus} → 应该=${item.targetStatus}`);
        });
      } else {
        console.log(`[Auto Sync ${logId}] ✅ 没有需要同步的产品（所有产品状态都正常）`);
      }

      allResults.push(siteResult);
      console.log(`[Auto Sync ${logId}] 站点 ${site.name} 完成: 有货+${siteResult.synced_to_instock}, 无货+${siteResult.synced_to_outofstock}, 失败${siteResult.failed}, 跳过${siteResult.skipped}`);
    }

    // 8. 计算总体统计
    const totalStats = {
      total_sites: allResults.length,
      total_checked: allResults.reduce((sum, r) => sum + r.total_checked, 0),
      total_synced_to_instock: allResults.reduce((sum, r) => sum + r.synced_to_instock, 0),
      total_synced_to_outofstock: allResults.reduce((sum, r) => sum + r.synced_to_outofstock, 0),
      total_failed: allResults.reduce((sum, r) => sum + r.failed, 0),
      total_skipped: allResults.reduce((sum, r) => sum + r.skipped, 0),
      duration_ms: Date.now() - startTime,
    };

    const hasChanges = totalStats.total_synced_to_instock > 0 || totalStats.total_synced_to_outofstock > 0;
    const hasFailed = totalStats.total_failed > 0;
    const status = hasFailed ? 'partial' : (hasChanges ? 'success' : 'no_changes');

    // 9. 更新日志
    if (log) {
      await updateAutoSyncLogAsync(log.id, {
        status,
        completed_at: new Date().toISOString(),
        total_skus_checked: totalStats.total_checked,
        skus_synced_to_instock: totalStats.total_synced_to_instock,
        skus_synced_to_outofstock: totalStats.total_synced_to_outofstock,
        skus_failed: totalStats.total_failed,
        sites_processed: allResults as unknown as Record<string, unknown>,
      });
    }

    // 10. 更新配置的最后运行时间
    await saveAutoSyncConfigAsync({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_summary: totalStats,
    });

    // 11. 发送企业微信通知
    if (config.wechat_webhook_url) {
      const shouldNotify =
        (config.notify_on_success && status === 'success') ||
        (config.notify_on_failure && status === 'partial') ||
        (config.notify_on_no_changes && status === 'no_changes');

      if (shouldNotify) {
        // 构建站点详情（以站点为一级分类，列出具体SKU）
        // 有变化的站点
        const changedSiteDetails: string[] = [];
        // 无变化的站点
        const unchangedSiteNames: string[] = [];

        for (const result of allResults) {
          const hasChanges = result.synced_to_instock > 0 || result.synced_to_outofstock > 0 || result.failed > 0;

          if (!hasChanges) {
            // 无变化的站点，收集名称
            unchangedSiteNames.push(result.site_name);
            continue;
          }

          // 有变化的站点，详细列出
          changedSiteDetails.push(`\n**📦 ${result.site_name}**`);

          // 同步为有货的 SKU
          const instockSkus = result.details
            .filter(d => d.action === 'to_instock')
            .map(d => d.sku);
          if (instockSkus.length > 0) {
            changedSiteDetails.push(`> 🟢 有货(${instockSkus.length}): ${instockSkus.slice(0, 10).join(', ')}${instockSkus.length > 10 ? ` ...等${instockSkus.length}个` : ''}`);
          }

          // 同步为无货的 SKU
          const outofstockSkus = result.details
            .filter(d => d.action === 'to_outofstock')
            .map(d => d.sku);
          if (outofstockSkus.length > 0) {
            changedSiteDetails.push(`> 🔴 无货(${outofstockSkus.length}): ${outofstockSkus.slice(0, 10).join(', ')}${outofstockSkus.length > 10 ? ` ...等${outofstockSkus.length}个` : ''}`);
          }

          // 失败的 SKU
          const failedSkus = result.details
            .filter(d => d.action === 'failed')
            .map(d => `${d.sku}(${d.error || '未知'})`);
          if (failedSkus.length > 0) {
            changedSiteDetails.push(`> ⚠️ 失败(${failedSkus.length}): ${failedSkus.slice(0, 5).join(', ')}${failedSkus.length > 5 ? ` ...等${failedSkus.length}个` : ''}`);
          }
        }

        // 合并站点详情
        const siteDetails: string[] = [...changedSiteDetails];

        // 添加无变化的站点列表
        if (unchangedSiteNames.length > 0) {
          siteDetails.push(`\n**✅ 无变化站点 (${unchangedSiteNames.length}个)**`);
          siteDetails.push(`> ${unchangedSiteNames.join(', ')}`);
        }

        const content = [
          `**检测SKU数**: ${totalStats.total_checked}`,
          `**同步为有货**: ${totalStats.total_synced_to_instock}`,
          `**同步为无货**: ${totalStats.total_synced_to_outofstock}`,
          `**失败**: ${totalStats.total_failed}`,
          `**耗时**: ${(totalStats.duration_ms / 1000).toFixed(1)}秒`,
          ...siteDetails,
        ].join('\n');

        const title = status === 'success' ? '库存自动同步完成'
          : status === 'partial' ? '库存自动同步部分失败'
          : status === 'no_changes' ? '库存自动同步无变化'
          : '库存自动同步失败';

        const notificationSent = await sendWechatNotification(
          config.wechat_webhook_url,
          title,
          content,
          status === 'success' || status === 'no_changes'
        );

        if (log) {
          await updateAutoSyncLogAsync(log.id, { notification_sent: notificationSent });
        }
      }
    }

    console.log(`[Auto Sync ${logId}] 自动同步完成，状态: ${status}，耗时: ${totalStats.duration_ms}ms`);

    // 🔍 调试信息汇总
    const debugInfo = {
      filters_applied: {
        isMergedMode: filters.isMergedMode,
        hideZeroStock: filters.hideZeroStock,
        excludeSkuPrefixes: filters.excludeSkuPrefixes,
        excludeWarehouses: filters.excludeWarehouses,
      },
      sync_config: {
        sync_to_instock: config.sync_to_instock,
        sync_to_outofstock: config.sync_to_outofstock,
      },
    };

    return NextResponse.json({
      success: true,
      status,
      stats: totalStats,
      results: allResults,
      debug: debugInfo,
    });

  } catch (error) {
    console.error(`[Auto Sync ${logId}] 自动同步失败:`, error);

    // 更新日志为失败状态
    if (log) {
      await updateAutoSyncLogAsync(log.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : '未知错误',
      });
    }

    // 尝试发送失败通知
    try {
      const config = await getAutoSyncConfigAsync();
      if (config.wechat_webhook_url && config.notify_on_failure) {
        await sendWechatNotification(
          config.wechat_webhook_url,
          '库存自动同步失败',
          `**错误信息**: ${error instanceof Error ? error.message : '未知错误'}`,
          false
        );
      }
    } catch (notifyError) {
      console.error(`[Auto Sync ${logId}] 发送失败通知失败:`, notifyError);
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '自动同步失败',
    }, { status: 500 });
  }
}

// 支持 POST 方法手动触发
export async function POST(_request: NextRequest) {
  return GET(_request);
}