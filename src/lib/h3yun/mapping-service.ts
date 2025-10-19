/**
 * SKU映射服务
 * 负责氚云SKU和WooCommerce SKU之间的双向映射查询
 */

import type { H3YunSkuMappingObject } from './types';

/**
 * SKU映射关系
 */
export interface SkuMappingRelation {
  h3yunSku: string;        // 氚云型号（如 SU-06）
  woocommerceSku: string;  // WooCommerce SKU（如 VS5-1116）
  quantity: number;        // 数量关系
}

/**
 * 映射索引（用于快速查询）
 */
export interface MappingIndex {
  // 氚云SKU → WooCommerce SKU列表（一对多）
  h3yunToWoo: Map<string, SkuMappingRelation[]>;
  // WooCommerce SKU → 氚云SKU（一对一）
  wooToH3yun: Map<string, SkuMappingRelation>;
}

/**
 * 构建映射索引
 * @param mappingData 氚云映射表原始数据
 * @returns 映射索引
 */
export function buildMappingIndex(
  mappingData: H3YunSkuMappingObject[]
): MappingIndex {
  const h3yunToWoo = new Map<string, SkuMappingRelation[]>();
  const wooToH3yun = new Map<string, SkuMappingRelation>();

  console.log(`[Mapping Service] 构建映射索引，共 ${mappingData.length} 条记录`);

  let validCount = 0;
  let skippedCount = 0;

  for (const item of mappingData) {
    const wooSku = item.F0000001?.trim();   // WooCommerce SKU
    const h3yunSku = item.F0000002?.trim(); // 氚云型号
    const quantity = item.F0000003 || 1;    // 数量关系

    if (!wooSku || !h3yunSku) {
      skippedCount++;
      continue;
    }

    const relation: SkuMappingRelation = {
      h3yunSku,
      woocommerceSku: wooSku,
      quantity,
    };

    // 构建氚云 → WooCommerce 映射（支持一对多）
    if (!h3yunToWoo.has(h3yunSku)) {
      h3yunToWoo.set(h3yunSku, []);
    }
    h3yunToWoo.get(h3yunSku)!.push(relation);

    // 构建 WooCommerce → 氚云映射（一对一）
    wooToH3yun.set(wooSku, relation);

    validCount++;
  }

  console.log(`[Mapping Service] 索引构建完成: 有效=${validCount}, 跳过=${skippedCount}`);
  console.log(`[Mapping Service] 氚云SKU数: ${h3yunToWoo.size}, WooCommerce SKU数: ${wooToH3yun.size}`);

  return { h3yunToWoo, wooToH3yun };
}

/**
 * 根据氚云SKU查找对应的所有WooCommerce SKU
 * @param h3yunSku 氚云型号
 * @param index 映射索引
 * @returns WooCommerce SKU列表（一对多）
 */
export function getWooCommerceSkus(
  h3yunSku: string,
  index: MappingIndex
): string[] {
  const relations = index.h3yunToWoo.get(h3yunSku) || [];
  return relations.map(r => r.woocommerceSku);
}

/**
 * 根据WooCommerce SKU查找对应的氚云SKU
 * @param woocommerceSku WooCommerce SKU
 * @param index 映射索引
 * @returns 氚云型号，未找到返回null
 */
export function getH3yunSku(
  woocommerceSku: string,
  index: MappingIndex
): string | null {
  return index.wooToH3yun.get(woocommerceSku)?.h3yunSku || null;
}

/**
 * 检查氚云SKU是否有映射
 * @param h3yunSku 氚云型号
 * @param index 映射索引
 * @returns 是否有映射
 */
export function hasMapping(h3yunSku: string, index: MappingIndex): boolean {
  return index.h3yunToWoo.has(h3yunSku);
}

/**
 * 获取映射统计信息
 * @param index 映射索引
 * @returns 统计信息
 */
export function getMappingStats(index: MappingIndex) {
  return {
    h3yunSkuCount: index.h3yunToWoo.size,
    woocommerceSkuCount: index.wooToH3yun.size,
    totalMappings: Array.from(index.h3yunToWoo.values()).reduce(
      (sum, relations) => sum + relations.length,
      0
    ),
  };
}
