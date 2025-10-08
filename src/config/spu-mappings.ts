/**
 * SPU产品名称映射表
 * 用于将不同语言版本或不同命名的产品映射到同一个SPU
 *
 * 格式: { '产品名称': 'SPU名称' }
 */

export const defaultSpuMappings: Record<string, string> = {
  // Surprise Box 系列 - 所有变体映射到统一SPU
  'Surprise Box': 'Surprise Box',           // 基础版本
  'Surprise Box Set': 'Surprise Box',       // Set 版本
  'SurpriseBox': 'Surprise Box',            // 无空格版本
  'SurpriseBoxSet': 'Surprise Box',         // 无空格Set版本

  // 多语言版本
  'Caja Sorpresa': 'Surprise Box',          // 西班牙语
  'Überraschungsbox': 'Surprise Box',       // 德语
  'Boîte Surprise': 'Surprise Box',         // 法语
  'Coffret Surprise': 'Surprise Box',       // 法语（Coffret变体）
  'Caixa Surpresa': 'Surprise Box',         // 葡萄牙语

  // 添加更多映射...
  // 格式: '产品完整名称': 'SPU统一名称',
};

/**
 * 获取产品的SPU映射
 * @param productName 产品名称
 * @returns SPU名称（如果有映射）或 undefined
 */
export function getSpuMapping(productName: string): string | undefined {
  return defaultSpuMappings[productName];
}

/**
 * 添加自定义映射
 * @param mappings 映射对象
 */
export function addSpuMappings(mappings: Record<string, string>): void {
  Object.assign(defaultSpuMappings, mappings);
}

/**
 * 清除所有映射
 */
export function clearSpuMappings(): void {
  for (const key in defaultSpuMappings) {
    delete defaultSpuMappings[key];
  }
}
