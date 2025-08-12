// 测试批量查询问题修复

const testSkus = ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'];

async function testBatchQuery() {
  console.log('\n========================================');
  console.log('测试批量查询问题');
  console.log('========================================\n');

  // 1. 单独查询每个SKU
  console.log('1. 单独查询每个SKU:\n');
  
  for (const sku of testSkus) {
    const response = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skus: [sku],
        siteIds: [],
        statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed'],
        daysBack: 365,
        strictMatch: false
      })
    });

    if (response.ok) {
      const result = await response.json();
      const data = result.data[sku];
      if (data) {
        console.log(`${sku}: 订单=${data.total.orderCount}, 销量=${data.total.salesQuantity}`);
      } else {
        console.log(`${sku}: 无数据`);
      }
    }
  }

  // 2. 批量查询所有SKU
  console.log('\n2. 批量查询所有SKU:\n');
  
  const batchResponse = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skus: testSkus,
      siteIds: [],
      statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed'],
      daysBack: 365,
      strictMatch: false
    })
  });

  if (batchResponse.ok) {
    const result = await batchResponse.json();
    testSkus.forEach(sku => {
      const data = result.data[sku];
      if (data) {
        console.log(`${sku}: 订单=${data.total.orderCount}, 销量=${data.total.salesQuantity}`);
      } else {
        console.log(`${sku}: 无数据`);
      }
    });
  }

  // 3. 对比分析
  console.log('\n3. 分析:\n');
  console.log('如果单独查询和批量查询结果不一致，说明批量查询有bug');
  console.log('问题可能在于：');
  console.log('- 批量查询时的IN条件限制');
  console.log('- SKU映射逻辑问题');
  console.log('- 数据库查询超时');
}

testBatchQuery();