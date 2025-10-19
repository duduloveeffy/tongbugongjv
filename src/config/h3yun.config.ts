/**
 * 氚云 ERP 表单编码配置
 *
 * 注意：
 * - 此文件包含非敏感的表单编码配置
 * - 敏感信息（EngineCode, EngineSecret）仍保存在 .env.local 中
 * - 可以安全地提交到代码仓库
 */

export interface H3YunSchemaConfig {
  /**
   * 库存表单编码
   * 用于查询产品库存数据
   */
  inventorySchemaCode: string;

  /**
   * 仓库表单编码
   * 用于查询仓库名称信息
   */
  warehouseSchemaCode: string;

  /**
   * SKU映射表单编码
   * 用于WooCommerce SKU和氚云SKU的映射关系
   */
  skuMappingSchemaCode: string;
}

/**
 * 氚云 ERP 表单编码配置
 *
 * 如需修改表单编码，直接在此文件中修改即可
 * 也可以通过环境变量 H3YUN_*_SCHEMA_CODE 覆盖（优先级更高）
 */
export const h3yunSchemaConfig: H3YunSchemaConfig = {
  // 库存表编码
  inventorySchemaCode: process.env.H3YUN_INVENTORY_SCHEMA_CODE || 'sirxt5xvsfeuamv3c2kdg',

  // 仓库表编码
  warehouseSchemaCode: process.env.H3YUN_WAREHOUSE_SCHEMA_CODE || 'svsphqmtteooobudbgy',

  // SKU映射表编码
  skuMappingSchemaCode: process.env.H3YUN_SKU_MAPPING_SCHEMA_CODE || 'D289302e2ae2f1be3c7425cb1dc90a87131231a',
};

/**
 * 获取完整的氚云表单编码配置
 * 支持运行时动态获取，优先使用环境变量
 */
export function getH3YunSchemaConfig(): H3YunSchemaConfig {
  return {
    inventorySchemaCode: process.env.H3YUN_INVENTORY_SCHEMA_CODE || h3yunSchemaConfig.inventorySchemaCode,
    warehouseSchemaCode: process.env.H3YUN_WAREHOUSE_SCHEMA_CODE || h3yunSchemaConfig.warehouseSchemaCode,
    skuMappingSchemaCode: process.env.H3YUN_SKU_MAPPING_SCHEMA_CODE || h3yunSchemaConfig.skuMappingSchemaCode,
  };
}

// 默认导出配置对象
export default h3yunSchemaConfig;
