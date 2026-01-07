/**
 * 单站点同步 API
 *
 * 职责：
 * 1. 从缓存读取 ERP 库存数据
 * 2. 应用站点级筛选配置
 * 3. 检测产品状态
 * 4. 执行库存同步
 * 5. 记录同步结果
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAutoSyncConfigAsync } from '@/lib/local-config-store';
import { detectProducts } from '@/lib/product-detection';
import { runtimeLogger } from '@/lib/runtime-logger';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
    console.error('[Site Sync] 发送企业微信通知失败:', error);
    return false;
  }
}

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

// 站点筛选配置接口
interface SiteFilterInfo {
  sku_filter: string | null;
  exclude_sku_prefixes: string | null;
  category_filters: string[] | null;
  exclude_warehouses: string | null;
}

// 站点信息接口
interface SiteInfo {
  id: string;
  name: string;
  url: string;
  api_key: string;
  api_secret: string;
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

// 同步结果详情
interface SyncDetail {
  sku: string;
  action: 'to_instock' | 'to_outofstock' | 'failed' | 'skipped';
  error?: string;
}

// 计算净可售库存
function calculateNetStock(item: InventoryItem): number {
  const 可售库存 = Number(item.可售库存) || 0;
  const 缺货 = Number(item.缺货) || 0;
  return 可售库存 - 缺货;
}

// 筛选库存数据
function filterInventoryData(data: InventoryItem[], filters: FilterConfig): InventoryItem[] {
  const { skuFilter, categoryFilter, categoryFilters, hideZeroStock, excludeSkuPrefixes, excludeWarehouses } = filters;

  let excludedByWarehouse = 0;
  let excludedBySkuPrefix = 0;

  const filtered = data.filter(item => {
    // 仓库排除
    if (excludeWarehouses?.trim()) {
      const excludeList = excludeWarehouses.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
      if (excludeList.some(warehouse => {
        const itemWarehouse = (item.仓库 || '').trim();
        const excludeWarehouse = warehouse.trim();
        return itemWarehouse === excludeWarehouse || itemWarehouse.includes(excludeWarehouse);
      })) {
        excludedByWarehouse++;
        return false;
      }
    }

    // SKU前缀排除
    if (excludeSkuPrefixes?.trim()) {
      const excludeList = excludeSkuPrefixes.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
      if (excludeList.some(prefix => item.产品代码.toLowerCase().startsWith(prefix.toLowerCase()))) {
        excludedBySkuPrefix++;
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

  console.log(`[Filter] 原始: ${data.length} 条 → 筛选后: ${filtered.length} 条 (仓库排除: ${excludedByWarehouse}, SKU前缀排除: ${excludedBySkuPrefix})`);

  return filtered;
}

// 产品检测结果（包含诊断信息）
interface DetectionResult {
  products: Map<string, { stockStatus: string; isOnline: boolean }>;
  diagnostics: {
    totalSkus: number;
    cacheHits: number;
    apiCalls: number;
    notFound: number;
    withStatus: number;
    // 需要同步的 SKU 详情
    needSyncToInstock: string[];
    needSyncToOutofstock: string[];
  };
}

// 检测产品状态
async function detectProductsDirectly(
  skus: string[],
  siteId: string,
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  logId: string
): Promise<DetectionResult> {
  const results = new Map<string, { stockStatus: string; isOnline: boolean }>();
  const diagnostics = {
    totalSkus: skus.length,
    cacheHits: 0,
    apiCalls: 0,
    notFound: 0,
    withStatus: 0,
    needSyncToInstock: [] as string[],
    needSyncToOutofstock: [] as string[],
  };

  try {
    const data = await detectProducts(siteId, skus, siteUrl, consumerKey, consumerSecret);

    if (data.success && data.products) {
      // 记录缓存统计
      diagnostics.cacheHits = data.stats.cacheHits;
      diagnostics.apiCalls = data.stats.apiCalls;
      diagnostics.notFound = data.stats.notFound;

      for (const product of data.products) {
        if (product.status !== 'not_found' && product.status !== 'error') {
          results.set(product.sku, {
            stockStatus: product.stockStatus,
            isOnline: product.isOnline,
          });
          diagnostics.withStatus++;
        }
      }
    }

    console.log(`[Site Sync ${logId}] 产品检测完成: ${results.size}/${skus.length} 个产品有状态, 缓存命中: ${diagnostics.cacheHits}, API调用: ${diagnostics.apiCalls}`);
  } catch (error) {
    console.error(`[Site Sync ${logId}] 产品检测失败:`, error);
  }

  return { products: results, diagnostics };
}

// 同步单个 SKU
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
    const formData = new FormData();
    formData.append('siteUrl', siteUrl);
    formData.append('consumerKey', consumerKey);
    formData.append('consumerSecret', consumerSecret);
    formData.append('sku', sku);
    formData.append('stockStatus', stockStatus);
    formData.append('siteId', siteId);

    const response = await fetch(`${baseUrl}/api/wc-update-stock`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '同步失败' };
  }
}

// 主处理函数
export async function POST(request: NextRequest) {
  const logId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { batch_id, site_index } = body;

    if (!batch_id || !site_index) {
      runtimeLogger.error('SiteSync', '缺少必要参数', { batch_id, site_index });
      return NextResponse.json({ success: false, error: '缺少 batch_id 或 site_index' }, { status: 400 });
    }

    console.log(`[Site Sync ${logId}] 开始同步批次 ${batch_id} 的站点 ${site_index}`);
    runtimeLogger.info('SiteSync', `开始同步批次 ${batch_id} 的站点 ${site_index}`, { logId });

    // 1. 获取批次信息
    const { data: batch, error: batchError } = await supabase
      .from('sync_batches')
      .select('*')
      .eq('id', batch_id)
      .single();

    if (batchError || !batch) {
      runtimeLogger.error('SiteSync', `批次不存在: ${batch_id}`, { batchError });
      return NextResponse.json({ success: false, error: '批次不存在' }, { status: 404 });
    }
    runtimeLogger.info('SiteSync', `获取批次成功`, { batch_id, cache_key: batch.cache_key });

    // 2. 获取缓存数据
    const { data: cache, error: cacheError } = await supabase
      .from('inventory_cache')
      .select('*')
      .eq('batch_id', batch_id)
      .single();

    if (cacheError || !cache) {
      runtimeLogger.error('SiteSync', `缓存数据不存在: ${batch_id}`, { cacheError });
      return NextResponse.json({ success: false, error: '缓存数据不存在' }, { status: 404 });
    }
    const inventoryCount = Array.isArray(cache.inventory_data) ? cache.inventory_data.length : 0;
    runtimeLogger.info('SiteSync', `获取缓存成功: ${inventoryCount} 条库存数据`);

    // 3. 获取站点结果记录
    const { data: siteResult, error: siteResultError } = await supabase
      .from('sync_site_results')
      .select('*')
      .eq('batch_id', batch_id)
      .eq('step_index', site_index)
      .single();

    if (siteResultError || !siteResult) {
      runtimeLogger.error('SiteSync', '站点结果记录不存在', { batch_id, site_index, siteResultError });
      return NextResponse.json({ success: false, error: '站点结果记录不存在' }, { status: 404 });
    }

    // 4. 获取站点信息（包含筛选配置）
    const { data: siteData, error: siteError } = await supabase
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
      .eq('id', siteResult.site_id)
      .single();

    if (siteError || !siteData) {
      runtimeLogger.error('SiteSync', '站点不存在', { site_id: siteResult.site_id, siteError });
      // 更新结果为失败
      await supabase
        .from('sync_site_results')
        .update({
          status: 'failed',
          error_message: '站点不存在',
          completed_at: new Date().toISOString(),
        })
        .eq('id', siteResult.id);

      return NextResponse.json({ success: false, error: '站点不存在' }, { status: 404 });
    }

    runtimeLogger.info('SiteSync', `获取站点信息成功: ${siteData.name}`, { site_id: siteData.id, url: siteData.url });

    // 转换站点数据
    // site_filters 可能是对象（一对一关系）或数组（一对多关系）或 null
    const rawFilters = (siteData as any).site_filters;
    let siteFilterInfo: SiteFilterInfo | null = null;

    if (rawFilters) {
      if (Array.isArray(rawFilters)) {
        // 一对多关系，取第一个
        siteFilterInfo = rawFilters.length > 0 ? rawFilters[0] : null;
      } else {
        // 一对一关系，直接使用对象
        siteFilterInfo = rawFilters as SiteFilterInfo;
      }
    }

    console.log(`[Site Sync ${logId}] 站点筛选配置原始数据:`, {
      rawFilters: rawFilters ? (Array.isArray(rawFilters) ? `数组[${rawFilters.length}]` : '对象') : 'null',
      siteFilterInfo: siteFilterInfo ? {
        exclude_warehouses: siteFilterInfo.exclude_warehouses?.substring(0, 30) || '(无)',
        exclude_sku_prefixes: siteFilterInfo.exclude_sku_prefixes?.substring(0, 30) || '(无)',
      } : 'null'
    });

    const site: SiteInfo = {
      id: siteData.id,
      name: siteData.name,
      url: siteData.url,
      api_key: siteData.api_key,
      api_secret: siteData.api_secret,
      site_filters: siteFilterInfo,
    };

    // 5. 更新结果为运行中
    await supabase
      .from('sync_site_results')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', siteResult.id);

    console.log(`[Site Sync ${logId}] 开始处理站点: ${site.name}`);

    // 6. 获取配置
    const config = await getAutoSyncConfigAsync();
    const globalFilters = cache.filter_config as FilterConfig;

    // 7. 合并全局配置和站点特定筛选配置
    // 全局配置：显示模式、库存状态等
    // 站点配置：SKU筛选、分类筛选、仓库排除等
    const siteSpecificFilters = site.site_filters;
    const siteFilters: FilterConfig = {
      // 使用全局显示配置
      isMergedMode: globalFilters.isMergedMode,
      hideZeroStock: globalFilters.hideZeroStock,
      hideNormalStatus: globalFilters.hideNormalStatus,
      showNeedSync: globalFilters.showNeedSync,
      categoryFilter: globalFilters.categoryFilter,
      // 使用站点特定的筛选配置（如果有）
      skuFilter: siteSpecificFilters?.sku_filter || '',
      excludeSkuPrefixes: siteSpecificFilters?.exclude_sku_prefixes || '',
      categoryFilters: siteSpecificFilters?.category_filters || [],
      excludeWarehouses: siteSpecificFilters?.exclude_warehouses || '',
    };

    console.log(`[Site Sync ${logId}] 站点 ${site.name} 使用站点特定筛选配置:`, {
      skuFilter: siteFilters.skuFilter ? `"${siteFilters.skuFilter.substring(0, 50)}..."` : '(无)',
      excludeSkuPrefixes: siteFilters.excludeSkuPrefixes ? `"${siteFilters.excludeSkuPrefixes.substring(0, 50)}..."` : '(无)',
      categoryFilters: siteFilters.categoryFilters?.length || 0,
      excludeWarehouses: siteFilters.excludeWarehouses ? `"${siteFilters.excludeWarehouses.substring(0, 50)}..."` : '(无)',
    });

    // 8. 过滤库存数据
    const inventoryData = cache.inventory_data as InventoryItem[];
    const siteInventoryData = filterInventoryData(inventoryData, siteFilters);
    console.log(`[Site Sync ${logId}] 站点 ${site.name} 筛选后 ${siteInventoryData.length} 条库存记录`);
    runtimeLogger.info('SiteSync', `筛选后库存记录: ${siteInventoryData.length} 条`, {
      site_name: site.name,
      original_count: inventoryData.length
    });

    // 9. 构建 SKU 映射
    const skuMappings = cache.sku_mappings as Record<string, string[]>;
    const h3yunSkus = siteInventoryData.map(item => item.产品代码);

    // 构建映射
    const skuDetectionMap = new Map<string, string>();
    const h3yunToWooMap = new Map<string, string[]>();
    let detectionSkus: string[] = [];

    if (Object.keys(skuMappings).length > 0) {
      // 有映射表
      for (const h3yunSku of h3yunSkus) {
        const wooSkus = skuMappings[h3yunSku] || [h3yunSku];
        h3yunToWooMap.set(h3yunSku, wooSkus);
        for (const wooSku of wooSkus) {
          detectionSkus.push(wooSku);
          skuDetectionMap.set(wooSku, h3yunSku);
        }
      }
      console.log(`[Site Sync ${logId}] SKU 映射扩展: 原始 ${h3yunSkus.length} → 检测 ${detectionSkus.length}`);
    } else {
      // 无映射表
      detectionSkus = [...h3yunSkus];
      h3yunSkus.forEach(sku => {
        skuDetectionMap.set(sku, sku);
        h3yunToWooMap.set(sku, [sku]);
      });
    }

    // 10. 检测产品状态
    runtimeLogger.info('SiteSync', `开始检测产品状态: ${detectionSkus.length} 个 SKU`, { site_name: site.name });
    const detectionResult = await detectProductsDirectly(
      detectionSkus,
      site.id,
      site.url,
      site.api_key,
      site.api_secret,
      logId
    );
    const productStatusRaw = detectionResult.products;
    const detectionDiagnostics = detectionResult.diagnostics;

    // 映射回氚云 SKU
    const productStatus = new Map<string, { stockStatus: string; isOnline: boolean }>();
    for (const [wooSku, status] of productStatusRaw.entries()) {
      const h3yunSku = skuDetectionMap.get(wooSku);
      if (h3yunSku && !productStatus.has(h3yunSku)) {
        productStatus.set(h3yunSku, status);
      }
    }

    console.log(`[Site Sync ${logId}] 站点 ${site.name}: ${productStatus.size}/${h3yunSkus.length} 个产品有状态`);
    runtimeLogger.info('SiteSync', `产品检测完成: ${productStatus.size}/${h3yunSkus.length} 个产品有状态, 缓存命中: ${detectionDiagnostics.cacheHits}, API调用: ${detectionDiagnostics.apiCalls}`, { site_name: site.name });

    // 11. 执行同步
    const baseUrl = process.env.NODE_ENV === 'development'
      ? (process.env.DEV_BASE_URL || 'http://localhost:3000')
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

    let totalChecked = h3yunSkus.length;
    let syncedToInstock = 0;
    let syncedToOutofstock = 0;
    let failed = 0;
    let skipped = 0;
    const details: SyncDetail[] = [];

    runtimeLogger.info('SiteSync', `开始同步循环: ${siteInventoryData.length} 个库存项`, { site_name: site.name });

    // 用于记录需要同步的 SKU（诊断用）
    const needSyncToInstockSkus: string[] = [];
    const needSyncToOutofstockSkus: string[] = [];

    for (const item of siteInventoryData) {
      const sku = item.产品代码;
      const netStock = calculateNetStock(item);
      const status = productStatus.get(sku);

      if (!status) {
        skipped++;
        details.push({ sku, action: 'skipped' });
        continue;
      }

      const currentStockStatus = status.stockStatus;
      let needSync = false;
      let targetStatus: 'instock' | 'outofstock' | null = null;

      // 需要同步为无货
      if (currentStockStatus === 'instock' && netStock <= 0 && config.sync_to_outofstock) {
        needSync = true;
        targetStatus = 'outofstock';
        needSyncToOutofstockSkus.push(`${sku}(库存${netStock},WC:instock)`);
      }
      // 需要同步为有货
      else if (currentStockStatus === 'outofstock' && netStock > 0 && config.sync_to_instock) {
        needSync = true;
        targetStatus = 'instock';
        needSyncToInstockSkus.push(`${sku}(库存${netStock},WC:outofstock)`);
      }

      if (!needSync || !targetStatus) {
        skipped++;
        details.push({ sku, action: 'skipped' });
        continue;
      }

      // 获取需要同步的所有 WooCommerce SKU
      const wooSkusToSync = h3yunToWooMap.get(sku) || [sku];
      let syncSuccessCount = 0;
      let syncFailedCount = 0;
      let lastError = '';

      for (const wooSku of wooSkusToSync) {
        const syncResult = await syncSkuWithExistingApi(
          wooSku,
          targetStatus,
          site.url,
          site.api_key,
          site.api_secret,
          site.id,
          baseUrl
        );

        if (syncResult.success) {
          syncSuccessCount++;
          console.log(`[Site Sync ${logId}] ${wooSku} → ${targetStatus === 'instock' ? '有货' : '无货'} ✓`);
        } else {
          syncFailedCount++;
          lastError = syncResult.error || '未知错误';
        }

        if (wooSkusToSync.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // 统计结果
      if (syncSuccessCount > 0 && syncFailedCount === 0) {
        if (targetStatus === 'instock') {
          syncedToInstock++;
          details.push({ sku, action: 'to_instock' });
        } else {
          syncedToOutofstock++;
          details.push({ sku, action: 'to_outofstock' });
        }
      } else if (syncSuccessCount > 0) {
        failed++;
        details.push({ sku, action: 'failed', error: `部分成功: ${syncSuccessCount}/${wooSkusToSync.length}` });
      } else {
        failed++;
        details.push({ sku, action: 'failed', error: lastError });
      }

      // 添加延迟避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 记录诊断日志
    if (needSyncToInstockSkus.length > 0 || needSyncToOutofstockSkus.length > 0) {
      console.log(`[Site Sync ${logId}] 需同步为有货: ${needSyncToInstockSkus.join(', ') || '无'}`);
      console.log(`[Site Sync ${logId}] 需同步为无货: ${needSyncToOutofstockSkus.join(', ') || '无'}`);
    }

    // 构建诊断信息
    const diagnosticsData = {
      detection: {
        totalSkus: detectionDiagnostics.totalSkus,
        cacheHits: detectionDiagnostics.cacheHits,
        apiCalls: detectionDiagnostics.apiCalls,
        notFound: detectionDiagnostics.notFound,
        withStatus: detectionDiagnostics.withStatus,
      },
      sync: {
        needSyncToInstock: needSyncToInstockSkus,
        needSyncToOutofstock: needSyncToOutofstockSkus,
      },
      config: {
        sync_to_instock: config.sync_to_instock,
        sync_to_outofstock: config.sync_to_outofstock,
      },
    };

    // 12. 更新结果（包含诊断信息）
    await supabase
      .from('sync_site_results')
      .update({
        status: 'completed',
        total_checked: totalChecked,
        synced_to_instock: syncedToInstock,
        synced_to_outofstock: syncedToOutofstock,
        failed,
        skipped,
        details,
        diagnostics: diagnosticsData,  // 新增诊断信息
        completed_at: new Date().toISOString(),
      })
      .eq('id', siteResult.id);

    console.log(`[Site Sync ${logId}] 站点 ${site.name} 完成: 有货+${syncedToInstock}, 无货+${syncedToOutofstock}, 失败${failed}, 跳过${skipped}`);
    console.log(`[Site Sync ${logId}] 诊断: 缓存命中=${detectionDiagnostics.cacheHits}, API调用=${detectionDiagnostics.apiCalls}, 发现需同步=${needSyncToInstockSkus.length + needSyncToOutofstockSkus.length}`);
    runtimeLogger.info('SiteSync', `站点同步完成: ${site.name}`, {
      有货: syncedToInstock,
      无货: syncedToOutofstock,
      失败: failed,
      跳过: skipped,
      总计: totalChecked,
      缓存命中: detectionDiagnostics.cacheHits,
      API调用: detectionDiagnostics.apiCalls,
    });

    // 13. 发送企业微信通知（手动同步）
    if (config.wechat_webhook_url) {
      const hasChanges = syncedToInstock > 0 || syncedToOutofstock > 0;
      const hasFailed = failed > 0;
      const status = hasFailed ? 'partial' : (hasChanges ? 'success' : 'no_changes');

      const shouldNotify =
        (config.notify_on_success && status === 'success') ||
        (config.notify_on_failure && (status === 'partial' || hasFailed)) ||
        (config.notify_on_no_changes && status === 'no_changes');

      if (shouldNotify) {
        // 构建通知内容
        const contentParts: string[] = [
          `**站点**: ${site.name}`,
          `**检测SKU数**: ${totalChecked}`,
          `**同步为有货**: ${syncedToInstock}`,
          `**同步为无货**: ${syncedToOutofstock}`,
          `**失败**: ${failed}`,
        ];

        // 添加具体 SKU 详情
        const instockSkus = details.filter(d => d.action === 'to_instock').map(d => d.sku);
        if (instockSkus.length > 0) {
          contentParts.push(`\n> 🟢 **有货**: ${instockSkus.slice(0, 10).join(', ')}${instockSkus.length > 10 ? ` ...等${instockSkus.length}个` : ''}`);
        }

        const outofstockSkus = details.filter(d => d.action === 'to_outofstock').map(d => d.sku);
        if (outofstockSkus.length > 0) {
          contentParts.push(`> 🔴 **无货**: ${outofstockSkus.slice(0, 10).join(', ')}${outofstockSkus.length > 10 ? ` ...等${outofstockSkus.length}个` : ''}`);
        }

        const failedSkus = details.filter(d => d.action === 'failed').map(d => `${d.sku}(${d.error || '未知'})`);
        if (failedSkus.length > 0) {
          contentParts.push(`> ⚠️ **失败**: ${failedSkus.slice(0, 5).join(', ')}${failedSkus.length > 5 ? ` ...等${failedSkus.length}个` : ''}`);
        }

        const title = status === 'success' ? '手动库存同步完成'
          : status === 'partial' ? '手动库存同步部分失败'
          : '手动库存同步无变化';

        await sendWechatNotification(
          config.wechat_webhook_url,
          title,
          contentParts.join('\n'),
          status === 'success' || status === 'no_changes'
        );
      }
    }

    // 14. 更新 auto_sync_config 表的 last_run_at 和 last_run_summary（手动同步也记录）
    try {
      const hasChanges = syncedToInstock > 0 || syncedToOutofstock > 0;
      const hasFailed = failed > 0;
      const runStatus = hasFailed ? 'partial' : (hasChanges ? 'success' : 'no_changes');

      await supabase
        .from('auto_sync_config')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: runStatus,
          last_run_summary: {
            site_name: site.name,
            total_checked: totalChecked,
            synced_to_instock: syncedToInstock,
            synced_to_outofstock: syncedToOutofstock,
            failed,
            skipped,
            duration_ms: Date.now() - startTime,
            trigger: 'manual',
          },
        })
        .eq('name', 'default');
      console.log(`[Site Sync ${logId}] 已更新 auto_sync_config 的 last_run_at`);
    } catch (configError) {
      console.warn(`[Site Sync ${logId}] 更新 auto_sync_config 失败:`, configError);
    }

    return NextResponse.json({
      success: true,
      site_name: site.name,
      stats: {
        total_checked: totalChecked,
        synced_to_instock: syncedToInstock,
        synced_to_outofstock: syncedToOutofstock,
        failed,
        skipped,
      },
    });

  } catch (error) {
    console.error(`[Site Sync ${logId}] 错误:`, error);
    runtimeLogger.error('SiteSync', '站点同步失败', {
      logId,
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '站点同步失败',
    }, { status: 500 });
  }
}