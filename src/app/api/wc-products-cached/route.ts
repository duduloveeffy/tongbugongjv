import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteUrl = searchParams.get('siteUrl');
  const consumerKey = searchParams.get('consumerKey');
  const consumerSecret = searchParams.get('consumerSecret');
  const sku = searchParams.get('skus') || searchParams.get('sku'); // Support both 'skus' and 'sku' parameters

  if (!siteUrl || !consumerKey || !consumerSecret || !sku) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  try {
    // First, try to find the site in the database
    const { data: site } = await supabase
      .from('wc_sites')
      .select('id')
      .eq('url', siteUrl)
      .eq('api_key', consumerKey)
      .single();

    if (site) {
      // Try to get product from cache
      const { data: cachedProduct, error: cacheError } = await supabase
        .from('wc_products_cache')
        .select('*')
        .eq('site_id', site.id)
        .eq('sku', sku)
        .single();

      if (cachedProduct && !cacheError) {
        // Transform cached product to match WooCommerce API format
        const product = {
          id: cachedProduct.product_id,
          name: cachedProduct.name,
          slug: cachedProduct.sku,
          permalink: cachedProduct.permalink,
          type: cachedProduct.type,
          status: cachedProduct.status,
          sku: cachedProduct.sku,
          price: cachedProduct.price?.toString() || '0',
          regular_price: cachedProduct.regular_price?.toString() || '0',
          sale_price: cachedProduct.sale_price?.toString() || '0',
          manage_stock: cachedProduct.manage_stock,
          stock_quantity: cachedProduct.stock_quantity,
          stock_status: cachedProduct.stock_status,
          categories: cachedProduct.categories || [],
          images: cachedProduct.images || [],
          attributes: cachedProduct.attributes || [],
          variations: cachedProduct.variations || [],
          meta_data: cachedProduct.meta_data || [],
          // Add cache metadata
          _cached: true,
          _cached_at: cachedProduct.synced_at,
        };

        console.log(`[Product Cache] Hit for SKU: ${sku} from site: ${site.id}`);
        return NextResponse.json([product]); // Return as array to match WooCommerce API
      }

      console.log(`[Product Cache] Miss for SKU: ${sku} from site: ${site.id}, falling back to API`);
    }

    // If not in cache or site not found, fall back to WooCommerce API
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = siteUrl.replace(/\/$/, '');

    const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?sku=${sku}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'WooCommerce API request failed' }, { status: response.status });
    }

    const products = await response.json();

    // Optionally, cache the result if we have a site ID
    if (site && products.length > 0) {
      const product = products[0];

      // Update cache with the fresh data (fire and forget)
      supabase
        .from('wc_products_cache')
        .upsert({
          site_id: site.id,
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
        }, {
          onConflict: 'site_id,sku'
        })
        .then(({ error }) => {
          if (error) {
            console.error('Failed to update cache:', error);
          } else {
            console.log(`[Product Cache] Updated cache for SKU: ${sku}`);
          }
        });
    }

    return NextResponse.json(products);
  } catch (error) {
    console.error('API Error:', error);

    // If cache lookup fails, still try the WooCommerce API
    if (error instanceof Error && error.message.includes('cache')) {
      try {
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        const baseUrl = siteUrl.replace(/\/$/, '');

        const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?sku=${sku}`, {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          return NextResponse.json({ error: 'WooCommerce API request failed' }, { status: response.status });
        }

        const products = await response.json();
        return NextResponse.json(products);
      } catch (fallbackError) {
        console.error('Fallback API Error:', fallbackError);
        return NextResponse.json({ error: 'Both cache and API failed' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST endpoint to bulk check products from cache
export async function POST(request: NextRequest) {
  try {
    const { siteUrl, consumerKey, skus } = await request.json();

    if (!siteUrl || !consumerKey || !Array.isArray(skus)) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Find the site
    const { data: site } = await supabase
      .from('wc_sites')
      .select('id')
      .eq('url', siteUrl)
      .eq('api_key', consumerKey)
      .single();

    if (!site) {
      return NextResponse.json({
        success: false,
        message: 'Site not found or not cached',
        products: []
      });
    }

    // Batch query cached products
    const { data: cachedProducts, error } = await supabase
      .from('wc_products_cache')
      .select('*')
      .eq('site_id', site.id)
      .in('sku', skus);

    if (error) {
      console.error('Cache query error:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to query cache',
        products: []
      });
    }

    // Transform to WooCommerce format
    const products = (cachedProducts || []).map(cp => ({
      id: cp.product_id,
      name: cp.name,
      sku: cp.sku,
      type: cp.type,
      status: cp.status,
      stock_status: cp.stock_status,
      stock_quantity: cp.stock_quantity,
      manage_stock: cp.manage_stock,
      price: cp.price?.toString() || '0',
      _cached: true,
      _cached_at: cp.synced_at,
    }));

    const foundSkus = products.map(p => p.sku);
    const missingSkus = skus.filter(s => !foundSkus.includes(s));

    console.log(`[Product Cache] Batch query: ${products.length}/${skus.length} found in cache`);
    if (missingSkus.length > 0) {
      console.log(`[Product Cache] Missing SKUs: ${missingSkus.join(', ')}`);
    }

    return NextResponse.json({
      success: true,
      products,
      stats: {
        requested: skus.length,
        found: products.length,
        missing: missingSkus.length,
        missingSkus
      }
    });
  } catch (error) {
    console.error('Bulk cache check error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check cache'
      },
      { status: 500 }
    );
  }
}