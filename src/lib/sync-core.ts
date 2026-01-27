import { toast } from 'sonner';
import type { InventoryItem, MappedResult } from './inventory-utils';
import { calculateNetStock, analyzeMappedResults } from './inventory-utils';
import type { SyncRule } from './sync-rules';
import { calculateSyncAction as calculateSyncActionFromRules } from './sync-rules';

// 同步需求类型
export type SyncNeed = 'to-instock' | 'to-outofstock' | 'to-quantity' | 'none';

// 产品检测结果
export interface ProductDetectionResult {
  sku: string;
  exists: boolean;
  productId?: number;
  name?: string;
  status?: string;
  stockStatus?: string;
  stockQuantity?: number;
  manageStock?: boolean;
  productUrl?: string;
  error?: string;
}

// 站点检测结果 - 扩展 ProductDetectionResult 以兼容旧代码
export interface SiteDetectionResult extends Omit<ProductDetectionResult, 'sku'> {
  siteId: string;
  siteName?: string;
  results?: ProductDetectionResult[];
}

// 同步配置
export interface SyncConfig {
  mode: 'status' | 'quantity' | 'smart';
  rules?: SyncRule[];
  overrideStatus?: 'instock' | 'outofstock' | 'onbackorder';
  overrideQuantity?: number;
  manageStock?: boolean;
}

// 同步结果
export interface SyncResult {
  sku: string;
  siteId: string;
  success: boolean;
  error?: string;
  updatedStatus?: string;
  updatedQuantity?: number;
}

// API 配置
export interface ApiConfig {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

// 站点信息
export interface SiteInfo {
  id: string;
  name: string;
  url: string;
  api_key: string;
  api_secret: string;
  enabled: boolean;
}

/**
 * 计算SKU的同步需求
 * 支持多映射：检查所有映射结果，只要有一个需要同步就返回对应需求
 */
export function calculateSyncNeed(item: InventoryItem): SyncNeed {
  if (!item.productData) return 'none';

  const netStock = calculateNetStock(item);
  const allMappedResults = item.productData.allMappedResults as MappedResult[] | undefined;

  // 如果有多个映射结果，分析所有映射
  if (allMappedResults && allMappedResults.length > 0) {
    const analysis = analyzeMappedResults(allMappedResults, netStock);

    // 优先级：下架 > 数量同步 > 上架
    if (analysis.needSyncToOutofstock.length > 0) {
      return 'to-outofstock';
    }
    if (analysis.needSyncQuantity.length > 0) {
      return 'to-quantity';
    }
    if (analysis.needSyncToInstock.length > 0) {
      return 'to-instock';
    }
    return 'none';
  }

  // 单个结果的逻辑（向后兼容）
  const stockStatus = item.productData.stockStatus;

  // 需要同步为无货：显示有货但净库存≤0
  if (stockStatus === 'instock' && netStock <= 0) {
    return 'to-outofstock';
  }

  // 需要同步为有货：显示无货但净库存>0
  if (stockStatus === 'outofstock' && netStock > 0) {
    return 'to-instock';
  }

  return 'none';
}

/**
 * 批量计算同步需求
 * 返回所有需要同步的 SKU 及其同步类型
 */
export function calculateBatchSyncNeeds(items: InventoryItem[]): Map<string, SyncNeed> {
  const needs = new Map<string, SyncNeed>();

  items.forEach(item => {
    const need = calculateSyncNeed(item);
    if (need !== 'none') {
      needs.set(item.产品代码, need);
    }
  });

  return needs;
}

/**
 * 检测产品在单个站点的状态
 */
export async function detectProductStatus(
  sku: string,
  apiConfig: ApiConfig
): Promise<ProductDetectionResult> {
  try {
    const params = new URLSearchParams({
      siteUrl: apiConfig.siteUrl,
      consumerKey: apiConfig.consumerKey,
      consumerSecret: apiConfig.consumerSecret,
      skus: sku
    });

    const response = await fetch(`/api/wc-products?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`检测失败: HTTP ${response.status}`);
    }

    const products = await response.json();

    if (!products || products.length === 0) {
      return {
        sku,
        exists: false
      };
    }

    const product = products[0];
    return {
      sku,
      exists: true,
      productId: product.id,
      name: product.name,
      status: product.status,
      stockStatus: product.stock_status,
      stockQuantity: product.stock_quantity,
      manageStock: product.manage_stock,
      productUrl: product.permalink
    };
  } catch (error) {
    return {
      sku,
      exists: false,
      error: error instanceof Error ? error.message : '检测失败'
    };
  }
}

/**
 * 批量检测产品状态
 */
export async function batchDetectProducts(
  skus: string[],
  sites: SiteInfo[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, SiteDetectionResult[]>> {
  const results = new Map<string, SiteDetectionResult[]>();

  try {
    const siteIds = sites.map(s => s.id);

    const response = await fetch('/api/wc-products-multi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skus,
        siteIds
      })
    });

    if (!response.ok) {
      throw new Error('批量检测请求失败');
    }

    const data = await response.json();

    if (data.success && data.results) {
      // 转换结果格式
      Object.entries(data.results).forEach(([sku, siteResults]) => {
        results.set(sku, siteResults as SiteDetectionResult[]);
      });
    }

    return results;
  } catch (error) {
    console.error('批量产品检测失败:', error);
    throw error;
  }
}

/**
 * 同步单个SKU到单个站点
 */
export async function syncToSite(
  sku: string,
  siteConfig: ApiConfig | SiteInfo,
  syncConfig: SyncConfig,
  item?: InventoryItem
): Promise<SyncResult> {
  try {
    // 准备API配置
    let apiConfig: ApiConfig;
    let siteId: string;

    if ('api_key' in siteConfig) {
      // SiteInfo 类型
      apiConfig = {
        siteUrl: siteConfig.url,
        consumerKey: siteConfig.api_key,
        consumerSecret: siteConfig.api_secret
      };
      siteId = siteConfig.id;
    } else {
      // ApiConfig 类型
      apiConfig = siteConfig;
      siteId = new URL(apiConfig.siteUrl).hostname;
    }

    // 计算库存值
    let netStock = 0;
    let sellableStock = 0;
    let transitStock = 0;

    if (item) {
      netStock = calculateNetStock(item);
      sellableStock = Number(item.可售库存) || 0;
      transitStock = item.在途库存 || netStock;
    }

    // 确定同步操作
    let stockStatus = syncConfig.overrideStatus || 'instock';
    let quantity = syncConfig.overrideQuantity;
    let manageStock = syncConfig.manageStock;

    if (syncConfig.mode === 'smart' && syncConfig.rules) {
      const action = calculateSyncActionFromRules(
        { netStock, sellableStock, transitStock },
        syncConfig.rules
      );

      if (action) {
        stockStatus = action.stockStatus;
        quantity = action.quantity;
        manageStock = action.manageStock;
      }
    } else if (syncConfig.mode === 'quantity') {
      manageStock = true;
      if (quantity === undefined) {
        quantity = Math.max(0, netStock);
      }
    } else if (syncConfig.mode === 'status') {
      // 状态模式：基于净库存判断
      stockStatus = netStock > 0 ? 'instock' : 'outofstock';
      manageStock = stockStatus === 'outofstock';
    }

    // 调用API
    const params = new URLSearchParams({
      siteUrl: apiConfig.siteUrl,
      consumerKey: apiConfig.consumerKey,
      consumerSecret: apiConfig.consumerSecret,
      sku,
      stockStatus
    });

    const response = await fetch('/api/wc-update-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `同步失败: HTTP ${response.status}`);
    }

    const result = await response.json();

    return {
      sku,
      siteId,
      success: true,
      updatedStatus: stockStatus,
      updatedQuantity: quantity
    };
  } catch (error) {
    return {
      sku,
      siteId: 'api_key' in siteConfig ? siteConfig.id : 'unknown',
      success: false,
      error: error instanceof Error ? error.message : '同步失败'
    };
  }
}

/**
 * 批量同步到多个站点
 */
export async function batchSyncToSites(
  skus: string[],
  sites: SiteInfo[],
  syncConfig: SyncConfig,
  items: InventoryItem[],
  onProgress?: (current: number, total: number) => void
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const totalOperations = skus.length * sites.length;
  let currentOperation = 0;

  // 使用批量API
  for (const sku of skus) {
    const item = items.find(i => i.产品代码 === sku);

    if (!item) {
      continue;
    }

    const netStock = calculateNetStock(item);
    const sellableStock = Number(item.可售库存) || 0;
    const transitStock = item.在途库存 || netStock;

    // 准备站点同步请求
    const sitesToSync = sites.map(site => ({
      siteId: site.id
    }));

    try {
      const response = await fetch('/api/wc-update-stock-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          sites: sitesToSync,
          mode: syncConfig.mode,
          rules: syncConfig.rules,
          overrideStatus: syncConfig.overrideStatus,
          overrideQuantity: syncConfig.overrideQuantity,
          netStock,
          sellableStock,
          transitStock
        })
      });

      if (response.ok) {
        const data = await response.json();

        // 处理每个站点的结果
        data.results.forEach((result: any) => {
          results.push({
            sku,
            siteId: result.siteId,
            success: result.success,
            error: result.error,
            updatedStatus: data.syncAction.stockStatus,
            updatedQuantity: data.syncAction.quantity
          });
        });
      } else {
        // 所有站点失败
        sites.forEach(site => {
          results.push({
            sku,
            siteId: site.id,
            success: false,
            error: '请求失败'
          });
        });
      }
    } catch (error) {
      // 网络错误
      sites.forEach(site => {
        results.push({
          sku,
          siteId: site.id,
          success: false,
          error: error instanceof Error ? error.message : '网络错误'
        });
      });
    }

    currentOperation += sites.length;
    if (onProgress) {
      onProgress(currentOperation, totalOperations);
    }
  }

  return results;
}

/**
 * 格式化同步结果统计
 */
export function formatSyncSummary(results: SyncResult[]): {
  total: number;
  success: number;
  failed: number;
  successRate: string;
  failedSkus: string[];
} {
  const total = results.length;
  const success = results.filter(r => r.success).length;
  const failed = total - success;
  const successRate = total > 0 ? `${Math.round(success / total * 100)}%` : '0%';
  const failedSkus = [...new Set(results.filter(r => !r.success).map(r => r.sku))];

  return {
    total,
    success,
    failed,
    successRate,
    failedSkus
  };
}

/**
 * 验证同步参数
 */
export function validateSyncParams(
  skus: string[],
  sites: SiteInfo[],
  syncConfig: SyncConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!skus || skus.length === 0) {
    errors.push('请选择要同步的SKU');
  }

  if (!sites || sites.length === 0) {
    errors.push('请选择要同步的站点');
  }

  if (sites.length > 10) {
    errors.push('一次最多同步10个站点');
  }

  if (syncConfig.mode === 'smart' && (!syncConfig.rules || syncConfig.rules.length === 0)) {
    errors.push('智能模式需要配置规则');
  }

  if (syncConfig.mode === 'quantity' && syncConfig.overrideQuantity !== undefined) {
    if (syncConfig.overrideQuantity < 0) {
      errors.push('库存数量不能为负数');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}