/**
 * 单站点定时同步 API
 *
 * 每个站点独立执行，避免请求链过深导致 508 错误
 * 通过 Vercel Cron 定时触发，每个站点间隔 5 分钟
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createH3YunClient } from '@/lib/h3yun/client';
import { transformH3YunBatch, extractUniqueWarehouses } from '@/lib/h3yun/transformer';
import type { H3YunConfig, WarehouseMapping } from '@/lib/h3yun/types';
import { env } from '@/env';
import { h3yunSchemaConfig } from '@/config/h3yun.config';
import { getAutoSyncConfigAsync } from '@/lib/local-config-store';
import { buildMappingIndex } from '@/lib/h3yun/mapping-service';

// 延长超时时间
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 库存项接口
interface InventoryItem {
  产品代码: string;
  产品名称: string;
  可售库存: string;
  缺货: string;
  仓库: string;
  一级品类: string;
  二级品类: string;
  三级品类: string;
  [key: string]: string | number | boolean | object | undefined;
}

// 合并仓库数据
function mergeWarehouseData(data: InventoryItem[]): InventoryItem[] {
  const grouped = new Map<string, InventoryItem[]>();

  data.forEach(item => {
    const sku = item.产品代码;
    if (!grouped.has(sku)) {
      grouped.set(sku, []);
    }
    grouped.get(sku)!.push(item);
  });

  const merged: InventoryItem[] = [];
  grouped.forEach((items) => {
    if (items.length === 0) return;

    const first = items[0]!;
    const mergedItem: InventoryItem = {
      产品代码: first.产品代码,
      产品名称: first.产品名称,
      一级品类: first.一级品类,
      二级品类: first.二级品类,
      三级品类: first.三级品类,
      仓库: '合并',
      可售库存: String(items.reduce((sum, item) => sum + (Number(item.可售库存) || 0), 0)),
      缺货: String(items.reduce((sum, item) => sum + (Number(item.缺货) || 0), 0)),
    };

    merged.push(mergedItem);
  });

  return merged;
}

// 计算净库存
function calculateNetStock(item: InventoryItem): number {
  const 可售库存 = Number(item.可售库存) || 0;
  const 缺货 = Number(item.缺货) || 0;
  return 可售库存 - 缺货;
}

// 同步单个 SKU
async function syncSku(
  sku: string,
  stockStatus: 'instock' | 'outofstock',
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 直接调用 WooCommerce API
    const searchUrl = `${siteUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}&per_page=1`;

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!searchResponse.ok) {
      return { success: false, error: `搜索产品失败: HTTP ${searchResponse.status}` };
    }

    const products = await searchResponse.json();
    if (!products || products.length === 0) {
      return { success: false, error: '产品不存在' };
    }

    const product = products[0];
    const productId = product.id;

    // 更新库存状态
    const updateUrl = `${siteUrl}/wp-json/wc/v3/products/${productId}`;
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ stock_status: stockStatus })
    });

    if (!updateResponse.ok) {
      return { success: false, error: `更新失败: HTTP ${updateResponse.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '同步失败' };
  }
}

// GET: Cron 触发，通过 URL 参数指定站点
export async function GET(request: NextRequest) {
  const logId = crypto.randomUUID().slice(0, 8);
  const siteId = request.nextUrl.searchParams.get('site_id');

  console.log(`[SingleSite ${logId}] 开始单站点同步, site_id=${siteId}`);

  if (!siteId) {
    return NextResponse.json({ success: false, error: '缺少 site_id 参数' }, { status: 400 });
  }

  try {
    // 1. 检查自动同步是否启用
    const config = await getAutoSyncConfigAsync();
    if (!config.enabled) {
      console.log(`[SingleSite ${logId}] 自动同步已禁用`);
      return NextResponse.json({ success: true, message: '自动同步已禁用', skipped: true });
    }

    // 2. 获取站点信息
    const { data: site, error: siteError } = await supabase
      .from('wc_sites')
      .select('id, name, url, api_key, api_secret, enabled')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error(`[SingleSite ${logId}] 站点不存在: ${siteId}`);
      return NextResponse.json({ success: false, error: '站点不存在' }, { status: 404 });
    }

    if (!site.enabled) {
      console.log(`[SingleSite ${logId}] 站点 ${site.name} 已禁用`);
      return NextResponse.json({ success: true, message: `站点 ${site.name} 已禁用`, skipped: true });
    }

    console.log(`[SingleSite ${logId}] 同步站点: ${site.name}`);

    // 3. 拉取 ERP 数据
    const engineCode = env.H3YUN_ENGINE_CODE;
    const engineSecret = env.H3YUN_ENGINE_SECRET;

    if (!engineCode || !engineSecret || !h3yunSchemaConfig.inventorySchemaCode) {
      return NextResponse.json({ success: false, error: '氚云配置不完整' }, { status: 500 });
    }

    const h3yunConfig: H3YunConfig = {
      engineCode,
      engineSecret,
      schemaCode: h3yunSchemaConfig.inventorySchemaCode,
      warehouseSchemaCode: h3yunSchemaConfig.warehouseSchemaCode,
      skuMappingSchemaCode: h3yunSchemaConfig.skuMappingSchemaCode,
    };

    const client = createH3YunClient(h3yunConfig);
    console.log(`[SingleSite ${logId}] 拉取 ERP 数据...`);
    const h3yunData = await client.fetchAllInventory(500);
    console.log(`[SingleSite ${logId}] 获取 ${h3yunData.length} 条 ERP 记录`);

    // 4. 获取仓库映射并转换数据
    const warehouseIds = extractUniqueWarehouses(h3yunData);
    const warehouseNameMap = await client.fetchWarehouseNames(warehouseIds);
    const warehouseMappings: WarehouseMapping[] = Array.from(warehouseNameMap.entries())
      .map(([id, name]) => ({ id, name }));

    const transformResult = transformH3YunBatch(h3yunData, warehouseMappings);
    if (!transformResult.success || !transformResult.data) {
      return NextResponse.json({ success: false, error: '数据转换失败' }, { status: 500 });
    }

    // 5. 合并仓库
    let inventoryData = mergeWarehouseData(transformResult.data as InventoryItem[]);
    console.log(`[SingleSite ${logId}] 合并后 ${inventoryData.length} 条记录`);

    // 6. 加载 SKU 映射
    let skuMappings: Record<string, string[]> = {};
    try {
      const mappingData = await client.fetchSkuMappings();
      if (mappingData && mappingData.length > 0) {
        const mappingIndex = buildMappingIndex(mappingData);
        for (const [h3yunSku, relations] of mappingIndex.h3yunToWoo.entries()) {
          skuMappings[h3yunSku] = relations.map(r => r.woocommerceSku);
        }
      }
    } catch (error) {
      console.warn(`[SingleSite ${logId}] SKU 映射加载失败:`, error);
    }

    // 7. 获取产品缓存状态
    const { data: productCache } = await supabase
      .from('products')
      .select('sku, stock_status')
      .eq('site_id', siteId);

    const productStatus = new Map<string, string>();
    productCache?.forEach(p => {
      if (p.sku) productStatus.set(p.sku, p.stock_status);
    });

    console.log(`[SingleSite ${logId}] 产品缓存: ${productStatus.size} 个`);

    // 8. 执行同步
    let syncedToInstock = 0;
    let syncedToOutofstock = 0;
    let skipped = 0;
    let failed = 0;
    const details: Array<{ sku: string; action: string; error?: string }> = [];

    for (const item of inventoryData) {
      const sku = item.产品代码;
      const netStock = calculateNetStock(item);

      // 获取映射的 WooCommerce SKU
      const wooSkus = skuMappings[sku] || [sku];

      for (const wooSku of wooSkus) {
        const currentStatus = productStatus.get(wooSku);

        if (!currentStatus) {
          skipped++;
          continue;
        }

        let needSync = false;
        let targetStatus: 'instock' | 'outofstock' | null = null;

        if (currentStatus === 'instock' && netStock <= 0 && config.sync_to_outofstock) {
          needSync = true;
          targetStatus = 'outofstock';
        } else if (currentStatus === 'outofstock' && netStock > 0 && config.sync_to_instock) {
          needSync = true;
          targetStatus = 'instock';
        }

        if (!needSync || !targetStatus) {
          skipped++;
          continue;
        }

        // 执行同步
        const result = await syncSku(wooSku, targetStatus, site.url, site.api_key, site.api_secret);

        if (result.success) {
          if (targetStatus === 'instock') {
            syncedToInstock++;
            details.push({ sku: wooSku, action: 'to_instock' });
          } else {
            syncedToOutofstock++;
            details.push({ sku: wooSku, action: 'to_outofstock' });
          }
          console.log(`[SingleSite ${logId}] ${wooSku} → ${targetStatus} ✓`);
        } else {
          failed++;
          details.push({ sku: wooSku, action: 'failed', error: result.error });
          console.error(`[SingleSite ${logId}] ${wooSku} 同步失败: ${result.error}`);
        }
      }
    }

    // 9. 更新站点最后同步时间
    await supabase
      .from('wc_sites')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', siteId);

    const summary = {
      site_name: site.name,
      total_checked: inventoryData.length,
      synced_to_instock: syncedToInstock,
      synced_to_outofstock: syncedToOutofstock,
      skipped,
      failed,
    };

    console.log(`[SingleSite ${logId}] 完成:`, summary);

    return NextResponse.json({
      success: true,
      ...summary,
      details: details.slice(0, 50), // 只返回前50条详情
    });

  } catch (error) {
    console.error(`[SingleSite ${logId}] 错误:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '同步失败'
    }, { status: 500 });
  }
}