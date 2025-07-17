import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const siteUrl = formData.get('siteUrl') as string;
    const consumerKey = formData.get('consumerKey') as string;
    const consumerSecret = formData.get('consumerSecret') as string;
    const sku = formData.get('sku') as string;
    const stockStatus = formData.get('stockStatus') as string;

    if (!siteUrl || !consumerKey || !consumerSecret || !sku || !stockStatus) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    // 清理URL
    const cleanUrl = siteUrl.replace(/\/$/, '');
    
    // 第一步：通过SKU查找产品
    const searchUrl = `${cleanUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`;
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    
    console.log('搜索产品URL:', searchUrl);
    console.log('认证信息:', { consumerKey: consumerKey.substring(0, 10) + '...', consumerSecret: consumerSecret.substring(0, 10) + '...' });
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('搜索产品失败:', errorText);
      
      // 检查是否是认证错误
      if (searchResponse.status === 401) {
        return NextResponse.json({ 
          error: 'API认证失败，请检查Consumer Key和Consumer Secret是否正确，以及是否具有足够的权限',
          details: errorText 
        }, { status: 401 });
      }
      
      return NextResponse.json({ error: '搜索产品失败', details: errorText }, { status: 500 });
    }

    const products = await searchResponse.json();
    console.log('搜索结果:', products);
    
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
    
    const updateData = {
      stock_status: stockStatus,
      manage_stock: true,
      stock_quantity: stockStatus === 'instock' ? 1 : 0
    };

    console.log('更新产品URL:', updateUrl);
    console.log('更新数据:', updateData);
    console.log('产品类型:', isVariation ? '变体产品' : '普通产品');

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
      console.error('更新产品失败:', errorText);
      
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
          details: errorText 
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
    console.log('更新成功:', { id: updatedProduct.id, sku: updatedProduct.sku, stock_status: updatedProduct.stock_status });
    
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