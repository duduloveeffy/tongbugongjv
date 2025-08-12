// 找出问题的临界点

async function findCriticalPoint() {
  console.log('\n========================================');
  console.log('寻找批量查询问题的临界点');
  console.log('========================================\n');

  const targetSku = 'AK-VS5-13';
  const otherSkus = [
    'AK-VS2-09', 'AK-VS2-12', 'AK-VS2-13', 'AK-VS2-14', 
    'AK-VS2-15', 'AK-VS5-07', 'AK-VS5-10', 'AK-VS5-11'
  ];

  console.log('测试不同数量的SKU批量查询:\n');
  console.log('SKU数量 | AK-VS5-13订单数 | AK-VS5-13销量 | 状态');
  console.log('--------|----------------|--------------|------');

  // 从1个SKU开始测试到多个
  for (let i = 0; i <= otherSkus.length; i++) {
    const skusToQuery = i === 0 
      ? [targetSku] 
      : [targetSku, ...otherSkus.slice(0, i)];
    
    const response = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skus: skusToQuery,
        siteIds: [],
        statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed'],
        daysBack: 365,
        strictMatch: false
      })
    });

    if (response.ok) {
      const result = await response.json();
      const data = result.data[targetSku];
      
      if (data && data.total) {
        const status = data.total.orderCount === 355 ? '✅' : '❌';
        console.log(
          `${String(skusToQuery.length).padStart(7)} | ${String(data.total.orderCount).padStart(14)} | ${String(data.total.salesQuantity).padStart(12)} | ${status}`
        );
        
        // 如果发现数据变化，显示详细信息
        if (data.total.orderCount !== 355) {
          console.log(`        ^ 问题出现！期望355个订单，实际${data.total.orderCount}个`);
          console.log(`        查询的SKUs: ${skusToQuery.join(', ')}`);
          break;
        }
      } else {
        console.log(
          `${String(skusToQuery.length).padStart(7)} | ${String(0).padStart(14)} | ${String(0).padStart(12)} | ❌`
        );
      }
    }
  }

  // 测试具体是哪个SKU组合导致问题
  console.log('\n\n测试特定组合:');
  
  const testCombinations = [
    {
      name: 'AK-VS5-13 + AK-VS2-09',
      skus: ['AK-VS5-13', 'AK-VS2-09']
    },
    {
      name: 'AK-VS5-13 + AK-VS2-12',
      skus: ['AK-VS5-13', 'AK-VS2-12']
    },
    {
      name: 'AK-VS5-13 + AK-VS2-09 + AK-VS2-12',
      skus: ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12']
    },
    {
      name: 'AK-VS2-09 + AK-VS2-12 (不含AK-VS5-13)',
      skus: ['AK-VS2-09', 'AK-VS2-12']
    },
    {
      name: '只有AK-VS2系列（3个）',
      skus: ['AK-VS2-09', 'AK-VS2-12', 'AK-VS2-13']
    }
  ];

  for (const combo of testCombinations) {
    console.log(`\n${combo.name}:`);
    
    const response = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skus: combo.skus,
        siteIds: [],
        statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed'],
        daysBack: 365,
        strictMatch: false
      })
    });

    if (response.ok) {
      const result = await response.json();
      combo.skus.forEach(sku => {
        const data = result.data[sku];
        if (data && data.total) {
          console.log(`  ${sku}: 订单=${data.total.orderCount}, 销量=${data.total.salesQuantity}`);
        } else {
          console.log(`  ${sku}: 无数据`);
        }
      });
      
      // 检查总的订单项数量
      let totalOrders = 0;
      let totalQuantity = 0;
      Object.values(result.data).forEach(skuData => {
        if (skuData && skuData.total) {
          totalOrders += skuData.total.orderCount;
          totalQuantity += skuData.total.salesQuantity;
        }
      });
      console.log(`  总计: ${totalOrders} 个订单, ${totalQuantity} 件`);
    }
  }
}

findCriticalPoint().catch(console.error);