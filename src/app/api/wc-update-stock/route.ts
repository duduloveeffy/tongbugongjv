import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const siteUrl = formData.get('siteUrl') as string;
    const consumerKey = formData.get('consumerKey') as string;
    const consumerSecret = formData.get('consumerSecret') as string;
    const sku = formData.get('sku') as string;
    const stockStatus = formData.get('stockStatus') as string;
    const siteId = formData.get('siteId') as string | null;
    const stockQuantityStr = formData.get('stockQuantity') as string | null; // 新增：具体库存数量
    const stockQuantity = stockQuantityStr !== null ? parseInt(stockQuantityStr, 10) : null;

    if (!siteUrl || !consumerKey || !consumerSecret || !sku || !stockStatus) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    // 从URL提取站点标识
    const siteIdentifier = new URL(siteUrl).hostname || siteUrl;

    // 服务器端日志记录（会显示在 Vercel 日志中）
    console.log('[WC-UPDATE-STOCK] Request received:', {
      siteIdentifier,
      siteId: siteId || 'default',
      siteUrl,
      consumerKey: `${consumerKey.substring(0, 10)}...${consumerKey.slice(-4)}`, // 脱敏显示
      consumerSecret: `${consumerSecret.substring(0, 10)}...${consumerSecret.slice(-4)}`, // 脱敏显示
      consumerKeyLength: consumerKey.length,
      consumerSecretLength: consumerSecret.length,
      sku,
      stockStatus,
      timestamp: new Date().toISOString()
    });

    // 构建调试信息（将包含在错误响应中）
    const debugInfo = {
      siteIdentifier,
      siteId: siteId || 'default',
      siteUrl,
      consumerKey: `${consumerKey.substring(0, 10)}...${consumerKey.slice(-4)}`,
      consumerSecret: `${consumerSecret.substring(0, 10)}...${consumerSecret.slice(-4)}`,
      consumerKeyLength: consumerKey.length,
      consumerSecretLength: consumerSecret.length,
      sku,
      stockStatus,
      timestamp: new Date().toISOString()
    };

    // 清理URL
    const cleanUrl = siteUrl.replace(/\/$/, '');
    
    // 第一步：通过SKU查找产品
    const searchUrl = `${cleanUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`;
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    console.log('[WC-UPDATE-STOCK] Searching product:', {
      siteIdentifier,
      url: searchUrl,
      authHeaderLength: auth.length
    });
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('[WC-UPDATE-STOCK] Search failed:', {
        status: searchResponse.status,
        statusText: searchResponse.statusText,
        errorPreview: errorText.substring(0, 200)
      });

      // 检查是否是认证错误
      if (searchResponse.status === 401) {
        return NextResponse.json({
          error: `站点 ${siteIdentifier} API认证失败，请检查该站点的Consumer Key和Consumer Secret是否正确，以及是否具有足够的权限`,
          siteInfo: {
            site: siteIdentifier,
            url: siteUrl
          },
          details: errorText,
          debugInfo // 包含调试信息
        }, { status: 401 });
      }
      
      return NextResponse.json({ error: '搜索产品失败', details: errorText }, { status: 500 });
    }

    const products = await searchResponse.json();
    console.log('[WC-UPDATE-STOCK] Search result:', {
      count: products.length,
      firstProduct: products[0] ? {
        id: products[0].id,
        sku: products[0].sku,
        type: products[0].type
      } : null
    });
    
    if (!products || products.length === 0) {
      return NextResponse.json({ error: `找不到SKU为 ${sku} 的产品` }, { status: 404 });
    }

    const product = products[0];
    console.log('找到产品:', { id: product.id, sku: product.sku, name: product.name, type: product.type });
    
    // 检查是否是变体产品
    const isVariation = product.type === 'variation';
    
    let updateUrl: string;
    if (isVariation) {
      // 变体产品需要使用变体API端点
      // 先获取父产品ID
      const parentId = product.parent_id;
      updateUrl = `${cleanUrl}/wp-json/wc/v3/products/${parentId}/variations/${product.id}`;
    } else {
      // 普通产品使用标准端点
      updateUrl = `${cleanUrl}/wp-json/wc/v3/products/${product.id}`;
    }
    
    // 构建更新数据
    const updateData: any = {
      stock_status: stockStatus
    };

    // 如果传入了具体库存数量，启用库存管理并设置数量
    if (stockQuantity !== null && !isNaN(stockQuantity)) {
      updateData.manage_stock = true;
      updateData.stock_quantity = stockQuantity;
      // 根据数量自动设置状态
      if (stockQuantity <= 0) {
        updateData.stock_status = 'outofstock';
      } else {
        updateData.stock_status = 'instock';
      }
    } else if (stockStatus === 'instock') {
      // 没有传入具体数量，使用旧逻辑
      // 关闭库存管理，让stock_status完全控制库存状态
      updateData.manage_stock = false;
    } else if (stockStatus === 'outofstock') {
      // 设置为缺货时，启用库存管理并设置数量为0
      updateData.manage_stock = true;
      updateData.stock_quantity = 0;
    }

    console.log('[WC-UPDATE-STOCK] Updating product:', {
      url: updateUrl,
      data: updateData,
      productType: isVariation ? 'variation' : 'simple'
    });

    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('[WC-UPDATE-STOCK] Update failed:', {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        errorPreview: errorText.substring(0, 200),
        credentials: {
          consumerKey: `${consumerKey.substring(0, 10)}...${consumerKey.slice(-4)}`,
          consumerSecret: `${consumerSecret.substring(0, 10)}...${consumerSecret.slice(-4)}`,
          keyLength: consumerKey.length,
          secretLength: consumerSecret.length
        }
      });
      
      // 检查是否是权限错误
      if (updateResponse.status === 401) {
        let errorMessage = 'API密钥没有写入权限';
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          // 忽略JSON解析错误
        }
        
        return NextResponse.json({
          error: 'API权限不足：' + errorMessage,
          solution: '请在WooCommerce后台重新生成具有"读/写"权限的API密钥',
          details: errorText,
          debugInfo // 包含调试信息
        }, { status: 401 });
      }
      
      // 检查是否是变体产品相关错误
      if (updateResponse.status === 404) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.code === 'woocommerce_rest_invalid_product_id') {
            return NextResponse.json({ 
              error: '产品类型错误：这可能是一个变体产品，需要使用变体API端点',
              solution: '请检查产品是否为变体产品（不同颜色、尺寸等）',
              details: errorText 
            }, { status: 404 });
          }
        } catch (e) {
          // 忽略JSON解析错误
        }
      }
      
      return NextResponse.json({ error: '更新产品失败', details: errorText }, { status: 500 });
    }

    const updatedProduct = await updateResponse.json();
    console.log('[WC-UPDATE-STOCK] Update success:', {
      productId: updatedProduct.id,
      sku: updatedProduct.sku,
      stockStatus: updatedProduct.stock_status,
      stockQuantity: updatedProduct.stock_quantity
    });

    // 更新本地缓存（同时更新 products 和 product_variations 表）
    if (siteId) {
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          const updateData = {
            stock_status: updatedProduct.stock_status,
            stock_quantity: updatedProduct.stock_quantity,
            manage_stock: updatedProduct.manage_stock,
            synced_at: new Date().toISOString(),
          };

          // 并行更新两个表
          const [productsResult, variationsResult] = await Promise.all([
            // 更新 products 表
            supabase
              .from('products')
              .update(updateData)
              .eq('site_id', siteId)
              .eq('sku', updatedProduct.sku),
            // 更新 product_variations 表
            supabase
              .from('product_variations')
              .update(updateData)
              .eq('sku', updatedProduct.sku)
          ]);

          const productsUpdated = !productsResult.error;
          const variationsUpdated = !variationsResult.error;

          if (productsUpdated || variationsUpdated) {
            console.log(`[WC-UPDATE-STOCK] Local cache updated (products: ${productsUpdated}, variations: ${variationsUpdated})`);
          } else {
            console.warn('[WC-UPDATE-STOCK] Failed to update local cache:', {
              productsError: productsResult.error?.message,
              variationsError: variationsResult.error?.message
            });
          }
        }
      } catch (cacheError) {
        // 缓存更新失败不影响主流程
        console.error('[WC-UPDATE-STOCK] Cache update error:', cacheError);
      }
    }

    return NextResponse.json({
      success: true,
      product: {
        id: updatedProduct.id,
        sku: updatedProduct.sku,
        name: updatedProduct.name,
        stock_status: updatedProduct.stock_status,
        stock_quantity: updatedProduct.stock_quantity
      }
    });

  } catch (error) {
    console.error('更新库存状态失败:', error);
    return NextResponse.json({ 
      error: '服务器错误',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 