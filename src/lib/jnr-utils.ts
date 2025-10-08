/**
 * JNR 站点配置和销量换算工具
 * 用于 JNR 月报和季报统计
 */

import { extractSpu, type SpuExtractionConfig } from './spu-utils';

// JNR 零售站点列表
export const JNR_RETAIL_SITES = [
  'JNR-FR',
] as const;

// JNR 批发站点列表（目前为空）
export const JNR_WHOLESALE_SITES = [] as const;

// 所有 JNR 站点
export const ALL_JNR_SITES = [
  ...JNR_RETAIL_SITES,
  ...JNR_WHOLESALE_SITES,
] as const;

export type JnrSiteType = 'retail' | 'wholesale';

// 需要特殊换算的 SPU（1个产品 = 10支）
const JNR_CONVERTIBLE_SPUS = ['FX182', 'FL162'] as const;

/**
 * 判断是否为 JNR 站点
 */
export function isJnrSite(siteName: string): boolean {
  const normalizedName = siteName?.toUpperCase().trim();
  return ALL_JNR_SITES.some(site => normalizedName === site || normalizedName.includes(site));
}

/**
 * 获取 JNR 站点类型
 * @returns 'retail' | 'wholesale' | null
 */
export function getJnrSiteType(siteName: string): JnrSiteType | null {
  if (!siteName) return null;

  const normalizedName = siteName.toUpperCase().trim();

  // 检查是否为批发站点
  if (JNR_WHOLESALE_SITES.some(site => normalizedName === site || normalizedName.includes(site))) {
    return 'wholesale';
  }

  // 检查是否为零售站点
  if (JNR_RETAIL_SITES.some(site => normalizedName === site || normalizedName.includes(site))) {
    return 'retail';
  }

  return null;
}

/**
 * 计算 JNR 产品的实际销量（应用换算规则）
 *
 * 换算规则：
 * 1. FX182, FL162: 1个 = 10支
 * 2. 其他产品: 按实际数量（1个 = 1支）
 *
 * @param orderItem 订单项数据
 * @param siteName 站点名称
 * @param spuConfig SPU 提取配置
 * @returns 换算后的实际销量
 */
export function calculateJnrQuantity(
  orderItem: any,
  siteName: string,
  spuConfig: SpuExtractionConfig
): number {
  const siteType = getJnrSiteType(siteName);

  // 如果不是 JNR 站点，返回原始数量
  if (!siteType) {
    return parseInt(orderItem.quantity || 0);
  }

  const spu = extractSpu(orderItem.name || 'Unknown', spuConfig, orderItem.sku);
  const quantity = parseInt(orderItem.quantity || 0);

  // 规则1: FX182 和 FL162 产品（10支/个）
  if (JNR_CONVERTIBLE_SPUS.some(convertibleSpu => spu === convertibleSpu)) {
    return quantity * 10;
  }

  // 规则2: 其他产品（原始数量）
  return quantity;
}

/**
 * 获取销量换算倍数
 * @param spu SPU 名称
 * @param siteType 站点类型（未使用，保持接口一致性）
 * @returns 换算倍数
 */
export function getQuantityMultiplier(spu: string, siteType: JnrSiteType | null): number {
  if (JNR_CONVERTIBLE_SPUS.some(convertibleSpu => spu === convertibleSpu)) {
    return 10;
  }

  return 1;
}

/**
 * 获取换算说明文本
 * @param spu SPU 名称
 * @param siteType 站点类型（未使用，保持接口一致性）
 * @returns 换算说明
 */
export function getQuantityMultiplierLabel(spu: string, siteType: JnrSiteType | null): string | null {
  const multiplier = getQuantityMultiplier(spu, siteType);

  if (multiplier === 1) return null;

  if (JNR_CONVERTIBLE_SPUS.some(convertibleSpu => spu === convertibleSpu)) {
    return '10支/个';
  }

  return null;
}

/**
 * 过滤出 JNR 订单
 */
export function filterJnrOrders(orders: any[]): any[] {
  return orders.filter(order => isJnrSite(order.site_name || ''));
}

/**
 * 过滤出零售站点订单
 */
export function filterRetailOrders(orders: any[]): any[] {
  return orders.filter(order => getJnrSiteType(order.site_name) === 'retail');
}

/**
 * 过滤出批发站点订单
 */
export function filterWholesaleOrders(orders: any[]): any[] {
  return orders.filter(order => getJnrSiteType(order.site_name) === 'wholesale');
}
