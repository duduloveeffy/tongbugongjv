import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, type ProductCache } from '@/lib/supabase';

// POST: Sync products from WooCommerce to Supabase
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { siteId, skus, fullSync = false } = body;

    if (!siteId) {
      return NextResponse.json({ 
        error: 'Site ID is required' 
      }, { status: 400 });
    }

    // Get site configuration
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

    const startTime = Date.now();
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
      products: [] as any[],
    };

    try {
      // Fetch products from WooCommerce
      const products = await fetchWooCommerceProducts(
        site.url,
        site.api_key,
        site.api_secret,
        skus,
        fullSync
      );

      // Prepare products for upsert
      const productsToUpsert = products.map((product: any) => ({
        site_id: siteId,
        product_id: product.id,
        sku: product.sku || `product-${product.id}`,
        name: product.name,
        description: product.short_description || product.description,
        price: parseFloat(product.price) || 0,
        regular_price: parseFloat(product.regular_price) || 0,
        sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
        stock_quantity: product.stock_quantity || 0,
        stock_status: product.stock_status,
        manage_stock: product.manage_stock,
        status: product.status,
        product_type: product.type,
        product_url: product.permalink,
        image_url: product.images?.[0]?.src || null,
        categories: product.categories ? JSON.stringify(product.categories) : null,
        attributes: product.attributes ? JSON.stringify(product.attributes) : null,
        last_updated: new Date().toISOString(),
      }));

      // Batch upsert products
      if (productsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('products_cache')
          .upsert(productsToUpsert, {
            onConflict: 'site_id,sku',
          });

        if (upsertError) {
          console.error('Upsert error:', upsertError);
          results.errors.push(upsertError.message);
          results.failed = productsToUpsert.length;
        } else {
          results.successful = productsToUpsert.length;
          results.products = productsToUpsert;
        }
      }

      // Update site last sync time
      await supabase
        .from('wc_sites')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', siteId);

      // Log sync metrics
      const duration = Date.now() - startTime;
      await updateSyncMetrics(supabase, siteId, results.successful, results.failed, duration);

    } catch (syncError: any) {
      console.error('Sync error:', syncError);
      results.errors.push(syncError.message);
      results.failed = skus ? skus.length : 0;
    }

    return NextResponse.json({
      success: results.successful > 0,
      siteId,
      siteName: site.name,
      results,
      duration: Date.now() - startTime,
    });

  } catch (error: any) {
    console.error('Products sync API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// Fetch products from WooCommerce
async function fetchWooCommerceProducts(
  siteUrl: string,
  apiKey: string,
  apiSecret: string,
  skus?: string[],
  fullSync = false
): Promise<any[]> {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = siteUrl.replace(/\/$/, '');
  
  const allProducts: any[] = [];
  let page = 1;
  const perPage = 100;

  // If specific SKUs provided, fetch them individually or in batches
  if (skus && skus.length > 0 && !fullSync) {
    // For specific SKUs, we need to search for each one
    // WooCommerce doesn't support bulk SKU search efficiently
    for (const sku of skus) {
      const params = new URLSearchParams({
        sku,
        per_page: '1',
      });

      try {
        const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?${params.toString()}`, {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const products = await response.json();
          if (products.length > 0) {
            allProducts.push(products[0]);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch product with SKU ${sku}:`, error);
      }
    }
  } else {
    // Full sync - fetch all products
    let hasMore = true;
    const maxPages = fullSync ? 100 : 10; // Limit pages for safety

    while (hasMore && page <= maxPages) {
      const params = new URLSearchParams({
        per_page: perPage.toString(),
        page: page.toString(),
        status: 'publish',
        _fields: 'id,name,sku,price,regular_price,sale_price,stock_quantity,stock_status,manage_stock,status,type,permalink,images,categories,attributes,short_description',
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?${params.toString()}`, {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`WooCommerce API error: ${response.status}`);
        }

        const products = await response.json();
        allProducts.push(...products);

        hasMore = products.length === perPage;
        page++;

      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    }
  }

  return allProducts;
}

// Update sync metrics
async function updateSyncMetrics(
  supabase: any,
  siteId: string,
  successful: number,
  failed: number,
  duration: number
) {
  const today = new Date().toISOString().split('T')[0];
  
  const { data: existing } = await supabase
    .from('sync_metrics')
    .select('*')
    .eq('site_id', siteId)
    .eq('date', today)
    .single();

  if (existing) {
    await supabase
      .from('sync_metrics')
      .update({
        total_syncs: existing.total_syncs + 1,
        successful_syncs: existing.successful_syncs + (failed === 0 ? 1 : 0),
        failed_syncs: existing.failed_syncs + (failed > 0 ? 1 : 0),
        avg_duration_ms: Math.round(
          (existing.avg_duration_ms * existing.total_syncs + duration) / 
          (existing.total_syncs + 1)
        ),
        total_skus_synced: existing.total_skus_synced + successful,
      })
      .eq('site_id', siteId)
      .eq('date', today);
  } else {
    await supabase
      .from('sync_metrics')
      .insert({
        site_id: siteId,
        date: today,
        total_syncs: 1,
        successful_syncs: failed === 0 ? 1 : 0,
        failed_syncs: failed > 0 ? 1 : 0,
        avg_duration_ms: Math.round(duration),
        total_skus_synced: successful,
      });
  }
}