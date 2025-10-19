/**
 * 氚云数据到系统格式转换器
 */
import type { H3YunBizObject, WarehouseMapping, H3YunSyncResult, H3YunSkuMappingObject } from './types';
import type { InventoryItem } from '../inventory-utils';
import { FIELD_MAPPINGS, validateH3YunData } from './field-mappings';
import { buildSkuMappingCache, aggregateInventoryWithMapping } from './sku-mapping';

/**
 * 仓库映射缓存
 */
class WarehouseMappingCache {
  private cache = new Map<string, string>();

  constructor(mappings?: WarehouseMapping[]) {
    if (mappings) {
      for (const m of mappings) {
        this.cache.set(m.id, m.name);
      }
    }
  }

  get(id: string): string {
    // 优先使用映射表中的名称
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    // 如果没有映射，返回简化的ID（前8位）
    if (id && id.length > 8) {
      return `仓库_${id.substring(0, 8)}`;
    }

    return id || '未知仓库';
  }

  set(id: string, name: string): void {
    this.cache.set(id, name);
  }

  has(id: string): boolean {
    return this.cache.has(id);
  }
}

/**
 * 转换单个氚云对象为InventoryItem
 */
export function transformH3YunToInventoryItem(
  obj: H3YunBizObject,
  warehouseCache: WarehouseMappingCache
): InventoryItem | null {
  // 验证必需字段
  const validation = validateH3YunData(obj);
  if (!validation.valid) {
    console.warn(
      '跳过无效记录:',
      obj.ObjectId,
      '缺失字段:',
      validation.missing
    );
    return null;
  }

  // 构建InventoryItem对象
  const item: InventoryItem = {
    // 使用字段映射配置
    产品代码: FIELD_MAPPINGS.产品代码(obj),
    产品名称: FIELD_MAPPINGS.产品名称(obj),
    产品英文名称: FIELD_MAPPINGS.产品英文名称(obj),
    产品单重: FIELD_MAPPINGS.产品单重(obj),
    产品尺寸: FIELD_MAPPINGS.产品尺寸(obj),
    规格: FIELD_MAPPINGS.规格(obj),
    计划库存: FIELD_MAPPINGS.计划库存(obj),
    采购在途: FIELD_MAPPINGS.采购在途(obj),
    退件在途: FIELD_MAPPINGS.退件在途(obj),
    待上架: FIELD_MAPPINGS.待上架(obj),
    可用库存: FIELD_MAPPINGS.可用库存(obj),
    可售库存: FIELD_MAPPINGS.可售库存(obj),
    可售库存减去缺货占用库存: FIELD_MAPPINGS.可售库存减去缺货占用库存(obj),
    待出库: FIELD_MAPPINGS.待出库(obj),
    '不良品 ': FIELD_MAPPINGS.不良品(obj),
    不良品待出库: FIELD_MAPPINGS.不良品待出库(obj),
    预警库存: FIELD_MAPPINGS.预警库存(obj),
    缺货: FIELD_MAPPINGS.缺货(obj),
    缺货天数: FIELD_MAPPINGS.缺货天数(obj),
    缺货订单所占可售库存: FIELD_MAPPINGS.缺货订单所占可售库存(obj),
    默认采购员: FIELD_MAPPINGS.默认采购员(obj),
    销售负责人: FIELD_MAPPINGS.销售负责人(obj),
    开发负责人: FIELD_MAPPINGS.开发负责人(obj),
    pi_id: FIELD_MAPPINGS.pi_id(obj),
    可售天数: FIELD_MAPPINGS.可售天数(obj),
    '币种(供应商结算)': FIELD_MAPPINGS.币种供应商结算(obj),
    采购计划: FIELD_MAPPINGS.采购计划(obj),

    // 仓库字段 - 使用映射
    仓库: warehouseCache.get(obj.F0000007),
    仓库代码: FIELD_MAPPINGS.仓库代码(obj),

    // 品类字段
    一级品类: FIELD_MAPPINGS.一级品类(obj),
    二级品类: FIELD_MAPPINGS.二级品类(obj),
    三级品类: FIELD_MAPPINGS.三级品类(obj),

    // 其他字段
    销售状态: FIELD_MAPPINGS.销售状态(obj),
    仓库产品代码: FIELD_MAPPINGS.仓库产品代码(obj),
    推荐库位: FIELD_MAPPINGS.推荐库位(obj),
    '单价(默认采购价)': FIELD_MAPPINGS.单价默认采购价(obj),
    款式: FIELD_MAPPINGS.款式(obj),
    可售总库存: FIELD_MAPPINGS.可售总库存(obj),
    库龄: FIELD_MAPPINGS.库龄(obj),

    // 在途数据 - 初始值
    在途数量: 0,
    在途库存:
      Number.parseFloat(FIELD_MAPPINGS.可售库存减去缺货占用库存(obj)) || 0,
  };

  return item;
}

/**
 * 批量转换氚云数据
 */
export function transformH3YunBatch(
  objects: H3YunBizObject[],
  warehouseMappings?: WarehouseMapping[]
): H3YunSyncResult {
  console.log(`[H3Yun Transformer] 开始转换 ${objects.length} 条氚云记录`);

  const startTime = Date.now();
  const warehouseCache = new WarehouseMappingCache(warehouseMappings);

  const results: InventoryItem[] = [];
  let validCount = 0;
  let skippedCount = 0;

  for (const obj of objects) {
    const item = transformH3YunToInventoryItem(obj, warehouseCache);

    if (item) {
      results.push(item);
      validCount++;
    } else {
      skippedCount++;
    }
  }

  const processingTime = Date.now() - startTime;

  console.log(`[H3Yun Transformer] 转换完成: 总计${objects.length}条, 有效${validCount}条, 跳过${skippedCount}条, 耗时${processingTime}ms`);

  return {
    success: true,
    data: results,
    stats: {
      totalRecords: objects.length,
      validRecords: validCount,
      skippedRecords: skippedCount,
      processingTime,
    },
  };
}

/**
 * 从氚云获取的仓库ID中提取唯一仓库列表
 */
export function extractUniqueWarehouses(
  objects: H3YunBizObject[]
): string[] {
  const warehouseIds = new Set<string>();

  for (const obj of objects) {
    if (obj.F0000007) {
      warehouseIds.add(obj.F0000007);
    }
  }

  return Array.from(warehouseIds);
}

/**
 * 批量转换氚云数据（支持SKU映射）
 * @param objects 氚云库存对象数组
 * @param warehouseMappings 仓库映射（可选）
 * @param skuMappingObjects SKU映射对象数组（可选，如果提供则启用SKU映射）
 * @returns 转换结果
 */
export function transformH3YunBatchWithMapping(
  objects: H3YunBizObject[],
  warehouseMappings?: WarehouseMapping[],
  skuMappingObjects?: H3YunSkuMappingObject[]
): H3YunSyncResult {
  console.log(`[H3Yun Transformer] 开始转换 ${objects.length} 条氚云记录（SKU映射模式: ${skuMappingObjects ? '启用' : '关闭'}）`);

  const startTime = Date.now();

  // 如果提供了SKU映射对象，使用聚合计算
  if (skuMappingObjects && skuMappingObjects.length > 0) {
    console.log(`[H3Yun Transformer] 使用SKU映射聚合模式，映射表记录: ${skuMappingObjects.length}`);

    // 构建SKU映射缓存
    const skuMappingCache = buildSkuMappingCache(skuMappingObjects);

    // 聚合计算库存
    const aggregatedItems = aggregateInventoryWithMapping(objects, skuMappingCache);

    const processingTime = Date.now() - startTime;

    console.log(`[H3Yun Transformer] SKU映射聚合完成: 生成${aggregatedItems.length}个WooCommerce SKU记录, 耗时${processingTime}ms`);

    return {
      success: true,
      data: aggregatedItems,
      stats: {
        totalRecords: objects.length,
        validRecords: aggregatedItems.length,
        skippedRecords: objects.length - aggregatedItems.length,
        processingTime,
      },
    };
  }

  // 否则使用常规转换流程
  console.log(`[H3Yun Transformer] 使用常规转换模式（无SKU映射）`);
  return transformH3YunBatch(objects, warehouseMappings);
}

// 导出仓库缓存类供外部使用
export { WarehouseMappingCache };
