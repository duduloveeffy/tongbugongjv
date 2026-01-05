/**
 * 对比自动同步缓存的 ERP 数据 vs 氚云实时数据
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 氚云 API 配置
const H3YUN_ENGINE_CODE = process.env.H3YUN_ENGINE_CODE;
const H3YUN_ENGINE_SECRET = process.env.H3YUN_ENGINE_SECRET;

// 使用 Header 认证方式（与项目现有代码一致）
async function queryH3Yun(schemaCode) {
  const allData = [];
  let fromRow = 0;
  const pageSize = 500;

  while (true) {
    const filter = {
      FromRowNum: fromRow,
      ToRowNum: fromRow + pageSize,
      RequireCount: false,
      ReturnItems: [],
      SortByCollection: [],
      Matcher: { Type: 'And', Matchers: [] },
    };

    const response = await fetch('https://www.h3yun.com/OpenApi/Invoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        EngineCode: H3YUN_ENGINE_CODE,
        EngineSecret: H3YUN_ENGINE_SECRET,
      },
      body: JSON.stringify({
        ActionName: 'LoadBizObjects',
        SchemaCode: schemaCode,
        Filter: JSON.stringify(filter),
      }),
    });

    const data = await response.json();

    if (!data.Successful) {
      console.log('❌ API 错误:', data.ErrorMessage);
      break;
    }

    if (!data.ReturnData || !data.ReturnData.BizObjectArray) break;

    const items = data.ReturnData.BizObjectArray;
    allData.push(...items);

    if (items.length < pageSize) break;
    fromRow += pageSize;

    // 避免 API 限流
    await new Promise(r => setTimeout(r, 500));
  }

  return allData;
}

async function compare(skuList) {
  console.log('\n========================================');
  console.log('📊 对比 ERP 缓存 vs 氚云实时数据');
  console.log('========================================\n');

  // 1. 获取自动同步缓存的 ERP 数据
  const { data: latestBatch } = await supabase
    .from('sync_batches')
    .select('id, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestBatch) {
    console.log('❌ 没有找到同步批次');
    return;
  }

  console.log(`📦 最新批次: ${latestBatch.id.slice(0, 8)}... (${latestBatch.created_at})`);

  const { data: inventoryCache } = await supabase
    .from('inventory_cache')
    .select('inventory_data')
    .eq('batch_id', latestBatch.id)
    .single();

  if (!inventoryCache) {
    console.log('❌ 没有找到库存缓存');
    return;
  }

  // 构建缓存 SKU 映射
  const cachedStockMap = new Map();
  for (const item of inventoryCache.inventory_data || []) {
    const netStock = (Number(item.可售库存) || 0) - (Number(item.缺货) || 0);
    cachedStockMap.set(item.产品代码, {
      可售库存: Number(item.可售库存) || 0,
      缺货: Number(item.缺货) || 0,
      净库存: netStock,
    });
  }

  console.log(`   缓存中共 ${cachedStockMap.size} 个 SKU\n`);

  // 2. 从氚云拉取实时数据
  console.log('🔄 正在从氚云拉取实时数据...');

  const schemaCode = process.env.H3YUN_INVENTORY_SCHEMA_CODE || 'sirxt5xvsfeuamv3c2kdg';
  const h3yunData = await queryH3Yun(schemaCode);

  console.log(`   氚云实时共 ${h3yunData.length} 条记录\n`);

  // 构建实时 SKU 映射
  const liveStockMap = new Map();
  for (const item of h3yunData) {
    const sku = item.F0000002; // 产品代码
    const 可售库存 = Number(item.F0000015) || 0;
    const 缺货 = Number(item.F0000022) || 0;
    const netStock = 可售库存 - 缺货;
    liveStockMap.set(sku, {
      可售库存,
      缺货,
      净库存: netStock,
    });
  }

  // 3. 对比
  console.log('📋 对比结果:');
  console.log('─'.repeat(60));

  for (const sku of skuList) {
    const cached = cachedStockMap.get(sku);
    const live = liveStockMap.get(sku);

    console.log(`\n📦 ${sku}:`);

    if (!cached) {
      console.log(`   缓存: ❌ 不存在`);
    } else {
      console.log(`   缓存: 可售=${cached.可售库存}, 缺货=${cached.缺货}, 净库存=${cached.净库存}`);
    }

    if (!live) {
      console.log(`   实时: ❌ 不存在`);
    } else {
      console.log(`   实时: 可售=${live.可售库存}, 缺货=${live.缺货}, 净库存=${live.净库存}`);
    }

    if (cached && live) {
      if (cached.净库存 !== live.净库存) {
        console.log(`   ⚠️ 差异！缓存=${cached.净库存}, 实时=${live.净库存}`);
      } else {
        console.log(`   ✅ 一致`);
      }
    }
  }

  console.log('\n========================================');
  console.log('✅ 对比完成');
  console.log('========================================\n');
}

// 运行
const skuList = process.argv.slice(2);
if (skuList.length === 0) {
  console.log('用法: node scripts/compare-erp.js AK-HO2-14 AK-HO2-10 AK-HO5-06');
} else {
  compare(skuList).catch(console.error);
}
