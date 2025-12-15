import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

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

    // Note: We don't track detailed sync status anymore
    // Just use wc_sites.last_sync_at for basic tracking
    console.log(`[Product Cache Sync] Starting sync for site: ${site.name} (${siteId})`);

    // Start sync process
    const syncStartTime = Date.now();
    let syncedCount = 0;
    let totalCount = 0;
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    // First, get total count
    const auth = Buffer.from(`${site.api_key}:${site.api_secret}`).toString('base64');
    const baseUrl = site.url.replace(/\/$/, '');

    // Note: We don't clear cache - incremental updates are handled by /api/sync/products/incremental
    // This endpoint is primarily for initial cache population

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
            // Add timeout to prevent hanging
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

        // Process and store products
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
          categories: JSON.stringify(product.categories || []),
          attributes: JSON.stringify(product.attributes || []),
          variations: JSON.stringify(product.variations || []),
          meta_data: JSON.stringify(product.meta_data || []),
          images: JSON.stringify(product.images || []),
          permalink: product.permalink,
          synced_at: new Date().toISOString(),
        }));

        // Batch insert products into products table (using upsert to handle updates)
        if (productsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('products')
            .upsert(productsToInsert, {
              onConflict: 'site_id,product_id'
            });

          if (insertError) {
            console.error(`Failed to insert products batch ${page}:`, insertError);
            // Continue with next batch even if this one fails
          } else {
            syncedCount += productsToInsert.length;
          }
        }

        // Log progress (no status table to update)
        const progress = totalCount > 0 ? (syncedCount / totalCount) * 100 : 0;
        console.log(`[Product Cache Sync] Progress: ${syncedCount}/${totalCount} (${progress.toFixed(2)}%)`);

        // Check if there are more pages
        hasMore = page < totalPages;
        page++;

        // Add a small delay to avoid rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        // Continue with next page even if this one fails
        page++;
        hasMore = page <= 10; // Limit to prevent infinite loop
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

    console.log(`[Product Cache Sync] Completed: ${syncedCount} products synced in ${(syncDuration / 1000).toFixed(2)}s`);

    return NextResponse.json({
      success: true,
      message: `成功同步 ${syncedCount} 个产品`,
      data: {
        totalProducts: totalCount,
        syncedProducts: syncedCount,
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