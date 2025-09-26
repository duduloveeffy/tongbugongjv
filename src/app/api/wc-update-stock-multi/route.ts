import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 同步规则接口
interface SyncRule {
  id: string;
  name: string;
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
}

// 站点同步请求
interface SiteSyncRequest {
  siteId: string;
  siteUrl?: string;
  apiKey?: string;
  apiSecret?: string;
}

// 同步请求参数
interface MultiSyncRequest {
  sku: string;
  sites: SiteSyncRequest[];
  mode: 'status' | 'quantity' | 'smart';
  rules?: SyncRule[];
  overrideStatus?: 'instock' | 'outofstock' | 'onbackorder';
  overrideQuantity?: number;
  netStock?: number;
  sellableStock?: number;
  transitStock?: number;
}

// 延迟函数
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 带重试的fetch
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // 如果是成功响应或客户端错误（4xx），不重试
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // 5xx错误，可能是临时问题，继续重试
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error as Error;

      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries - 1) {
        // 指数退避：delay * 2^attempt
        const waitTime = baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${waitTime}ms for ${url}`);
        await delay(waitTime);
      }
    }
  }

  throw lastError || new Error('重试失败');
}

// 同步单个站点
async function syncToSite(
  sku: string,
  site: SiteSyncRequest,
  stockStatus: string,
  quantity?: number,
  manageStock?: boolean
) {
  try {
    // 如果提供了站点ID，从数据库获取凭证
    let siteUrl = site.siteUrl;
    let apiKey = site.apiKey;
    let apiSecret = site.apiSecret;
    
    if (site.siteId && (!siteUrl || !apiKey || !apiSecret)) {
      const { data: siteData, error } = await supabase
        .from('wc_sites')
        .select('url, api_key, api_secret')
        .eq('id', site.siteId)
        .single();
      
      if (error || !siteData) {
        throw new Error('站点配置未找到');
      }
      
      siteUrl = siteData.url;
      apiKey = siteData.api_key;
      apiSecret = siteData.api_secret;
    }
    
    if (!siteUrl || !apiKey || !apiSecret) {
      throw new Error('站点凭证不完整');
    }
    
    // 清理URL
    const cleanUrl = siteUrl.replace(/\/$/, '');
    
    // 第一步：通过SKU查找产品
    const searchUrl = `${cleanUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`;
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    
    const searchResponse = await fetchWithRetry(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      throw new Error(`搜索产品失败: ${errorText}`);
    }

    const products = await searchResponse.json();
    
    if (!products || products.length === 0) {
      return {
        siteId: site.siteId,
        success: false,
        error: `SKU ${sku} 在该站点不存在`,
        skipped: true
      } as any;
    }

    const product = products[0];
    
    // 检查是否是变体产品
    const isVariation = product.type === 'variation';
    
    let updateUrl: string;
    if (isVariation) {
      const parentId = product.parent_id;
      updateUrl = `${cleanUrl}/wp-json/wc/v3/products/${parentId}/variations/${product.id}`;
    } else {
      updateUrl = `${cleanUrl}/wp-json/wc/v3/products/${product.id}`;
    }
    
    // 构建更新数据
    const updateData: any = {
      stock_status: stockStatus
    };
    
    // 根据模式设置库存管理
    if (manageStock !== undefined) {
      updateData.manage_stock = manageStock;
    }
    
    // 如果提供了具体数量
    if (quantity !== undefined && manageStock) {
      updateData.stock_quantity = quantity;
      updateData.manage_stock = true;
    } else if (stockStatus === 'instock' && !manageStock) {
      // 有货且不管理库存
      updateData.manage_stock = false;
    } else if (stockStatus === 'outofstock') {
      // 无货时设置数量为0
      updateData.manage_stock = true;
      updateData.stock_quantity = 0;
    }

    const updateResponse = await fetchWithRetry(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    }, 3, 2000); // 更新操作使用更长的初始延迟

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`更新失败: ${errorText}`);
    }

    const updatedProduct = await updateResponse.json();
    
    return {
      siteId: site.siteId,
      success: true,
      product: {
        id: updatedProduct.id,
        sku: updatedProduct.sku,
        name: updatedProduct.name,
        stock_status: updatedProduct.stock_status,
        stock_quantity: updatedProduct.stock_quantity,
        manage_stock: updatedProduct.manage_stock
      }
    };

  } catch (error) {
    return {
      siteId: site.siteId,
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
}

// 根据规则计算同步操作
function calculateSyncAction(
  stockValues: { netStock?: number; sellableStock?: number; transitStock?: number },
  rules: SyncRule[]
): { stockStatus: string; quantity?: number; manageStock?: boolean; matchedRule?: string } | null {
  
  // 按优先级排序规则
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  
  for (const rule of sortedRules) {
    const fieldValue = stockValues[rule.condition.field] || 0;
    const conditionValue = rule.condition.value;
    let matches = false;
    
    switch (rule.condition.operator) {
      case '>': matches = fieldValue > conditionValue; break;
      case '<': matches = fieldValue < conditionValue; break;
      case '>=': matches = fieldValue >= conditionValue; break;
      case '<=': matches = fieldValue <= conditionValue; break;
      case '==': matches = fieldValue === conditionValue; break;
      case '!=': matches = fieldValue !== conditionValue; break;
    }
    
    if (matches) {
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
          // 使用Function构造器代替eval，更安全
          try {
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

// 验证SKU格式
function validateSKU(sku: string): boolean {
  // SKU应该只包含字母、数字、连字符和下划线
  const skuPattern = /^[A-Za-z0-9_-]+$/;
  return skuPattern.test(sku) && sku.length <= 100;
}

// 验证公式安全性
function validateFormula(formula: string): boolean {
  // 只允许基本的数学运算和变量
  const allowedPattern = /^[\s\d+\-*/(). ]+|netStock|sellableStock|transitStock|Math\.\w+$/;
  // 禁止危险的关键字
  const dangerousKeywords = ['eval', 'Function', 'require', 'import', 'process', 'global', 'window'];

  if (dangerousKeywords.some(keyword => formula.includes(keyword))) {
    return false;
  }

  return allowedPattern.test(formula);
}

export async function POST(request: NextRequest) {
  try {
    const body: MultiSyncRequest = await request.json();
    const { sku, sites, mode, rules, overrideStatus, overrideQuantity, netStock, sellableStock, transitStock } = body;

    // 参数验证
    if (!sku || !sites || sites.length === 0) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    // SKU格式验证
    if (!validateSKU(sku)) {
      return NextResponse.json({
        error: 'SKU格式无效',
        details: 'SKU只能包含字母、数字、连字符和下划线'
      }, { status: 400 });
    }

    // 验证站点数量限制
    if (sites.length > 10) {
      return NextResponse.json({
        error: '一次最多同步10个站点'
      }, { status: 400 });
    }

    // 验证规则中的公式
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        if (rule.action.quantity === 'formula' && rule.action.quantityFormula) {
          if (!validateFormula(rule.action.quantityFormula)) {
            return NextResponse.json({
              error: '公式包含不允许的内容',
              details: `规则 "${rule.name}" 的公式不安全`
            }, { status: 400 });
          }
        }
      }
    }

    // 确定同步操作
    let stockStatus: string = overrideStatus || 'instock';
    let quantity: number | undefined = overrideQuantity;
    let manageStock: boolean | undefined;
    let matchedRule: string | undefined;
    
    if (mode === 'smart' && rules && rules.length > 0) {
      // 智能模式：根据规则计算
      const action = calculateSyncAction(
        { netStock, sellableStock, transitStock },
        rules
      );
      
      if (action) {
        stockStatus = action.stockStatus;
        quantity = action.quantity;
        manageStock = action.manageStock;
        matchedRule = action.matchedRule;
      }
    } else if (mode === 'quantity') {
      // 数量模式：同步具体数量
      manageStock = true;
      if (quantity === undefined && netStock !== undefined) {
        quantity = Math.max(0, netStock);
      }
    } else {
      // 状态模式：只同步状态
      manageStock = stockStatus === 'outofstock';
    }

    // 并发同步到所有站点，使用allSettled处理部分失败
    const syncPromises = sites.map(site =>
      syncToSite(sku, site, stockStatus, quantity, manageStock)
    );

    const settledResults = await Promise.allSettled(syncPromises);

    // 处理结果，提取成功和失败的情况
    const results = settledResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Promise被拒绝的情况
        return {
          siteId: sites[index].siteId,
          success: false,
          error: result.reason?.message || '同步失败'
        };
      }
    });
    
    // 记录同步日志
    const syncLogs = results.map((result: any) => ({
      site_id: result.siteId,
      sku: sku,
      sync_type: mode,
      after_status: stockStatus,
      after_quantity: quantity,
      rule_applied: matchedRule,
      success: result.success,
      error_message: result.error,
      synced_at: new Date().toISOString()
    }));
    
    // 批量插入日志（忽略错误）
    try {
      await supabase.from('sync_logs').insert(syncLogs);
    } catch (error) {
      console.error('Failed to save sync logs:', error);
    }
    
    // 统计结果
    const successCount = results.filter((r: any) => r.success).length;
    const failedCount = results.filter((r: any) => !r.success && !r.skipped).length;
    const skippedCount = results.filter((r: any) => r.skipped).length;
    
    return NextResponse.json({
      success: true,
      sku,
      mode,
      matchedRule,
      summary: {
        total: sites.length,
        success: successCount,
        failed: failedCount,
        skipped: skippedCount
      },
      results,
      syncAction: {
        stockStatus,
        quantity,
        manageStock
      }
    });

  } catch (error) {
    console.error('多站点同步失败:', error);
    return NextResponse.json({ 
      error: '服务器错误',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}