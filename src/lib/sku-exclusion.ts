/**
 * SKU排除规则
 * 统一管理需要排除的SKU前缀，用于映射、检测、同步等功能
 */

/**
 * 需要排除的SKU前缀列表
 * 这些前缀的SKU不会：
 * 1. 建立SKU映射关系
 * 2. 参与产品检测
 * 3. 参与库存同步
 */
export const EXCLUDED_SKU_PREFIXES = ['AK-LH'];

/**
 * 判断SKU是否应该被排除
 * @param sku SKU代码
 * @returns true表示应该排除，false表示可以处理
 */
export function shouldExcludeSku(sku: string | null | undefined): boolean {
  if (!sku) {
    return false;
  }

  return EXCLUDED_SKU_PREFIXES.some(prefix => sku.startsWith(prefix));
}

/**
 * 从SKU列表中过滤掉需要排除的SKU
 * @param skus SKU列表
 * @returns 过滤后的SKU列表
 */
export function filterExcludedSkus(skus: string[]): string[] {
  return skus.filter(sku => !shouldExcludeSku(sku));
}

/**
 * 获取排除前缀列表（用于显示）
 * @returns 排除前缀数组
 */
export function getExcludedPrefixes(): string[] {
  return [...EXCLUDED_SKU_PREFIXES];
}
