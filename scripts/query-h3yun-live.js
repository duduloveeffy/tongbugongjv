/**
 * 直接查询氚云 API 获取目标 SKU 的实时库存数据
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const H3YUN_ENGINE_CODE = process.env.H3YUN_ENGINE_CODE;
const H3YUN_ENGINE_SECRET = process.env.H3YUN_ENGINE_SECRET;

async function queryH3Yun(targetSkus) {
  console.log('='.repeat(60));
  console.log('📡 直接查询氚云 API - 目标 SKU 实时库存');
  console.log('='.repeat(60));

  const schemaCode = process.env.H3YUN_INVENTORY_SCHEMA_CODE || 'sirxt5xvsfeuamv3c2kdg';

  // 分页获取所有数据
  const allData = [];
  let fromRow = 0;
  const pageSize = 500;

  console.log('\n正在从氚云拉取数据...');

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

    await new Promise(r => setTimeout(r, 300));
  }

  console.log('氚云总记录数:', allData.length);

  // 查找目标 SKU
  console.log('\n' + '='.repeat(60));
  console.log('🎯 目标 SKU 实时数据:');
  console.log('='.repeat(60));

  for (const sku of targetSkus) {
    const item = allData.find(i => i.F0000001 === sku);

    if (!item) {
      console.log('\n❌ ' + sku + ': 未找到');
      continue;
    }

    console.log('\n📦 ' + sku + ':');
    console.log('   F0000001 (产品代码):', item.F0000001);
    console.log('   F0000030 (可用SKU库存):', item.F0000030);
    console.log('   F0000055 (待出库):', item.F0000055);
    console.log('   F0000083 (可用库存不含待出库):', item.F0000083);
    console.log('   F0000084 (缺货排队待发):', item.F0000084);
    console.log('   F0000085 (可售库存):', item.F0000085);

    // 按当前字段映射计算
    const 可售库存 = item.F0000085 ?? item.F0000030 ?? 0;
    const 缺货 = item.F0000084 ?? 0;
    const 净库存 = 可售库存 - 缺货;

    console.log('\n   === 当前字段映射计算 ===');
    console.log('   可售库存 (F0000085优先):', 可售库存);
    console.log('   缺货 (F0000084):', 缺货);
    console.log('   净库存 = 可售 - 缺货:', 净库存);

    // 替代计算：使用 F0000030
    const alt可售 = item.F0000030 ?? 0;
    const alt缺货 = item.F0000084 ?? 0;
    const alt净库存 = alt可售 - alt缺货;

    console.log('\n   === 替代方案 (F0000030) ===');
    console.log('   可售库存 (F0000030):', alt可售);
    console.log('   缺货 (F0000084):', alt缺货);
    console.log('   净库存:', alt净库存);
  }

  console.log('\n' + '='.repeat(60));
}

const targetSkus = ['AK-HO2-14', 'AK-HO2-10', 'AK-HO5-06'];
queryH3Yun(targetSkus).catch(console.error);
