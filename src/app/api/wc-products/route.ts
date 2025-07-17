import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteUrl = searchParams.get('siteUrl');
  const consumerKey = searchParams.get('consumerKey');
  const consumerSecret = searchParams.get('consumerSecret');
  const sku = searchParams.get('sku');

  if (!siteUrl || !consumerKey || !consumerSecret || !sku) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  try {
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = siteUrl.replace(/\/$/, '');
    
    const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?sku=${sku}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'WooCommerce API request failed' }, { status: response.status });
    }

    const products = await response.json();
    return NextResponse.json(products);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 