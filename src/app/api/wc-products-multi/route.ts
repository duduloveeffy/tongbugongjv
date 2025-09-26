import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// 站点产品状态
interface SiteProductStatus {
  siteId: string;
  siteName?: string;
  exists: boolean;
  productId?: number;
  name?: string;
  status?: string;
  stockStatus?: string;
  stockQuantity?: number;
  manageStock?: boolean;
  regularPrice?: string;
  salePrice?: string;
  permalink?: string;
  lastChecked: string;
  error?: string;
}

// 检测请求
interface DetectionRequest {
  skus: string[];
  siteIds: string[];
}

// 检测单个站点的产品
async function detectProductOnSite(
  sku: string,
  siteId: string
): Promise<SiteProductStatus> {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return {
        siteId,
        exists: false,
        lastChecked: new Date().toISOString(),
        error: 'Supabase not configured'
      };
    }

    // 从数据库获取站点信息
    const { data: siteData, error: siteError } = await supabase
      .from('wc_sites')
      .select('id, name, url, api_key, api_secret')
      .eq('id', siteId)
      .single();
    
    if (siteError || !siteData) {
      return {
        siteId,
        exists: false,
        lastChecked: new Date().toISOString(),
        error: '站点配置未找到'
      };
    }
    
    const { url: siteUrl, api_key: apiKey, api_secret: apiSecret, name: siteName } = siteData;
    
    // 调用WooCommerce API
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const baseUrl = siteUrl.replace(/\/$/, '');
    
    const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return {
          siteId,
          siteName,
          exists: false,
          lastChecked: new Date().toISOString()
        };
      }
      throw new Error(`API请求失败: ${response.status}`);
    }
    
    const products = await response.json();
    
    if (!products || products.length === 0) {
      return {
        siteId,
        siteName,
        exists: false,
        lastChecked: new Date().toISOString()
      };
    }
    
    const product = products[0];
    
    return {
      siteId,
      siteName,
      exists: true,
      productId: product.id,
      name: product.name,
      status: product.status,
      stockStatus: product.stock_status,
      stockQuantity: product.stock_quantity,
      manageStock: product.manage_stock,
      regularPrice: product.regular_price,
      salePrice: product.sale_price,
      permalink: product.permalink,
      lastChecked: new Date().toISOString()
    };
    
  } catch (error) {
    return {
      siteId,
      exists: false,
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : '检测失败'
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: DetectionRequest = await request.json();
    const { skus, siteIds } = body;
    
    if (!skus || skus.length === 0 || !siteIds || siteIds.length === 0) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }
    
    // 限制批量检测数量
    if (skus.length > 100) {
      return NextResponse.json({ error: 'SKU数量不能超过100个' }, { status: 400 });
    }
    
    if (siteIds.length > 10) {
      return NextResponse.json({ error: '站点数量不能超过10个' }, { status: 400 });
    }
    
    // 并发检测所有SKU在所有站点的状态
    const detectionResults: { [sku: string]: SiteProductStatus[] } = {};
    
    // 控制并发数
    const MAX_CONCURRENT = 10;
    const allTasks: Array<{ sku: string; siteId: string }> = [];
    
    for (const sku of skus) {
      for (const siteId of siteIds) {
        allTasks.push({ sku, siteId });
      }
    }
    
    // 分批处理
    for (let i = 0; i < allTasks.length; i += MAX_CONCURRENT) {
      const batch = allTasks.slice(i, i + MAX_CONCURRENT);
      const batchPromises = batch.map(task => 
        detectProductOnSite(task.sku, task.siteId).then(result => ({
          sku: task.sku,
          result
        }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      
      // 整理结果
      batchResults.forEach(({ sku, result }) => {
        if (!detectionResults[sku]) {
          detectionResults[sku] = [];
        }
        detectionResults[sku].push(result);
      });
      
      // 批次间延迟，避免过快请求
      if (i + MAX_CONCURRENT < allTasks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // 统计信息
    const stats = {
      totalSkus: skus.length,
      totalSites: siteIds.length,
      totalChecks: skus.length * siteIds.length,
      successfulDetections: 0,
      productsFound: 0
    };
    
    Object.values(detectionResults).forEach(siteResults => {
      siteResults.forEach(result => {
        if (!result.error) stats.successfulDetections++;
        if (result.exists) stats.productsFound++;
      });
    });
    
    return NextResponse.json({
      success: true,
      results: detectionResults,
      stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('多站点产品检测失败:', error);
    return NextResponse.json({ 
      error: '服务器错误',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}