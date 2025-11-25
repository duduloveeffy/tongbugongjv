import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface DetectRequest {
  siteId: string;
  skus: string[];
  siteUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
}

interface ProductInfo {
  sku: string;
  isOnline: boolean;
  status: string;
  stockStatus: string;
  stockQuantity?: number | null;
  productUrl?: string;
  source: 'cache' | 'api';
}

export async function POST(request: NextRequest) {
  try {
    const body: DetectRequest = await request.json();
    const { siteId, skus, siteUrl, consumerKey, consumerSecret } = body;

    if (!siteId || !skus || skus.length === 0) {
      return NextResponse.json({
        error: 'Missing siteId or skus'
      }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({
        error: 'Supabase not configured'
      }, { status: 503 });
    }

    console.log(`[Product Detection] Checking ${skus.length} SKUs for site ${siteId}`);

    // 1. 同时查询 products 表和 product_variations 表
    const [productsResult, variationsResult] = await Promise.all([
      // 查询主产品表
      supabase
        .from('products')
        .select('sku, status, stock_status, stock_quantity, permalink')
        .eq('site_id', siteId)
        .in('sku', skus),
      // 查询变体产品表（通过 JOIN products 表来过滤 site_id）
      supabase
        .from('product_variations')
        .select(`
          sku,
          status,
          stock_status,
          stock_quantity,
          product:products!inner(site_id)
        `)
        .eq('product.site_id', siteId)
        .in('sku', skus)
    ]);

    const { data: cachedProducts, error: productsError } = productsResult;
    const { data: cachedVariations, error: variationsError } = variationsResult;

    if (productsError) {
      console.error('[Product Detection] Products query error:', productsError);
    }
    if (variationsError) {
      console.error('[Product Detection] Variations query error:', variationsError);
    }

    // 2. 构建结果映射
    const results = new Map<string, ProductInfo>();
    const foundSkus = new Set<string>();
    let cacheHits = 0;
    let productsHits = 0;
    let variationsHits = 0;

    // 处理 products 表中找到的产品
    if (cachedProducts && cachedProducts.length > 0) {
      for (const product of cachedProducts) {
        results.set(product.sku, {
          sku: product.sku,
          isOnline: product.status === 'publish',
          status: product.status || 'unknown',
          stockStatus: product.stock_status || 'unknown',
          stockQuantity: product.stock_quantity,
          productUrl: product.permalink,
          source: 'cache'
        });
        foundSkus.add(product.sku);
        productsHits++;
      }
    }

    // 处理 product_variations 表中找到的变体产品（补充 products 表没找到的）
    if (cachedVariations && cachedVariations.length > 0) {
      for (const variation of cachedVariations) {
        if (!foundSkus.has(variation.sku)) {
          results.set(variation.sku, {
            sku: variation.sku,
            isOnline: variation.status === 'publish',
            status: variation.status || 'unknown',
            stockStatus: variation.stock_status || 'unknown',
            stockQuantity: variation.stock_quantity,
            productUrl: undefined,
            source: 'cache'
          });
          foundSkus.add(variation.sku);
          variationsHits++;
        }
      }
    }

    cacheHits = productsHits + variationsHits;
    console.log(`[Product Detection] Cache hits: ${cacheHits}/${skus.length} (products: ${productsHits}, variations: ${variationsHits})`);

    // 3. 找出两个表都没找到的 SKU
    const missingSkus = skus.filter(sku => !foundSkus.has(sku));

    if (missingSkus.length > 0) {
      console.log(`[Product Detection] Missing SKUs: ${missingSkus.length}, will fetch from API`);

      // 检查是否有 API 凭据
      if (!siteUrl || !consumerKey || !consumerSecret) {
        // 没有 API 凭据，尝试从站点配置获取
        const { data: site } = await supabase
          .from('wc_sites')
          .select('url, api_key, api_secret')
          .eq('id', siteId)
          .single();

        if (!site || !site.api_key || !site.api_secret) {
          // 无法获取 API 凭据，返回部分结果
          console.warn('[Product Detection] No API credentials available for missing SKUs');
          missingSkus.forEach(sku => {
            results.set(sku, {
              sku,
              isOnline: false,
              status: 'not_found',
              stockStatus: 'unknown',
              source: 'cache'
            });
          });
        } else {
          // 使用站点配置的 API 凭据
          await fetchFromWooCommerce(
            missingSkus,
            site.url,
            site.api_key,
            site.api_secret,
            siteId,
            results,
            supabase
          );
        }
      } else {
        // 使用提供的 API 凭据
        await fetchFromWooCommerce(
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
    const stats = {
      total: skus.length,
      cacheHits,
      apiCalls: productList.filter(p => p.source === 'api').length,
      notFound: productList.filter(p => p.status === 'not_found').length
    };

    console.log(`[Product Detection] Complete - Cache: ${stats.cacheHits}, API: ${stats.apiCalls}, Not Found: ${stats.notFound}`);

    return NextResponse.json({
      success: true,
      products: productList,
      stats
    });

  } catch (error: any) {
    console.error('[Product Detection] Error:', error);
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

// 从 WooCommerce API 获取产品并保存到缓存
async function fetchFromWooCommerce(
  skus: string[],
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  siteId: string,
  results: Map<string, ProductInfo>,
  supabase: any
) {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const baseUrl = siteUrl.replace(/\/$/, '');
  const productsToCache = [];

  // 批量获取产品（WooCommerce API 支持批量 SKU 查询）
  for (const sku of skus) {
    try {
      const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?sku=${sku}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

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
            name: product.name,
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

      // 添加小延迟避免速率限制
      await new Promise(resolve => setTimeout(resolve, 50));

    } catch (error: any) {
      console.error(`[Product Detection] Failed to fetch SKU ${sku}:`, error.message);
      results.set(sku, {
        sku,
        isOnline: false,
        status: 'error',
        stockStatus: 'unknown',
        source: 'api'
      });
    }
  }

  // 批量保存到缓存
  if (productsToCache.length > 0) {
    try {
      const { error: upsertError } = await supabase
        .from('products')
        .upsert(productsToCache, {
          onConflict: 'site_id,product_id',
        });

      if (upsertError) {
        console.error('[Product Detection] Failed to cache products:', upsertError);
      } else {
        console.log(`[Product Detection] Cached ${productsToCache.length} products`);
      }
    } catch (error: any) {
      console.error('[Product Detection] Cache save error:', error);
    }
  }
}