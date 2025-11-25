import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface BulkFetchRequest {
  siteId: string;
  perPage?: number;
  maxPages?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: BulkFetchRequest = await request.json();
    const { siteId, perPage = 100, maxPages = 10 } = body;

    if (!siteId) {
      return NextResponse.json({
        error: 'Site ID is required'
      }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({
        error: 'Supabase not configured'
      }, { status: 503 });
    }

    // 获取站点配置
    const { data: site, error: siteError } = await supabase
      .from('wc_sites')
      .select('*')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({
        error: 'Site not found'
      }, { status: 404 });
    }

    if (!site.enabled) {
      return NextResponse.json({
        error: 'Site is disabled'
      }, { status: 400 });
    }

    if (!site.api_key || !site.api_secret) {
      return NextResponse.json({
        error: 'Site API credentials not configured'
      }, { status: 400 });
    }

    console.log(`[Bulk Fetch] Starting for site: ${site.name}`);

    const auth = Buffer.from(`${site.api_key}:${site.api_secret}`).toString('base64');
    const baseUrl = site.url.replace(/\/$/, '');

    let allProducts = [];
    let page = 1;
    let hasMore = true;
    let totalFetched = 0;

    // 分页获取所有产品
    while (hasMore && page <= maxPages) {
      try {
        const params = new URLSearchParams({
          per_page: perPage.toString(),
          page: page.toString(),
          orderby: 'id',
          order: 'asc',
        });

        console.log(`[Bulk Fetch] Fetching page ${page}...`);

        const response = await fetch(
          `${baseUrl}/wp-json/wc/v3/products?${params.toString()}`,
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`WooCommerce API error: ${response.status}`);
        }

        const products = await response.json();

        if (products.length === 0) {
          hasMore = false;
          break;
        }

        // 准备批量插入数据
        const productsToInsert = products.map((product: any) => ({
          site_id: siteId,
          product_id: product.id,
          sku: product.sku || `product-${product.id}`,
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
        }));

        // 批量插入到数据库
        const { error: upsertError } = await supabase
          .from('products')
          .upsert(productsToInsert, {
            onConflict: 'site_id,product_id',
          });

        if (upsertError) {
          console.error(`[Bulk Fetch] Failed to save page ${page}:`, upsertError);
        } else {
          totalFetched += products.length;
          console.log(`[Bulk Fetch] Saved ${products.length} products from page ${page}`);
        }

        allProducts.push(...products.map((p: any) => ({
          sku: p.sku,
          name: p.name,
          stock_status: p.stock_status,
          stock_quantity: p.stock_quantity,
        })));

        // 检查是否还有更多页
        hasMore = products.length === perPage;
        page++;

        // 添加延迟避免速率限制
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error: any) {
        console.error(`[Bulk Fetch] Error on page ${page}:`, error);
        break;
      }
    }

    // 获取变体产品（如果需要）
    let totalVariations = 0;
    const variableProducts = allProducts.filter((p: any) => p.type === 'variable');

    if (variableProducts.length > 0) {
      console.log(`[Bulk Fetch] Fetching variations for ${variableProducts.length} variable products...`);

      for (const product of variableProducts) {
        try {
          const variationResponse = await fetch(
            `${baseUrl}/wp-json/wc/v3/products/${product.id}/variations?per_page=100`,
            {
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (variationResponse.ok) {
            const variations = await variationResponse.json();
            totalVariations += variations.length;

            // 保存变体到数据库
            const variationsToInsert = variations.map((variation: any) => ({
              site_id: siteId,
              product_id: product.id,
              variation_id: variation.id,
              sku: variation.sku || `variation-${variation.id}`,
              status: variation.status,
              price: parseFloat(variation.price) || null,
              regular_price: parseFloat(variation.regular_price) || null,
              sale_price: variation.sale_price ? parseFloat(variation.sale_price) : null,
              manage_stock: variation.manage_stock,
              stock_quantity: variation.stock_quantity,
              stock_status: variation.stock_status,
              attributes: variation.attributes,
              synced_at: new Date().toISOString(),
            }));

            const { error: varError } = await supabase
              .from('product_variations')
              .upsert(variationsToInsert, {
                onConflict: 'product_id,variation_id',
              });

            if (varError) {
              console.error(`[Bulk Fetch] Failed to save variations for product ${product.id}:`, varError);
            }
          }

          // 添加小延迟
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error: any) {
          console.error(`[Bulk Fetch] Error fetching variations for product ${product.id}:`, error);
        }
      }
    }

    // 更新站点最后同步时间
    await supabase
      .from('wc_sites')
      .update({
        last_sync_at: new Date().toISOString(),
        metadata: {
          ...site.metadata,
          last_bulk_fetch: {
            timestamp: new Date().toISOString(),
            products_count: totalFetched,
            variations_count: totalVariations,
          }
        }
      })
      .eq('id', siteId);

    console.log(`[Bulk Fetch] Complete - Total products: ${totalFetched}, Total variations: ${totalVariations}`);

    return NextResponse.json({
      success: true,
      stats: {
        siteName: site.name,
        totalProducts: totalFetched,
        totalVariations,
        pagesProcessed: page - 1,
      },
      products: allProducts.slice(0, 10), // 返回前10个产品作为示例
    });

  } catch (error: any) {
    console.error('[Bulk Fetch] Error:', error);
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}