/**
 * 定时刷新产品缓存 Cron 端点
 *
 * 每天早上 6 点开始，按 slot 调度 16 个站点
 * 复用 /api/sync/products-cache 的逻辑
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAutoSyncConfigAsync } from '@/lib/local-config-store';

// 延长超时时间（缓存刷新可能需要较长时间）
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 拉取产品的变体
async function fetchVariations(baseUrl: string, auth: string, productId: number): Promise<any[]> {
  const allVariations: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      const response = await fetch(
        `${baseUrl}/wp-json/wc/v3/products/${productId}/variations?page=${page}&per_page=${perPage}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return allVariations;
        }
        throw new Error(`WooCommerce API error: ${response.status}`);
      }

      const variations = await response.json();

      if (variations.length === 0) {
        break;
      }

      allVariations.push(...variations);

      if (variations.length < perPage) {
        break;
      }

      page++;
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[RefreshCache] 获取产品 ${productId} 变体失败:`, error);
      break;
    }
  }

  return allVariations;
}

// 同步单个站点的产品缓存
async function syncSiteProductCache(siteId: string, siteName: string, siteUrl: string, apiKey: string, apiSecret: string) {
  console.log(`[RefreshCache] 开始同步站点: ${siteName} (${siteId})`);

  const syncStartTime = Date.now();
  let syncedProductCount = 0;
  let syncedVariationCount = 0;
  let totalCount = 0;
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = siteUrl.replace(/\/$/, '');

  while (hasMore) {
    try {
      const response = await fetch(
        `${baseUrl}/wp-json/wc/v3/products?page=${page}&per_page=${perPage}&order=asc&orderby=id`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
      }

      const products = await response.json();
      const totalPages = parseInt(response.headers.get('x-wp-totalpages') || '1');
      totalCount = parseInt(response.headers.get('x-wp-total') || '0');

      if (products.length === 0) {
        hasMore = false;
        break;
      }

      // 处理并存储父产品
      const productsToInsert = products.map((product: any) => ({
        site_id: siteId,
        product_id: product.id,
        sku: product.sku || `product-${product.id}`,
        name: product.name,
        type: product.type,
        status: product.status,
        stock_status: product.stock_status,
        stock_quantity: product.stock_quantity,
        manage_stock: product.manage_stock,
        price: parseFloat(product.price || '0'),
        regular_price: parseFloat(product.regular_price || '0'),
        sale_price: parseFloat(product.sale_price || '0'),
        categories: product.categories || [],
        attributes: product.attributes || [],
        variations: product.variations || [],
        images: product.images || [],
        permalink: product.permalink,
        synced_at: new Date().toISOString(),
      }));

      if (productsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('products')
          .upsert(productsToInsert, {
            onConflict: 'site_id,product_id'
          });

        if (insertError) {
          console.error(`[RefreshCache] 插入产品批次 ${page} 失败:`, insertError);
        } else {
          syncedProductCount += productsToInsert.length;
        }
      }

      // 获取并存储变体产品
      for (const product of products) {
        if (product.type === 'variable' && product.variations && product.variations.length > 0) {
          const variations = await fetchVariations(baseUrl, auth, product.id);

          if (variations.length > 0) {
            const variationsToInsert = variations.map((variation: any) => ({
              site_id: siteId,
              product_id: variation.id,
              sku: variation.sku || `variation-${variation.id}`,
              name: `${product.name} - ${variation.attributes?.map((a: any) => a.option).join(', ') || variation.id}`,
              type: 'variation',
              status: variation.status,
              stock_status: variation.stock_status,
              stock_quantity: variation.stock_quantity,
              manage_stock: variation.manage_stock,
              price: parseFloat(variation.price || '0'),
              regular_price: parseFloat(variation.regular_price || '0'),
              sale_price: parseFloat(variation.sale_price || '0'),
              categories: product.categories || [],
              attributes: variation.attributes || [],
              variations: [],
              images: variation.image ? [variation.image] : [],
              permalink: variation.permalink || product.permalink,
              parent_id: product.id,
              synced_at: new Date().toISOString(),
            }));

            const { error: variationError } = await supabase
              .from('products')
              .upsert(variationsToInsert, {
                onConflict: 'site_id,product_id'
              });

            if (variationError) {
              console.error(`[RefreshCache] 插入变体失败 (产品 ${product.id}):`, variationError);
            } else {
              syncedVariationCount += variations.length;
            }
          }

          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      console.log(`[RefreshCache] ${siteName} 进度: 父产品 ${syncedProductCount}/${totalCount}, 变体 ${syncedVariationCount}`);

      hasMore = page < totalPages;
      page++;

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`[RefreshCache] ${siteName} 获取页面 ${page} 失败:`, error);
      page++;
      hasMore = page <= 50;
    }
  }

  const syncDuration = Date.now() - syncStartTime;
  const totalSynced = syncedProductCount + syncedVariationCount;

  console.log(`[RefreshCache] ${siteName} 完成: ${syncedProductCount} 父产品 + ${syncedVariationCount} 变体 = ${totalSynced} 个, 耗时 ${(syncDuration / 1000).toFixed(2)}s`);

  return {
    totalProducts: totalCount,
    syncedProducts: syncedProductCount,
    syncedVariations: syncedVariationCount,
    totalSynced,
    duration: syncDuration,
  };
}

export async function GET(request: NextRequest) {
  const slotParam = request.nextUrl.searchParams.get('slot');
  const slotIndex = slotParam !== null ? parseInt(slotParam, 10) : null;

  console.log(`[RefreshCache] Cron 触发, slot=${slotParam}`);

  try {
    // 1. 获取自动同步配置（复用站点列表）
    const config = await getAutoSyncConfigAsync();

    // 2. 查询所有启用的站点
    const { data: enabledSites, error: sitesError } = await supabase
      .from('wc_sites')
      .select('id, name, url, api_key, api_secret, created_at')
      .eq('enabled', true)
      .order('created_at', { ascending: true });

    if (sitesError) {
      console.error(`[RefreshCache] 查询站点失败:`, sitesError);
      return NextResponse.json({ success: false, error: '查询站点失败' }, { status: 500 });
    }

    // 3. 筛选配置中的站点
    const configuredSites = (enabledSites || []).filter(site =>
      config.site_ids?.includes(site.id)
    );

    console.log(`[RefreshCache] 配置站点数: ${configuredSites.length}`);

    // 4. 根据 slot 获取目标站点
    if (slotIndex === null || isNaN(slotIndex) || slotIndex < 0) {
      return NextResponse.json({ success: false, error: 'slot 参数无效' }, { status: 400 });
    }

    if (slotIndex >= configuredSites.length) {
      console.log(`[RefreshCache] slot ${slotIndex} 无对应站点 (共 ${configuredSites.length} 个)`);
      return NextResponse.json({
        success: true,
        message: `slot ${slotIndex} 无对应站点`,
        skipped: true,
      });
    }

    const targetSite = configuredSites[slotIndex];
    if (!targetSite) {
      return NextResponse.json({ success: true, message: '站点未找到', skipped: true });
    }

    console.log(`[RefreshCache] slot ${slotIndex} → 站点 ${targetSite.name} (${targetSite.id})`);

    // 5. 执行缓存刷新
    const result = await syncSiteProductCache(
      targetSite.id,
      targetSite.name,
      targetSite.url,
      targetSite.api_key,
      targetSite.api_secret
    );

    // 6. 更新站点最后同步时间
    await supabase
      .from('wc_sites')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', targetSite.id);

    return NextResponse.json({
      success: true,
      site_name: targetSite.name,
      ...result,
    });

  } catch (error) {
    console.error(`[RefreshCache] 错误:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '刷新缓存失败'
    }, { status: 500 });
  }
}