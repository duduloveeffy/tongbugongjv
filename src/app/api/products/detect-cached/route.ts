import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface DetectRequest {
  siteId: string;
  skus: string[];
  siteUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
}

export interface ProductInfo {
  sku: string;
  isOnline: boolean;
  status: string;
  stockStatus: string;
  stockQuantity?: number | null;
  productUrl?: string;
  source: 'cache' | 'api';
}

export interface DetectProductsResult {
  success: boolean;
  products: ProductInfo[];
  stats: {
    total: number;
    cacheHits: number;
    apiCalls: number;
    notFound: number;
    latency: {
      avg: number;
      min: number;
      max: number;
      total: number;
      count: number;
    };
  };
  error?: string;
}

/**
 * 核心产品检测逻辑 - 可被其他模块直接调用
 * @param skipCache - 如果为 true，跳过缓存直接从 WooCommerce API 获取最新状态
 */
export async function detectProducts(
  siteId: string,
  skus: string[],
  siteUrl?: string,
  consumerKey?: string,
  consumerSecret?: string,
  skipCache = false
): Promise<DetectProductsResult> {
  if (!siteId || !skus || skus.length === 0) {
    return {
      success: false,
      products: [],
      stats: { total: 0, cacheHits: 0, apiCalls: 0, notFound: 0, latency: { avg: 0, min: 0, max: 0, total: 0, count: 0 } },
      error: 'Missing siteId or skus'
    };
  }

  const supabase = getSupabaseClient();
  const results = new Map<string, ProductInfo>();
  let cacheHits = 0;

  console.log(`[Product Detection] 开始检测 ${skus.length} 个SKU for site ${siteId}${skipCache ? ' (跳过缓存)' : ''}`);

  // 1. 先查询 Supabase 缓存（如果不跳过缓存）
  if (supabase && !skipCache) {
    console.log(`[Product Detection] 查询缓存...`);

    // 从 products 表查询缓存（使用 site_id 确保站点隔离）
    const { data: cachedProducts, error: cacheError } = await supabase
      .from('products')
      .select('sku, status, stock_status, stock_quantity, permalink')
      .eq('site_id', siteId)
      .in('sku', skus);

    if (cacheError) {
      console.warn(`[Product Detection] 缓存查询失败:`, cacheError.message);
    } else if (cachedProducts && cachedProducts.length > 0) {
      // 处理缓存命中的产品
      cachedProducts.forEach(product => {
        results.set(product.sku, {
          sku: product.sku,
          isOnline: product.status === 'publish',
          status: product.status || 'unknown',
          stockStatus: product.stock_status || 'unknown',
          stockQuantity: product.stock_quantity,
          productUrl: product.permalink,
          source: 'cache'
        });
        cacheHits++;
      });
      console.log(`[Product Detection] 缓存命中 ${cacheHits} 个产品`);
    }
  } else {
    console.log(`[Product Detection] Supabase 未配置，跳过缓存查询`);
  }

  // 2. 找出缓存未命中的 SKU
  const missingSkus = skus.filter(sku => !results.has(sku));
  console.log(`[Product Detection] 缓存未命中 ${missingSkus.length} 个SKU，需要从API获取`);

  // 3. 从 WooCommerce API 获取缓存未命中的产品
  let latencyStats = { total: 0, count: 0, min: Infinity, max: 0, latencies: [] as number[] };

  if (missingSkus.length > 0) {
    if (!siteUrl || !consumerKey || !consumerSecret) {
      console.warn('[Product Detection] 需要API凭据，请提供siteUrl/consumerKey/consumerSecret');
      missingSkus.forEach(sku => {
        results.set(sku, {
          sku,
          isOnline: false,
          status: 'error',
          stockStatus: 'unknown',
          source: 'api'
        });
      });
    } else {
      latencyStats = await fetchFromWooCommerce(
        missingSkus,
        siteUrl,
        consumerKey,
        consumerSecret,
        siteId,
        results,
        supabase
      );
    }
  }

  // 4. 转换结果为数组
  const productList = Array.from(results.values());

  // 统计信息
  const apiCalls = productList.filter(p => p.source === 'api').length;
  const stats = {
    total: skus.length,
    cacheHits,
    apiCalls,
    notFound: productList.filter(p => p.status === 'not_found').length,
    latency: {
      avg: latencyStats.count > 0 ? Math.round(latencyStats.total / latencyStats.count) : 0,
      min: latencyStats.min === Infinity ? 0 : latencyStats.min,
      max: latencyStats.max,
      total: latencyStats.total,
      count: latencyStats.count
    }
  };

  console.log(`[Product Detection] 完成 - 缓存命中: ${cacheHits}, API调用: ${apiCalls}, 未找到: ${stats.notFound}, 平均延迟: ${stats.latency.avg}ms`);

  return {
    success: true,
    products: productList,
    stats
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: DetectRequest = await request.json();
    const { siteId, skus, siteUrl, consumerKey, consumerSecret } = body;

    // 调用核心检测逻辑
    const result = await detectProducts(siteId, skus, siteUrl, consumerKey, consumerSecret);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[Product Detection] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

// 从 WooCommerce API 获取产品 - 并发版本
async function fetchFromWooCommerce(
  skus: string[],
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  siteId: string,
  results: Map<string, ProductInfo>,
  supabase: any
): Promise<{ total: number; count: number; min: number; max: number; latencies: number[] }> {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const baseUrl = siteUrl.replace(/\/$/, '');
  const productsToCache: any[] = [];

  // 延迟统计
  const latencyStats = {
    total: 0,
    count: 0,
    min: Infinity,
    max: 0,
    latencies: [] as number[]
  };

  // 并发配置：每批20个并发，避免API限流
  const concurrency = 20;
  const batches: string[][] = [];
  for (let i = 0; i < skus.length; i += concurrency) {
    batches.push(skus.slice(i, i + concurrency));
  }

  console.log(`[Product Detection] 并发处理: ${skus.length}个SKU, 分${batches.length}批, 每批${concurrency}个并发`);

  // 处理单个SKU的函数
  const fetchSingleSku = async (sku: string): Promise<void> => {
    const startTime = Date.now();
    try {
      const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?sku=${sku}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      const latency = Date.now() - startTime;

      // 记录延迟统计
      latencyStats.total += latency;
      latencyStats.count++;
      latencyStats.min = Math.min(latencyStats.min, latency);
      latencyStats.max = Math.max(latencyStats.max, latency);
      latencyStats.latencies.push(latency);

      if (response.ok) {
        const products = await response.json();

        if (products.length > 0) {
          const product = products[0];

          // 添加到结果
          results.set(sku, {
            sku,
            isOnline: product.status === 'publish',
            status: product.status,
            stockStatus: product.stock_status,
            stockQuantity: product.stock_quantity,
            productUrl: product.permalink,
            source: 'api'
          });

          // 准备缓存数据
          productsToCache.push({
            site_id: siteId,
            product_id: product.id,
            sku: product.sku || sku,
            name: product.name || sku,  // name 是 NOT NULL，用 sku 作为后备
            slug: product.slug,
            permalink: product.permalink,
            type: product.type,
            status: product.status,
            featured: product.featured,
            catalog_visibility: product.catalog_visibility,
            description: product.description,
            short_description: product.short_description,
            price: parseFloat(product.price) || null,
            regular_price: parseFloat(product.regular_price) || null,
            sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
            manage_stock: product.manage_stock,
            stock_quantity: product.stock_quantity,
            stock_status: product.stock_status,
            backorders: product.backorders,
            categories: product.categories,
            tags: product.tags,
            attributes: product.attributes,
            images: product.images,
            date_created: product.date_created,
            date_modified: product.date_modified,
            synced_at: new Date().toISOString(),
          });
        } else {
          // 产品未找到
          results.set(sku, {
            sku,
            isOnline: false,
            status: 'not_found',
            stockStatus: 'unknown',
            source: 'api'
          });
        }
      } else {
        console.error(`[Product Detection] API error for SKU ${sku}: ${response.status}`);
        results.set(sku, {
          sku,
          isOnline: false,
          status: 'error',
          stockStatus: 'unknown',
          source: 'api'
        });
      }
    } catch (error: any) {
      const latency = Date.now() - startTime;
      console.error(`[Product Detection] Failed to fetch SKU ${sku} (延迟: ${latency}ms):`, error.message);

      // 记录错误请求的延迟
      latencyStats.total += latency;
      latencyStats.count++;
      latencyStats.min = Math.min(latencyStats.min, latency);
      latencyStats.max = Math.max(latencyStats.max, latency);
      latencyStats.latencies.push(latency);

      results.set(sku, {
        sku,
        isOnline: false,
        status: 'error',
        stockStatus: 'unknown',
        source: 'api'
      });
    }
  };

  // 分批并发处理
  const batchStartTime = Date.now();
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchBatchStartTime = Date.now();

    // 并发执行当前批次的所有SKU
    await Promise.all(batch.map(sku => fetchSingleSku(sku)));

    const batchLatency = Date.now() - batchBatchStartTime;
    const avgLatency = latencyStats.count > 0 ? Math.round(latencyStats.total / latencyStats.count) : 0;

    console.log(`[Product Detection] 批次 ${i + 1}/${batches.length} 完成 (${batch.length}个SKU, 批次耗时: ${batchLatency}ms, 平均延迟: ${avgLatency}ms)`);

    // 批次之间添加小延迟，避免API限流
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const totalTime = Date.now() - batchStartTime;
  const avgLatency = latencyStats.count > 0 ? Math.round(latencyStats.total / latencyStats.count) : 0;

  console.log(`[Product Detection] API延迟统计 - 总请求: ${latencyStats.count}, 总耗时: ${totalTime}ms, 平均延迟: ${avgLatency}ms`);

  // 保存到缓存
  if (supabase && productsToCache.length > 0) {
    console.log(`[Product Detection] 保存 ${productsToCache.length} 个产品到缓存...`);

    // 使用 upsert 避免重复 (products 表的唯一约束是 site_id + product_id)
    const { error: upsertError } = await supabase
      .from('products')
      .upsert(productsToCache, {
        onConflict: 'site_id,product_id',
        ignoreDuplicates: false
      });

    if (upsertError) {
      console.error(`[Product Detection] 缓存保存失败:`, upsertError.message);
    } else {
      console.log(`[Product Detection] 缓存保存成功: ${productsToCache.length} 个产品`);
    }
  }

  // 返回延迟统计
  return latencyStats;
}
