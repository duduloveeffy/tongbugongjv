import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: string;
  status: string;
  featured: boolean;
  catalog_visibility: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_to: string | null;
  tax_status: string;
  tax_class: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: string;
  backorders: string;
  low_stock_amount: number | null;
  sold_individually: boolean;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_class: string;
  shipping_class_id: number;
  reviews_allowed: boolean;
  average_rating: string;
  rating_count: number;
  upsell_ids: number[];
  cross_sell_ids: number[];
  parent_id: number;
  categories: any[];
  tags: any[];
  images: any[];
  attributes: any[];
  default_attributes: any[];
  variations: number[];
  meta_data: any[];
  date_created: string;
  date_modified: string;
  downloadable: boolean;
  downloads: any[];
  download_limit: number;
  download_expiry: number;
  external_url: string;
  button_text: string;
}

interface WooCommerceVariation {
  id: number;
  sku: string;
  status: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_to: string | null;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: string;
  backorders: string;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_class: string;
  attributes: any[];
  image: any;
  meta_data: any[];
  date_created: string;
  date_modified: string;
  downloadable: boolean;
  downloads: any[];
  download_limit: number;
  download_expiry: number;
}

// POST: Incremental sync products from WooCommerce to Supabase
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { siteId, mode = 'incremental', includeVariations = true } = body;

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

    if (!site.enabled) {
      return NextResponse.json({ 
        error: 'Site is disabled' 
      }, { status: 400 });
    }

    // Start sync log
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        site_id: siteId,
        sync_type: 'products',
        sync_mode: mode,
        status: 'started',
      })
      .select()
      .single();

    const syncLogId = syncLog?.id;
    const startTime = Date.now();

    try {
      // Get or create sync checkpoint
      let checkpoint = await getOrCreateCheckpoint(supabase, siteId, 'products');
      
      // Fetch products from WooCommerce
      const { products, hasMore, lastProduct } = await fetchIncrementalProducts(
        site.url,
        site.api_key,
        site.api_secret,
        checkpoint,
        mode
      );

      const results = {
        totalProducts: products.length,
        syncedProducts: 0,
        syncedVariations: 0,
        failedProducts: 0,
        errors: [] as string[],
      };

      // Process products in batches
      const batchSize = 10;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        
        try {
          await processProductBatch(
            supabase, 
            siteId, 
            batch, 
            results,
            includeVariations,
            site.url,
            site.api_key,
            site.api_secret
          );
          
          // Update sync progress
          if (syncLogId) {
            await supabase
              .from('sync_logs')
              .update({
                status: 'in_progress',
                items_synced: results.syncedProducts,
                progress_percentage: Math.round((results.syncedProducts / products.length) * 100),
              })
              .eq('id', syncLogId);
          }
        } catch (batchError: any) {
          console.error('Batch processing error:', batchError);
          results.errors.push(batchError.message);
          results.failedProducts += batch.length;
        }
      }

      // Update checkpoint if successful
      if (results.syncedProducts > 0 && lastProduct) {
        await supabase
          .from('sync_checkpoints_v2')
          .upsert({
            site_id: siteId,
            sync_type: 'products',
            last_product_id: lastProduct.id,
            last_product_modified: lastProduct.date_modified,
            products_synced_count: (checkpoint?.products_synced_count || 0) + results.syncedProducts,
            last_sync_completed_at: new Date().toISOString(),
            last_sync_status: 'success',
            last_sync_duration_ms: Date.now() - startTime,
          }, {
            onConflict: 'site_id,sync_type',
          });
      }

      // Update sync log
      if (syncLogId) {
        await supabase
          .from('sync_logs')
          .update({
            status: 'completed',
            items_to_sync: results.totalProducts,
            items_synced: results.syncedProducts,
            items_failed: results.failedProducts,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
            error_message: results.errors.length > 0 ? results.errors[0] : null,
            error_details: results.errors.length > 0 ? { errors: results.errors } : null,
          })
          .eq('id', syncLogId);
      }

      // Update site last sync time
      await supabase
        .from('wc_sites')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', siteId);

      return NextResponse.json({
        success: true,
        siteId,
        siteName: site.name,
        mode,
        results: {
          ...results,
          hasMore,
          duration: Date.now() - startTime,
        },
      });

    } catch (syncError: any) {
      console.error('Sync error:', syncError);
      
      // Update sync log with error
      if (syncLogId) {
        await supabase
          .from('sync_logs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
            error_message: syncError.message,
          })
          .eq('id', syncLogId);
      }

      // Update checkpoint with error
      await supabase
        .from('sync_checkpoints_v2')
        .upsert({
          site_id: siteId,
          sync_type: 'products',
          last_sync_status: 'failed',
          last_error_message: syncError.message,
        }, {
          onConflict: 'site_id,sync_type',
        });

      throw syncError;
    }

  } catch (error: any) {
    console.error('Products sync API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// Get or create sync checkpoint
async function getOrCreateCheckpoint(supabase: any, siteId: string, syncType: string) {
  const { data: checkpoint } = await supabase
    .from('sync_checkpoints_v2')
    .select('*')
    .eq('site_id', siteId)
    .eq('sync_type', syncType)
    .single();

  if (!checkpoint) {
    const { data: newCheckpoint } = await supabase
      .from('sync_checkpoints_v2')
      .insert({
        site_id: siteId,
        sync_type: syncType,
        products_synced_count: 0,
      })
      .select()
      .single();
    
    return newCheckpoint;
  }

  return checkpoint;
}

// Fetch incremental products from WooCommerce
async function fetchIncrementalProducts(
  siteUrl: string,
  apiKey: string,
  apiSecret: string,
  checkpoint: any,
  mode: string
): Promise<{ products: WooCommerceProduct[], hasMore: boolean, lastProduct: WooCommerceProduct | null }> {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = siteUrl.replace(/\/$/, '');
  
  const allProducts: WooCommerceProduct[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = false;
  let lastProduct: WooCommerceProduct | null = null;

  // Build query parameters based on mode and checkpoint
  const buildParams = (pageNum: number) => {
    const params = new URLSearchParams({
      per_page: perPage.toString(),
      page: pageNum.toString(),
      orderby: 'modified',
      order: 'asc',
      status: 'any',
    });

    // For incremental sync, only fetch products modified after last checkpoint
    if (mode === 'incremental' && checkpoint?.last_product_modified) {
      const lastModified = new Date(checkpoint.last_product_modified);
      // Add 1 second to avoid re-fetching the same product
      lastModified.setSeconds(lastModified.getSeconds() + 1);
      params.append('modified_after', lastModified.toISOString());
    }

    return params;
  };

  // Fetch products page by page
  const maxPages = mode === 'full' ? 100 : 10; // Limit pages for safety
  
  while (page <= maxPages) {
    const params = buildParams(page);
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
        throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
      }

      const products = await response.json();
      
      if (products.length === 0) {
        break;
      }

      allProducts.push(...products);
      
      // Track the last product for checkpoint update
      if (products.length > 0) {
        lastProduct = products[products.length - 1];
      }

      // Check if there are more pages
      hasMore = products.length === perPage;
      if (!hasMore) {
        break;
      }

      page++;

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout while fetching products');
      }
      
      throw fetchError;
    }
  }

  return { products: allProducts, hasMore, lastProduct };
}

// Process a batch of products
async function processProductBatch(
  supabase: any,
  siteId: string,
  products: WooCommerceProduct[],
  results: any,
  includeVariations: boolean,
  siteUrl: string,
  apiKey: string,
  apiSecret: string
) {
  // Prepare products for insertion
  const productsToInsert = products.map(product => ({
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
    date_on_sale_from: product.date_on_sale_from,
    date_on_sale_to: product.date_on_sale_to,
    tax_status: product.tax_status,
    tax_class: product.tax_class,
    manage_stock: product.manage_stock,
    stock_quantity: product.stock_quantity,
    stock_status: product.stock_status,
    backorders: product.backorders,
    low_stock_amount: product.low_stock_amount,
    sold_individually: product.sold_individually,
    weight: product.weight,
    length: product.dimensions?.length || null,
    width: product.dimensions?.width || null,
    height: product.dimensions?.height || null,
    shipping_class: product.shipping_class,
    upsell_ids: product.upsell_ids,
    cross_sell_ids: product.cross_sell_ids,
    parent_id: product.parent_id,
    categories: product.categories,
    tags: product.tags,
    attributes: product.attributes,
    default_attributes: product.default_attributes,
    variations: product.variations,
    images: product.images,
    downloadable: product.downloadable,
    downloads: product.downloads,
    download_limit: product.download_limit,
    download_expiry: product.download_expiry,
    external_url: product.external_url || null,
    button_text: product.button_text || null,
    reviews_allowed: product.reviews_allowed,
    average_rating: parseFloat(product.average_rating) || 0,
    rating_count: product.rating_count,
    date_created: product.date_created,
    date_modified: product.date_modified || product.date_created,
    synced_at: new Date().toISOString(),
  }));

  // Upsert products
  const { data: insertedProducts, error: productError } = await supabase
    .from('products')
    .upsert(productsToInsert, {
      onConflict: 'site_id,product_id',
      returning: 'minimal',
    })
    .select('id,product_id');

  if (productError) {
    throw new Error(`Failed to insert products: ${productError.message}`);
  }

  results.syncedProducts += products.length;

  // Process variations if needed
  if (includeVariations) {
    // Create a map of product_id to internal id for variations
    const productIdMap = new Map();
    if (insertedProducts) {
      insertedProducts.forEach((product: any) => {
        productIdMap.set(product.product_id, product.id);
      });
    }

    // Fetch and sync variations for variable products
    for (const product of products) {
      if (product.type === 'variable' && product.variations.length > 0) {
        const productId = productIdMap.get(product.id);
        if (!productId) continue;

        try {
          const variations = await fetchProductVariations(
            siteUrl,
            apiKey,
            apiSecret,
            product.id
          );

          if (variations.length > 0) {
            await processVariationBatch(
              supabase,
              productId,
              variations,
              results
            );
          }
        } catch (varError: any) {
          console.error(`Failed to sync variations for product ${product.id}:`, varError);
          results.errors.push(`Variations for product ${product.id}: ${varError.message}`);
        }
      }
    }
  }
}

// Fetch variations for a product
async function fetchProductVariations(
  siteUrl: string,
  apiKey: string,
  apiSecret: string,
  productId: number
): Promise<WooCommerceVariation[]> {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = siteUrl.replace(/\/$/, '');
  
  const allVariations: WooCommerceVariation[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const params = new URLSearchParams({
      per_page: perPage.toString(),
      page: page.toString(),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(
        `${baseUrl}/wp-json/wc/v3/products/${productId}/variations?${params.toString()}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        // If product has no variations, this is not an error
        if (response.status === 404) {
          return [];
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

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  }

  return allVariations;
}

// Process a batch of variations
async function processVariationBatch(
  supabase: any,
  productId: string,
  variations: WooCommerceVariation[],
  results: any
) {
  const variationsToInsert = variations.map(variation => ({
    product_id: productId,
    variation_id: variation.id,
    sku: variation.sku || `variation-${variation.id}`,
    status: variation.status,
    price: parseFloat(variation.price) || null,
    regular_price: parseFloat(variation.regular_price) || null,
    sale_price: variation.sale_price ? parseFloat(variation.sale_price) : null,
    date_on_sale_from: variation.date_on_sale_from,
    date_on_sale_to: variation.date_on_sale_to,
    manage_stock: variation.manage_stock,
    stock_quantity: variation.stock_quantity,
    stock_status: variation.stock_status,
    backorders: variation.backorders,
    weight: variation.weight,
    length: variation.dimensions?.length || null,
    width: variation.dimensions?.width || null,
    height: variation.dimensions?.height || null,
    shipping_class: variation.shipping_class,
    attributes: variation.attributes,
    image: variation.image,
    meta_data: variation.meta_data,
    downloadable: variation.downloadable,
    downloads: variation.downloads,
    download_limit: variation.download_limit,
    download_expiry: variation.download_expiry,
    date_created: variation.date_created,
    date_modified: variation.date_modified || variation.date_created,
    synced_at: new Date().toISOString(),
  }));

  const { error: variationError } = await supabase
    .from('product_variations')
    .upsert(variationsToInsert, {
      onConflict: 'product_id,variation_id',
    });

  if (variationError) {
    // Check if it's a 502 error (Gateway timeout)
    if (variationError.message?.includes('502') || variationError.message?.includes('Bad Gateway')) {
      console.warn(`502 error for product ${productId}, will retry with smaller batch`);
      
      // Retry with smaller batches
      const smallBatchSize = 10;
      for (let i = 0; i < variations.length; i += smallBatchSize) {
        const smallBatch = variations.slice(i, i + smallBatchSize);
        
        // Add retry logic
        let retries = 3;
        let retryError = null;
        
        while (retries > 0) {
          const { error: retryBatchError } = await supabase
            .from('product_variations')
            .upsert(smallBatch, {
              onConflict: 'site_id,variation_id',
              ignoreDuplicates: false
            });
          
          if (!retryBatchError) {
            break; // Success
          }
          
          retryError = retryBatchError;
          retries--;
          
          if (retries > 0) {
            console.log(`Retrying batch ${i / smallBatchSize + 1}, ${retries} attempts remaining`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          }
        }
        
        if (retryError && retries === 0) {
          console.error(`Failed to sync variations batch after retries:`, retryError);
          // Continue with other batches instead of failing completely
        }
      }
    } else {
      throw new Error(`Failed to insert variations: ${variationError.message}`);
    }
  }

  results.syncedVariations += variations.length;
}