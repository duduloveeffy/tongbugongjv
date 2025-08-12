// 验证修复是否成功

async function verifyFix() {
  console.log('\n========================================');
  console.log('验证批量查询修复');
  console.log('========================================\n');

  // 测试之前有问题的查询组合
  const testCases = [
    {
      name: '单独查询AK-VS5-13（基准）',
      skus: ['AK-VS5-13'],
      expectedOrders: 355,
      expectedSales: 1211
    },
    {
      name: '3个SKU批量查询（之前有问题）',
      skus: ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'],
      expectedOrdersForVS513: 355,  // 现在应该返回完整数据
      expectedSalesForVS513: 1211
    },
    {
      name: '4个SKU批量查询（之前AK-VS5-13完全丢失）',
      skus: ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12', 'AK-VS2-13'],
      expectedOrdersForVS513: 355,  // 现在应该返回完整数据
      expectedSalesForVS513: 1211
    },
    {
      name: '5个SKU批量查询',
      skus: ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12', 'AK-VS2-13', 'AK-VS2-14'],
      expectedOrdersForVS513: 355,
      expectedSalesForVS513: 1211
    }
  ];

  console.log('开始测试...\n');
  let allPassed = true;

  for (const test of testCases) {
    console.log(`测试: ${test.name}`);
    console.log(`SKUs: ${test.skus.join(', ')}`);
    
    const response = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skus: test.skus,
        siteIds: [],
        statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed'],
        daysBack: 365,
        strictMatch: false
      })
    });

    if (response.ok) {
      const result = await response.json();
      
      // 显示所有SKU的结果
      let totalOrders = 0;
      let totalSales = 0;
      
      test.skus.forEach(sku => {
        const data = result.data[sku];
        if (data && data.total) {
          console.log(`  ${sku}: 订单=${data.total.orderCount}, 销量=${data.total.salesQuantity}`);
          totalOrders += data.total.orderCount;
          totalSales += data.total.salesQuantity;
        }
      });
      
      console.log(`  总计: ${totalOrders} 个订单, ${totalSales} 件`);
      
      // 验证AK-VS5-13的数据
      if (test.skus.includes('AK-VS5-13')) {
        const vs513Data = result.data['AK-VS5-13'];
        if (vs513Data && vs513Data.total) {
          const orders = vs513Data.total.orderCount;
          const sales = vs513Data.total.salesQuantity;
          
          if (test.expectedOrdersForVS513) {
            if (orders === test.expectedOrdersForVS513) {
              console.log(`  ✅ AK-VS5-13数据正确: ${orders} 个订单`);
            } else {
              console.log(`  ❌ AK-VS5-13数据不正确: 期望${test.expectedOrdersForVS513}个订单，实际${orders}个`);
              allPassed = false;
            }
          }
        } else if (test.expectedOrdersForVS513) {
          console.log(`  ❌ AK-VS5-13无数据`);
          allPassed = false;
        }
      }
      
      // 检查是否还有1000的限制
      if (totalOrders === 1000) {
        console.log(`  ⚠️ 警告: 总订单数仍然是1000，可能限制还存在！`);
        allPassed = false;
      }
    } else {
      console.log(`  ❌ 请求失败: ${response.status}`);
      allPassed = false;
    }
    
    console.log('');
  }

  // 总结
  console.log('\n========================================');
  console.log('测试结果');
  console.log('========================================\n');
  
  if (allPassed) {
    console.log('✅ 所有测试通过！批量查询问题已修复。');
    console.log('\n修复成功：');
    console.log('- AK-VS5-13在批量查询中返回完整数据（355个订单）');
    console.log('- 不再有1000条记录的限制');
    console.log('- 可以同时查询多个SKU而不丢失数据');
  } else {
    console.log('❌ 部分测试失败，请检查修复是否正确应用。');
    console.log('\n可能的问题：');
    console.log('- API修改可能还未生效（需要重启服务）');
    console.log('- 可能还有其他限制存在');
    console.log('- 数据库查询可能有其他问题');
  }
}

verifyFix().catch(console.error);