// 同步规则类型定义
export interface SyncRule {
  id: string;
  name: string;
  description?: string;
  condition: {
    field: 'netStock' | 'sellableStock' | 'transitStock';
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    value: number;
  };
  action: {
    type: 'setStatus' | 'setQuantity' | 'setBoth';
    stockStatus?: 'instock' | 'outofstock' | 'onbackorder';
    quantity?: number | 'actual' | 'formula';
    quantityFormula?: string;
    manageStock?: boolean;
  };
  priority: number;
  enabled?: boolean;
}

// 站点同步配置
export interface SiteSyncConfig {
  siteId: string;
  siteName?: string;
  enabled: boolean;
  syncMode: 'manual' | 'auto' | 'scheduled';
  rules: SyncRule[];
  useGlobalRules: boolean;
  syncQuantity: boolean;
  quantityBuffer: number;
  roundingMode: 'floor' | 'ceil' | 'round';
}

// 预设规则
export const PRESET_RULES: SyncRule[] = [
  {
    id: 'standard',
    name: '标准规则',
    description: '库存<=0时设为无货，>0时设为有货',
    condition: { field: 'netStock', operator: '<=', value: 0 },
    action: { 
      type: 'setStatus', 
      stockStatus: 'outofstock',
      manageStock: true 
    },
    priority: 100,
    enabled: true
  },
  {
    id: 'conservative',
    name: '保守规则',
    description: '库存<=5时设为无货，预留安全库存',
    condition: { field: 'netStock', operator: '<=', value: 5 },
    action: { 
      type: 'setStatus', 
      stockStatus: 'outofstock',
      manageStock: true 
    },
    priority: 90,
    enabled: false
  },
  {
    id: 'exact-quantity',
    name: '精确数量同步',
    description: '同步实际库存数量',
    condition: { field: 'netStock', operator: '>', value: 0 },
    action: { 
      type: 'setBoth', 
      stockStatus: 'instock',
      quantity: 'actual',
      manageStock: true 
    },
    priority: 80,
    enabled: false
  },
  {
    id: 'buffer-stock',
    name: '预留库存规则',
    description: '预留10个库存，剩余同步到线上',
    condition: { field: 'netStock', operator: '>', value: 10 },
    action: { 
      type: 'setBoth',
      stockStatus: 'instock',
      quantity: 'formula',
      quantityFormula: 'netStock - 10',
      manageStock: true
    },
    priority: 70,
    enabled: false
  },
  {
    id: 'percentage-sync',
    name: '百分比同步',
    description: '只同步80%的库存到线上',
    condition: { field: 'netStock', operator: '>', value: 0 },
    action: { 
      type: 'setBoth',
      stockStatus: 'instock',
      quantity: 'formula',
      quantityFormula: 'Math.floor(netStock * 0.8)',
      manageStock: true
    },
    priority: 60,
    enabled: false
  },
  {
    id: 'transit-based',
    name: '基于在途库存',
    description: '考虑在途库存的同步规则',
    condition: { field: 'transitStock', operator: '>', value: 0 },
    action: { 
      type: 'setStatus',
      stockStatus: 'instock',
      manageStock: false
    },
    priority: 50,
    enabled: false
  },
  {
    id: 'backorder',
    name: '预售规则',
    description: '无库存但有在途时设为可预订',
    condition: { field: 'netStock', operator: '<=', value: 0 },
    action: { 
      type: 'setStatus',
      stockStatus: 'onbackorder',
      manageStock: true
    },
    priority: 40,
    enabled: false
  }
];

// 规则评估函数
export function evaluateRule(
  rule: SyncRule,
  stockValues: {
    netStock?: number;
    sellableStock?: number;
    transitStock?: number;
  }
): boolean {
  const fieldValue = stockValues[rule.condition.field] || 0;
  const conditionValue = rule.condition.value;
  
  switch (rule.condition.operator) {
    case '>': return fieldValue > conditionValue;
    case '<': return fieldValue < conditionValue;
    case '>=': return fieldValue >= conditionValue;
    case '<=': return fieldValue <= conditionValue;
    case '==': return fieldValue === conditionValue;
    case '!=': return fieldValue !== conditionValue;
    default: return false;
  }
}

// 计算同步操作
export function calculateSyncAction(
  stockValues: {
    netStock?: number;
    sellableStock?: number;
    transitStock?: number;
  },
  rules: SyncRule[]
): {
  stockStatus: string;
  quantity?: number;
  manageStock?: boolean;
  matchedRule?: string;
} | null {
  // 过滤启用的规则并按优先级排序
  const activeRules = rules
    .filter(r => r.enabled !== false)
    .sort((a, b) => b.priority - a.priority);
  
  for (const rule of activeRules) {
    if (evaluateRule(rule, stockValues)) {
      const result: any = {
        stockStatus: rule.action.stockStatus || 'instock',
        manageStock: rule.action.manageStock,
        matchedRule: rule.name
      };
      
      // 计算数量
      if (rule.action.type === 'setQuantity' || rule.action.type === 'setBoth') {
        if (rule.action.quantity === 'actual') {
          result.quantity = stockValues.netStock || 0;
        } else if (rule.action.quantity === 'formula' && rule.action.quantityFormula) {
          try {
            // 使用Function构造器代替eval，更安全
            const formula = new Function(
              'netStock', 'sellableStock', 'transitStock', 'Math',
              `return ${rule.action.quantityFormula}`
            );
            const calculated = formula(
              stockValues.netStock || 0,
              stockValues.sellableStock || 0,
              stockValues.transitStock || 0,
              Math
            );
            result.quantity = Math.max(0, Math.floor(calculated));
          } catch (error) {
            console.error('Formula evaluation error:', error);
            result.quantity = 0;
          }
        } else if (typeof rule.action.quantity === 'number') {
          result.quantity = rule.action.quantity;
        }
      }
      
      return result;
    }
  }
  
  return null;
}

// 获取默认规则
export function getDefaultRules(): SyncRule[] {
  return PRESET_RULES.filter(r => r.id === 'standard');
}

// 验证规则
export function validateRule(rule: Partial<SyncRule>): string[] {
  const errors: string[] = [];
  
  if (!rule.name) errors.push('规则名称不能为空');
  if (!rule.condition) errors.push('条件不能为空');
  if (!rule.action) errors.push('操作不能为空');
  
  if (rule.condition) {
    if (!rule.condition.field) errors.push('条件字段不能为空');
    if (!rule.condition.operator) errors.push('条件操作符不能为空');
    if (rule.condition.value === undefined) errors.push('条件值不能为空');
  }
  
  if (rule.action) {
    if (!rule.action.type) errors.push('操作类型不能为空');
    
    if (rule.action.type === 'setStatus' || rule.action.type === 'setBoth') {
      if (!rule.action.stockStatus) errors.push('库存状态不能为空');
    }
    
    if (rule.action.type === 'setQuantity' || rule.action.type === 'setBoth') {
      if (rule.action.quantity === undefined) errors.push('数量设置不能为空');
      
      if (rule.action.quantity === 'formula' && !rule.action.quantityFormula) {
        errors.push('公式不能为空');
      }
    }
  }
  
  return errors;
}