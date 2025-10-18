/**
 * 氚云字段到系统字段的映射配置
 */
import type { H3YunBizObject } from './types';
import type { InventoryItem } from '../inventory-utils';

// 字段映射规则
export const FIELD_MAPPINGS = {
  // 直接映射
  产品代码: (obj: H3YunBizObject) => obj.F0000001 || '',
  产品名称: (obj: H3YunBizObject) => obj.Name || '',
  可售库存: (obj: H3YunBizObject) => String(obj.F0000030 || 0),
  可售库存减去缺货占用库存: (obj: H3YunBizObject) => String(obj.F0000083 || 0),
  规格: (obj: H3YunBizObject) => obj.F0000025 || '',

  // 拼接字段：产品英文名称 = 尼古丁 + " - " + flavor
  产品英文名称: (obj: H3YunBizObject) => {
    const nicotine = (obj.F0000063 || '').trim();
    const flavor = (obj.F0000064 || '').trim();

    if (!nicotine && !flavor) return obj.Name || obj.F0000001 || '';
    if (!nicotine) return flavor;
    if (!flavor) return nicotine;

    return `${nicotine} - ${flavor}`;
  },

  // 品类字段
  一级品类: (obj: H3YunBizObject) => obj.F0000003 || '',
  二级品类: (obj: H3YunBizObject) => {
    const category = (obj.F0000003 || '').trim();
    const nicotine = (obj.F0000063 || '').trim();

    if (!category && !nicotine) return '';
    if (!category) return nicotine;
    if (!nicotine) return category;

    return `${category} ${nicotine}`;
  },
  三级品类: () => '',

  // 强制为0的字段
  缺货: () => '0',
  待出库: () => '0',
  缺货天数: () => '0',

  // 默认为0的数值字段
  计划库存: () => '0',
  采购在途: () => '0',
  退件在途: () => '0',
  待上架: () => '0',
  可用库存: (obj: H3YunBizObject) => String(obj.F0000030 || 0),
  不良品: () => '0',
  不良品待出库: () => '0',
  预警库存: () => '0',
  缺货订单所占可售库存: () => '0',
  可售总库存: (obj: H3YunBizObject) => String(obj.F0000030 || 0),

  // 其他字段
  产品单重: () => '',
  产品尺寸: () => '',
  仓库产品代码: (obj: H3YunBizObject) => obj.F0000001 || '',
  推荐库位: () => '',
  单价默认采购价: () => '',
  款式: () => '',
  库龄: () => '0',
  默认采购员: (obj: H3YunBizObject) => obj.CreatedBy || '',
  销售负责人: () => '',
  开发负责人: () => '',
  pi_id: () => '',
  可售天数: () => '0',
  币种供应商结算: () => 'RMB',
  采购计划: () => '0',
  仓库代码: () => '',
  销售状态: () => '在售',
};

// 必需字段验证
export const REQUIRED_FIELDS = [
  '产品代码',
  '产品名称',
  '可售库存',
  '可售库存减去缺货占用库存',
] as const;

// 验证氚云数据是否包含必需字段
export function validateH3YunData(obj: H3YunBizObject): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!obj.F0000001) missing.push('F0000001 (产品SKU)');
  if (obj.F0000030 === undefined && obj.F0000083 === undefined) {
    missing.push('F0000030 或 F0000083 (库存数据)');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * 获取所有InventoryItem字段的默认值
 */
export function getDefaultInventoryFields(): Partial<InventoryItem> {
  return {
    产品单重: '',
    产品尺寸: '',
    计划库存: '0',
    采购在途: '0',
    退件在途: '0',
    待上架: '0',
    '不良品 ': '0',
    不良品待出库: '0',
    预警库存: '0',
    缺货: '0',
    待出库: '0',
    缺货天数: '0',
    缺货订单所占可售库存: '0',
    销售负责人: '',
    开发负责人: '',
    pi_id: '',
    可售天数: '0',
    '币种(供应商结算)': 'RMB',
    采购计划: '0',
    仓库代码: '',
    销售状态: '在售',
    推荐库位: '',
    '单价(默认采购价)': '',
    款式: '',
    库龄: '0',
    三级品类: '',
  };
}
