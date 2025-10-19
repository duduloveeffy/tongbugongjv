/**
 * SKU映射处理器
 * 负责处理WooCommerce SKU和氚云SKU之间的映射关系
 */
import type {
  H3YunSkuMappingObject,
  SkuMapping,
  SkuMappingCache,
  H3YunBizObject,
} from './types';
import type { InventoryItem } from '../inventory-utils';

/**
 * 构建SKU映射缓存
 * @param mappingObjects 氚云SKU映射对象数组
 * @returns SKU映射缓存
 */
export function buildSkuMappingCache(
  mappingObjects: H3YunSkuMappingObject[]
): SkuMappingCache {
  const wooToH3 = new Map<string, SkuMapping[]>();
  const h3ToWoo = new Map<string, SkuMapping[]>();

  console.log(`[SKU Mapping] 开始构建SKU映射缓存，共 ${mappingObjects.length} 条记录`);

  let validMappings = 0;
  let skippedMappings = 0;

  for (const obj of mappingObjects) {
    const woocommerceSku = obj.F0000001?.trim();
    const h3yunSkuId = obj.F0000002?.trim();
    const quantity = obj.F0000003 || 1;

    // 验证必填字段
    if (!woocommerceSku || !h3yunSkuId) {
      skippedMappings++;
      continue;
    }

    const mapping: SkuMapping = {
      woocommerceSku,
      h3yunSkuId,
      quantity,
    };

    // WooCommerce -> H3Yun
    if (!wooToH3.has(woocommerceSku)) {
      wooToH3.set(woocommerceSku, []);
    }
    wooToH3.get(woocommerceSku)!.push(mapping);

    // H3Yun -> WooCommerce
    if (!h3ToWoo.has(h3yunSkuId)) {
      h3ToWoo.set(h3yunSkuId, []);
    }
    h3ToWoo.get(h3yunSkuId)!.push(mapping);

    validMappings++;
  }

  console.log(`[SKU Mapping] 映射缓存构建完成:`);
  console.log(`  - 有效映射: ${validMappings} 条`);
  console.log(`  - 跳过记录: ${skippedMappings} 条`);
  console.log(`  - WooCommerce SKU数: ${wooToH3.size}`);
  console.log(`  - H3Yun SKU数: ${h3ToWoo.size}`);

  return { wooToH3, h3ToWoo };
}

/**
 * 根据WooCommerce SKU查找对应的氚云SKU列表
 * @param woocommerceSku WooCommerce SKU
 * @param cache SKU映射缓存
 * @returns 氚云SKU映射列表，如果未找到则返回空数组
 */
export function findH3yunSkus(
  woocommerceSku: string,
  cache: SkuMappingCache
): SkuMapping[] {
  return cache.wooToH3.get(woocommerceSku) || [];
}

/**
 * 根据氚云SKU ID查找对应的WooCommerce SKU列表
 * @param h3yunSkuId 氚云SKU ID
 * @param cache SKU映射缓存
 * @returns WooCommerce SKU映射列表，如果未找到则返回空数组
 */
export function findWoocommerceSkus(
  h3yunSkuId: string,
  cache: SkuMappingCache
): SkuMapping[] {
  return cache.h3ToWoo.get(h3yunSkuId) || [];
}

/**
 * 聚合计算：根据氚云库存数据和SKU映射，计算WooCommerce SKU的库存
 *
 * 逻辑：
 * 1. 如果1个WooCommerce SKU对应多个氚云SKU，需要按照数量倍数聚合
 * 2. 每个氚云SKU的库存需要除以其quantity才能得到对应WooCommerce SKU的可用数量
 * 3. 取所有氚云SKU对应的最小值作为最终库存
 *
 * 例如：
 * - WooCommerce SKU: "BUNDLE-A"
 * - 对应氚云: [{ skuId: "SKU-1", quantity: 2 }, { skuId: "SKU-2", quantity: 3 }]
 * - SKU-1库存: 100, SKU-2库存: 90
 * - 计算: min(100/2, 90/3) = min(50, 30) = 30
 * - 结果: "BUNDLE-A" 的可用库存为 30
 */
export function aggregateInventoryWithMapping(
  h3yunInventory: H3YunBizObject[],
  cache: SkuMappingCache
): InventoryItem[] {
  console.log(`[SKU Mapping] 开始聚合计算，氚云库存记录: ${h3yunInventory.length}`);

  // 步骤1: 构建氚云SKU库存索引 (skuId -> inventory)
  const h3yunInventoryMap = new Map<string, H3YunBizObject>();
  for (const item of h3yunInventory) {
    const skuId = item.F0000001?.trim();
    if (skuId) {
      h3yunInventoryMap.set(skuId, item);
    }
  }

  console.log(`[SKU Mapping] 氚云SKU索引构建完成: ${h3yunInventoryMap.size} 个SKU`);

  // 步骤2: 遍历所有WooCommerce SKU，计算聚合库存
  const result: InventoryItem[] = [];
  let processedCount = 0;
  let skippedCount = 0;

  for (const [woocommerceSku, mappings] of cache.wooToH3.entries()) {
    // 计算每个映射的可用库存量
    const availableQuantities: number[] = [];

    for (const mapping of mappings) {
      const h3yunItem = h3yunInventoryMap.get(mapping.h3yunSkuId);
      if (!h3yunItem) {
        // 如果氚云中没有这个SKU的库存数据，则跳过这个映射
        console.warn(`[SKU Mapping] 氚云SKU ${mapping.h3yunSkuId} 无库存数据，跳过`);
        continue;
      }

      // 获取可售库存
      const availableStock = h3yunItem.F0000030 || 0;
      const outOfStockOccupied = h3yunItem.F0000083 || 0;

      // 计算净库存
      const netStock = availableStock - outOfStockOccupied;

      // 除以数量倍数得到对应WooCommerce SKU的可用数量
      const wooQuantity = Math.floor(netStock / mapping.quantity);
      availableQuantities.push(wooQuantity);
    }

    // 如果没有任何可用的映射数据，跳过这个WooCommerce SKU
    if (availableQuantities.length === 0) {
      skippedCount++;
      continue;
    }

    // 取最小值作为最终库存
    const finalStock = Math.min(...availableQuantities);

    // 使用第一个映射的氚云数据作为基础信息
    const firstMapping = mappings[0];
    if (!firstMapping) continue; // 安全检查

    const baseH3yunItem = h3yunInventoryMap.get(firstMapping.h3yunSkuId);

    // 构建InventoryItem（使用WooCommerce SKU作为产品代码）
    const inventoryItem: InventoryItem = {
      // 基础信息
      产品代码: woocommerceSku,
      产品名称: baseH3yunItem?.F0000002 || '',
      产品英文名称: '',
      产品单重: '',
      产品尺寸: '',
      规格: '',

      // 库存字段
      计划库存: '',
      采购在途: '',
      退件在途: '',
      待上架: '',
      可用库存: String(finalStock),
      可售库存: String(finalStock),
      '可售库存减去缺货占用库存': String(finalStock),
      待出库: '',
      '不良品 ': '',
      不良品待出库: '',
      预警库存: '',
      缺货: '',
      缺货天数: '',
      缺货订单所占可售库存: '',

      // 人员字段
      默认采购员: '',
      销售负责人: '',
      开发负责人: '',

      // 其他字段
      pi_id: '',
      可售天数: '',
      '币种(供应商结算)': '',
      采购计划: '',

      // 仓库字段
      仓库: '聚合仓库', // 多个氚云SKU聚合后的虚拟仓库
      仓库代码: '',

      // 品类字段
      一级品类: '',
      二级品类: baseH3yunItem?.F0000002 || '',
      三级品类: baseH3yunItem?.F0000003 || '',

      // 状态字段
      销售状态: '',
      仓库产品代码: '',
      推荐库位: '',
      '单价(默认采购价)': '',
      款式: '',
      可售总库存: String(finalStock),
      库龄: '',

      // 在途数据
      在途数量: 0,
      在途库存: finalStock,
    };

    result.push(inventoryItem);
    processedCount++;
  }

  console.log(`[SKU Mapping] 聚合计算完成:`);
  console.log(`  - 成功处理: ${processedCount} 个WooCommerce SKU`);
  console.log(`  - 跳过记录: ${skippedCount} 个`);

  return result;
}

/**
 * 打印SKU映射关系诊断信息
 * @param cache SKU映射缓存
 * @param sampleSize 打印样本数量，默认5
 */
export function printMappingDiagnostics(
  cache: SkuMappingCache,
  sampleSize = 5
): void {
  console.log('\n========== SKU映射诊断信息 ==========');
  console.log(`WooCommerce -> H3Yun 映射总数: ${cache.wooToH3.size}`);
  console.log(`H3Yun -> WooCommerce 映射总数: ${cache.h3ToWoo.size}`);

  console.log('\n【WooCommerce -> H3Yun 示例】');
  let count = 0;
  for (const [wooSku, mappings] of cache.wooToH3.entries()) {
    if (count >= sampleSize) break;
    console.log(`  ${wooSku} -> ${mappings.length} 个氚云SKU:`);
    for (const m of mappings) {
      console.log(`    - ${m.h3yunSkuId} (数量: ${m.quantity})`);
    }
    count++;
  }

  console.log('\n【H3Yun -> WooCommerce 示例】');
  count = 0;
  for (const [h3Sku, mappings] of cache.h3ToWoo.entries()) {
    if (count >= sampleSize) break;
    console.log(`  ${h3Sku} -> ${mappings.length} 个WooCommerce SKU:`);
    for (const m of mappings) {
      console.log(`    - ${m.woocommerceSku} (数量: ${m.quantity})`);
    }
    count++;
  }

  console.log('====================================\n');
}
