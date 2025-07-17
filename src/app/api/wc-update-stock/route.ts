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
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      console.error('搜索产品失败:', await searchResponse.text());
      return NextResponse.json({ error: '搜索产品失败' }, { status: 500 });
    }

    const products = await searchResponse.json();
    
    if (!products || products.length === 0) {
      return NextResponse.json({ error: `找不到SKU为 ${sku} 的产品` }, { status: 404 });
    }

    const product = products[0];
    
    // 第二步：更新产品的库存状态
    const updateUrl = `${cleanUrl}/wp-json/wc/v3/products/${product.id}`;
    
    const updateData = {
      stock_status: stockStatus,
      manage_stock: true,
      stock_quantity: stockStatus === 'instock' ? 1 : 0
    };

    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (!updateResponse.ok) {
      console.error('更新产品失败:', await updateResponse.text());
      return NextResponse.json({ error: '更新产品失败' }, { status: 500 });
    }

    const updatedProduct = await updateResponse.json();
    
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
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
} 