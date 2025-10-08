/**
 * SPU (Standard Product Unit) 提取工具
 * 用于从产品名称中提取SPU标识，支持多种聚合策略
 */

/**
 * 规范化产品名称
 * 去除多余空格、统一Unicode空格字符，确保字符串一致性
 * @param name 原始产品名称
 * @returns 规范化后的产品名称
 */
export function normalizeProductName(name: string): string {
  if (!name) return '';

  return name
    .trim()
    // 将所有Unicode空格字符（包括\u00A0, \u2002, \u2003等）替换为标准空格
    .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    // 将多个连续空格替换为单个空格
    .replace(/\s+/g, ' ')
    .trim();
}

export type SpuExtractionMode = 'series' | 'full' | 'before-comma' | 'sku-prefix' | 'custom';

export interface SpuExtractionConfig {
  mode: SpuExtractionMode;
  customPattern?: string; // 自定义正则表达式
  customSeparator?: string; // 自定义分隔符
  skuPrefixLength?: number; // SKU前缀长度（默认：到第一个分隔符）
  nameMapping?: Record<string, string>; // 产品名称映射表
}

/**
 * 默认SPU提取配置
 */
export const DEFAULT_SPU_CONFIG: SpuExtractionConfig = {
  mode: 'series',
};

/**
 * 从SKU中提取前缀
 * @param sku SKU编码
 * @param prefixLength 前缀长度（可选）
 * @returns SKU前缀
 */
export function extractSkuPrefix(sku: string, prefixLength?: number): string {
  if (!sku) {
    return 'Unknown';
  }

  const trimmedSku = sku.trim();

  // 如果指定了前缀长度，直接截取
  if (prefixLength && prefixLength > 0) {
    return trimmedSku.substring(0, Math.min(prefixLength, trimmedSku.length)).toUpperCase();
  }

  // 否则，提取到第一个分隔符（-, _, 空格）之前的部分
  const separators = ['-', '_', ' ', '.'];
  let minIndex = trimmedSku.length;

  for (const sep of separators) {
    const index = trimmedSku.indexOf(sep);
    if (index > 0 && index < minIndex) {
      minIndex = index;
    }
  }

  return trimmedSku.substring(0, minIndex).toUpperCase();
}

/**
 * 从产品名称中提取SPU标识
 * @param productName 产品名称
 * @param config 提取配置
 * @param sku SKU编码（当使用sku-prefix模式时需要）
 * @returns SPU标识
 */
export function extractSpu(
  productName: string,
  config: SpuExtractionConfig = DEFAULT_SPU_CONFIG,
  sku?: string
): string {
  if (!productName) {
    return 'Unknown';
  }

  // 规范化产品名称（去除多余空格、统一Unicode空格字符）
  const normalizedName = normalizeProductName(productName);

  // 优先检查映射表（使用规范化后的名称）
  if (config.nameMapping) {
    // 1. 先尝试精确匹配
    if (config.nameMapping[normalizedName]) {
      return config.nameMapping[normalizedName];
    }

    // 2. 尝试对映射表的key进行规范化后精确匹配
    for (const [key, value] of Object.entries(config.nameMapping)) {
      const normalizedKey = normalizeProductName(key);
      if (normalizedKey === normalizedName) {
        return value;
      }
    }

    // 3. 尝试不区分大小写的精确匹配
    const lowerNormalizedName = normalizedName.toLowerCase();
    for (const [key, value] of Object.entries(config.nameMapping)) {
      const normalizedKey = normalizeProductName(key);
      if (normalizedKey.toLowerCase() === lowerNormalizedName) {
        return value;
      }
    }

    // 4. 尝试部分匹配（产品名称包含映射表中的key）
    // 按key长度降序排序，优先匹配更具体的名称
    const sortedMappings = Object.entries(config.nameMapping).sort(
      ([keyA], [keyB]) => keyB.length - keyA.length
    );

    for (const [key, value] of sortedMappings) {
      const normalizedKey = normalizeProductName(key);
      // 检查产品名称是否包含映射表中的key（不区分大小写）
      if (lowerNormalizedName.includes(normalizedKey.toLowerCase())) {
        return value;
      }
    }
  }

  switch (config.mode) {
    case 'series':
      // 提取第一个 '-' 之前的系列名
      // 例如: "TRIPLE - Watermelon ice..." -> "TRIPLE"
      //      "TRIPLE PRO - Raspberry..." -> "TRIPLE PRO"
      const dashIndex = normalizedName.indexOf('-');
      if (dashIndex > 0) {
        return normalizedName.substring(0, dashIndex).trim();
      }
      // 如果没有 '-'，尝试提取第一个逗号之前的内容
      const commaIndex = normalizedName.indexOf(',');
      if (commaIndex > 0) {
        return normalizedName.substring(0, commaIndex).trim();
      }
      return normalizedName;

    case 'before-comma':
      // 提取到第一个逗号之前的完整描述
      // 例如: "TRIPLE - Watermelon ice &amp; Strawberry, 2%" -> "TRIPLE - Watermelon ice &amp; Strawberry"
      const firstComma = normalizedName.indexOf(',');
      if (firstComma > 0) {
        return normalizedName.substring(0, firstComma).trim();
      }
      return normalizedName;

    case 'sku-prefix':
      // 使用SKU前缀作为SPU标识
      // 适用于多语言产品，但SKU编码统一的情况
      if (sku) {
        return extractSkuPrefix(sku, config.skuPrefixLength);
      }
      // 如果没有提供SKU，降级到系列名称模式
      const fallbackDashIndex = normalizedName.indexOf('-');
      if (fallbackDashIndex > 0) {
        return normalizedName.substring(0, fallbackDashIndex).trim();
      }
      return normalizedName;

    case 'custom':
      // 使用自定义分隔符
      if (config.customSeparator) {
        const customIndex = normalizedName.indexOf(config.customSeparator);
        if (customIndex > 0) {
          return normalizedName.substring(0, customIndex).trim();
        }
      }
      // 使用自定义正则表达式
      if (config.customPattern) {
        try {
          const regex = new RegExp(config.customPattern);
          const match = normalizedName.match(regex);
          if (match && match[1]) {
            return match[1].trim();
          }
        } catch (error) {
          console.error('Invalid custom pattern:', error);
        }
      }
      return normalizedName;

    case 'full':
    default:
      // 使用完整的产品名称
      return normalizedName;
  }
}

/**
 * 获取SPU提取模式的显示名称
 */
export function getSpuModeLabel(mode: SpuExtractionMode): string {
  const labels: Record<SpuExtractionMode, string> = {
    series: '系列名称',
    full: '完整名称',
    'before-comma': '逗号之前',
    'sku-prefix': 'SKU前缀',
    custom: '自定义规则',
  };
  return labels[mode] || mode;
}

/**
 * 获取SPU提取模式的描述
 */
export function getSpuModeDescription(mode: SpuExtractionMode): string {
  const descriptions: Record<SpuExtractionMode, string> = {
    series: '提取 "-" 之前的系列名，如 "TRIPLE"、"TRIPLE PRO"',
    full: '使用完整的产品名称，每个产品独立统计',
    'before-comma': '提取第一个逗号之前的完整描述',
    'sku-prefix': '使用SKU前缀聚合，适合多语言产品',
    custom: '使用自定义规则提取SPU',
  };
  return descriptions[mode] || '';
}

/**
 * 批量提取SPU
 * @param products 产品列表
 * @param config 提取配置
 * @returns SPU映射 Map<SPU, 产品名称列表>
 */
export function batchExtractSpus(
  products: Array<{ name: string; [key: string]: any }>,
  config: SpuExtractionConfig = DEFAULT_SPU_CONFIG
): Map<string, string[]> {
  const spuMap = new Map<string, string[]>();

  products.forEach(product => {
    const spu = extractSpu(product.name, config);
    const existingNames = spuMap.get(spu) || [];
    if (!existingNames.includes(product.name)) {
      existingNames.push(product.name);
    }
    spuMap.set(spu, existingNames);
  });

  return spuMap;
}

/**
 * 获取SPU统计信息
 * @param products 产品列表
 * @param config 提取配置
 * @returns 统计信息
 */
export function getSpuStats(
  products: Array<{ name: string; [key: string]: any }>,
  config: SpuExtractionConfig = DEFAULT_SPU_CONFIG
): {
  totalProducts: number;
  totalSpus: number;
  averageProductsPerSpu: number;
  spuMap: Map<string, string[]>;
} {
  const spuMap = batchExtractSpus(products, config);

  return {
    totalProducts: products.length,
    totalSpus: spuMap.size,
    averageProductsPerSpu: products.length / spuMap.size,
    spuMap,
  };
}
