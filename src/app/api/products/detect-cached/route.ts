import { type NextRequest, NextResponse } from 'next/server';
import { detectProducts, type DetectProductsResult, type ProductInfo } from '@/lib/product-detection';

// 重新导出类型以保持向后兼容
export type { ProductInfo, DetectProductsResult };

interface DetectRequest {
  siteId: string;
  skus: string[];
  siteUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: DetectRequest = await request.json();
    const { siteId, skus, siteUrl, consumerKey, consumerSecret } = body;

    // 调用核心检测逻辑
    const result = await detectProducts(siteId, skus, siteUrl, consumerKey, consumerSecret);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[Product Detection] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
