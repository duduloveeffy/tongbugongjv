/**
 * Vapsolo 站点配置和销量换算工具
 * 用于 Vapsolo 月报统计
 */

import { extractSpu, type SpuExtractionConfig } from './spu-utils';

// Vapsolo 零售站点列表
export const VAPSOLO_RETAIL_SITES = [
  'vapsolo-us',
  'vapsolo-es',
  'vapsolo-co',
  'vapsolo-de',
  'vapsolo-glo',
  'vapsolo-uk',
  'vapsolo-fr',
] as const;

// Vapsolo 批发站点列表
export const VAPSOLO_WHOLESALE_SITES = [
  'vapsolo-co-wholesale',
  'vapsolo-wholesale',
  'vapsolowholes',
] as const;

// 所有 Vapsolo 站点
export const ALL_VAPSOLO_SITES = [
  ...VAPSOLO_RETAIL_SITES,
  ...VAPSOLO_WHOLESALE_SITES,
] as const;

export type VapsoloSiteType = 'retail' | 'wholesale';

/**
 * 判断是否为 Vapsolo 站点
 */
export function isVapsoloSite(siteName: string): boolean {
  const normalizedName = siteName?.toLowerCase().trim();
  return ALL_VAPSOLO_SITES.some(site => normalizedName === site || normalizedName.includes(site));
}

/**
 * 获取 Vapsolo 站点类型
 * @returns 'retail' | 'wholesale' | null
 */
export function getVapsoloSiteType(siteName: string): VapsoloSiteType | null {
  if (!siteName) return null;

  const normalizedName = siteName.toLowerCase().trim();

  // 检查是否为批发站点
  if (VAPSOLO_WHOLESALE_SITES.some(site => normalizedName === site || normalizedName.includes(site))) {
    return 'wholesale';
  }

  // 检查是否为零售站点
  if (VAPSOLO_RETAIL_SITES.some(site => normalizedName === site || normalizedName.includes(site))) {
    return 'retail';
  }

  return null;
}

/**
 * 计算 Vapsolo 产品的实际销量（应用换算规则）
 *
 * 换算规则：
 * 1. Surprise Box（仅零售站点）: 1个 = 6支
 * 2. 批发站点所有产品: 1个 = 10支
 * 3. 零售站点其他产品: 按实际数量（1个 = 1支）
 *
 * @param orderItem 订单项数据
 * @param siteName 站点名称
 * @param spuConfig SPU 提取配置
 * @returns 换算后的实际销量
 */
export function calculateVapsoloQuantity(
  orderItem: any,
  siteName: string,
  spuConfig: SpuExtractionConfig
): number {
  const siteType = getVapsoloSiteType(siteName);

  // 如果不是 Vapsolo 站点，返回原始数量
  if (!siteType) {
    return parseInt(orderItem.quantity || 0);
  }

  const spu = extractSpu(orderItem.name || 'Unknown', spuConfig, orderItem.sku);
  const quantity = parseInt(orderItem.quantity || 0);

  // 规则1: Surprise Box（仅零售站点，6支/个）
  if (spu === 'Surprise Box') {
    if (siteType === 'retail') {
      return quantity * 6;
    }
    // 批发站点理论上不应该有 Surprise Box，但如果有，按批发规则处理
    return quantity * 10;
  }

  // 规则2: 批发站点所有产品（10支/个）
  if (siteType === 'wholesale') {
    return quantity * 10;
  }

  // 规则3: 零售站点其他产品（原始数量）
  return quantity;
}

/**
 * 获取销量换算倍数
 * @param spu SPU 名称
 * @param siteType 站点类型
 * @returns 换算倍数
 */
export function getQuantityMultiplier(spu: string, siteType: VapsoloSiteType | null): number {
  if (!siteType) return 1;

  if (spu === 'Surprise Box' && siteType === 'retail') {
    return 6;
  }

  if (siteType === 'wholesale') {
    return 10;
  }

  return 1;
}

/**
 * 获取换算说明文本
 * @param spu SPU 名称
 * @param siteType 站点类型
 * @returns 换算说明
 */
export function getQuantityMultiplierLabel(spu: string, siteType: VapsoloSiteType | null): string | null {
  const multiplier = getQuantityMultiplier(spu, siteType);

  if (multiplier === 1) return null;

  if (spu === 'Surprise Box' && siteType === 'retail') {
    return '6支/盒';
  }

  if (siteType === 'wholesale') {
    return '批发 10支';
  }

  return null;
}

/**
 * 过滤出 Vapsolo 订单
 */
export function filterVapsoloOrders(orders: any[]): any[] {
  return orders.filter(order => isVapsoloSite(order.site_name || ''));
}

/**
 * 过滤出零售站点订单
 */
export function filterRetailOrders(orders: any[]): any[] {
  return orders.filter(order => getVapsoloSiteType(order.site_name) === 'retail');
}

/**
 * 过滤出批发站点订单
 */
export function filterWholesaleOrders(orders: any[]): any[] {
  return orders.filter(order => getVapsoloSiteType(order.site_name) === 'wholesale');
}
