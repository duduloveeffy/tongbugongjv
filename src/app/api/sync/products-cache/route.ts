import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

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
      // 延迟防止限流
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[Product Cache Sync] 获取产品 ${productId} 变体失败:`, error);
      break;
    }
  }

  return allVariations;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Supabase not configured' },
        { status: 503 }
      );
    }

    const { siteId } = await request.json();

    if (!siteId) {
      return NextResponse.json(
        { success: false, error: 'Site ID is required' },
        { status: 400 }
      );
    }

    // Get site configuration
    const { data: site, error: siteError } = await supabase
      .from('wc_sites')
      .select('*')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      return NextResponse.json(
        { success: false, error: 'Site not found' },
        { status: 404 }
      );
    }

    console.log(`[Product Cache Sync] Starting sync for site: ${site.name} (${siteId})`);

    // Start sync process
    const syncStartTime = Date.now();
    let syncedProductCount = 0;
    let syncedVariationCount = 0;
    let totalCount = 0;
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    const auth = Buffer.from(`${site.api_key}:${site.api_secret}`).toString('base64');
    const baseUrl = site.url.replace(/\/$/, '');

    while (hasMore) {
      try {
        // Fetch products from WooCommerce
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

        // Process and store parent products
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

        // Insert parent products
        if (productsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('products')
            .upsert(productsToInsert, {
              onConflict: 'site_id,product_id'
            });

          if (insertError) {
            console.error(`Failed to insert products batch ${page}:`, insertError);
          } else {
            syncedProductCount += productsToInsert.length;
          }
        }

        // Fetch and store variations for variable products
        for (const product of products) {
          if (product.type === 'variable' && product.variations && product.variations.length > 0) {
            console.log(`[Product Cache Sync] 拉取产品 ${product.id} (${product.name}) 的 ${product.variations.length} 个变体...`);

            const variations = await fetchVariations(baseUrl, auth, product.id);

            if (variations.length > 0) {
              // 将变体也写入 products 表（作为独立产品记录）
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
                console.error(`Failed to insert variations for product ${product.id}:`, variationError);
              } else {
                syncedVariationCount += variations.length;
                console.log(`[Product Cache Sync] 已同步 ${variations.length} 个变体`);
              }
            }

            // 延迟防止 API 限流
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        // Log progress
        console.log(`[Product Cache Sync] 进度: 父产品 ${syncedProductCount}/${totalCount}, 变体 ${syncedVariationCount}`);

        // Check if there are more pages
        hasMore = page < totalPages;
        page++;

        // Add a small delay to avoid rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        page++;
        hasMore = page <= 50; // 提高上限
      }
    }

    // Update site's last sync timestamp
    const syncDuration = Date.now() - syncStartTime;
    const { error: updateError } = await supabase
      .from('wc_sites')
      .update({
        last_sync_at: new Date().toISOString()
      })
      .eq('id', siteId);

    if (updateError) {
      console.error('Failed to update site sync timestamp:', updateError);
    }

    const totalSynced = syncedProductCount + syncedVariationCount;
    console.log(`[Product Cache Sync] 完成: ${syncedProductCount} 个父产品 + ${syncedVariationCount} 个变体 = ${totalSynced} 个, 耗时 ${(syncDuration / 1000).toFixed(2)}s`);

    return NextResponse.json({
      success: true,
      message: `成功同步 ${totalSynced} 个产品 (${syncedProductCount} 父产品 + ${syncedVariationCount} 变体)`,
      data: {
        totalProducts: totalCount,
        syncedProducts: syncedProductCount,
        syncedVariations: syncedVariationCount,
        totalSynced,
        duration: syncDuration,
      }
    });
  } catch (error) {
    console.error('Product cache sync error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync products'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check sync status
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json(
        { success: false, error: 'Site ID is required' },
        { status: 400 }
      );
    }

    // Get site info for last sync timestamp
    const { data: site, error: siteError } = await supabase
      .from('wc_sites')
      .select('last_sync_at')
      .eq('id', siteId)
      .single();

    if (siteError) {
      throw siteError;
    }

    // Get cache statistics from products table
    const { count: cacheCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId);

    return NextResponse.json({
      success: true,
      data: {
        status: {
          site_id: siteId,
          sync_status: 'idle', // Simplified - no real-time sync tracking
          total_products: cacheCount || 0,
          synced_products: cacheCount || 0,
          sync_progress: 100,
          last_sync_at: site?.last_sync_at,
          last_sync_duration_ms: null,
          sync_error: null,
        },
        cacheCount: cacheCount || 0,
      }
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch status'
      },
      { status: 500 }
    );
  }
}