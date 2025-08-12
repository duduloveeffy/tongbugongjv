// 验证1000条记录限制的假设

async function testLimitTheory() {
  console.log('\n========================================');
  console.log('验证查询限制假设');
  console.log('========================================\n');

  console.log('假设：API或数据库查询有1000条记录的限制\n');

  // 测试不同的SKU组合
  const testCases = [
    {
      name: '2个高销量SKU',
      skus: ['AK-VS2-09', 'AK-VS2-12'],
      expected: '应该没问题，因为总数少于1000'
    },
    {
      name: '3个SKU（包含AK-VS5-13）',
      skus: ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'],
      expected: '总数超过1000，会被截断'
    },
    {
      name: '4个SKU',
      skus: ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12', 'AK-VS2-13'],
      expected: '肯定会被截断到1000'
    },
    {
      name: '5个SKU',
      skus: ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12', 'AK-VS2-13', 'AK-VS2-14'],
      expected: '肯定会被截断到1000'
    }
  ];

  for (const test of testCases) {
    console.log(`\n测试: ${test.name}`);
    console.log(`预期: ${test.expected}`);
    console.log('---');

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
      
      let totalOrders = 0;
      let totalQuantity = 0;
      let totalOrderItems = 0;
      
      console.log('SKU结果:');
      test.skus.forEach(sku => {
        const data = result.data[sku];
        if (data && data.total) {
          console.log(`  ${sku}: ${data.total.orderCount} 个订单, ${data.total.salesQuantity} 件`);
          totalOrders += data.total.orderCount;
          totalQuantity += data.total.salesQuantity;
          
          // 估算订单项数量（假设每个订单平均有多个项）
          // 这只是估算，实际的order_items数量可能不同
          totalOrderItems += data.total.orderCount;
        }
      });
      
      console.log(`\n汇总:`);
      console.log(`  总订单数: ${totalOrders}`);
      console.log(`  总销量: ${totalQuantity}`);
      
      // 检查是否接近1000
      if (totalOrders === 1000) {
        console.log(`  ⚠️ 警告: 总订单数恰好是1000，可能被截断了！`);
      } else if (totalOrders > 950 && totalOrders < 1050) {
        console.log(`  ⚠️ 注意: 总订单数接近1000 (${totalOrders})，可能有限制`);
      }
      
      // 计算如果没有限制应该有多少
      if (test.skus.includes('AK-VS5-13')) {
        const expectedOrders = 355; // AK-VS5-13单独查询时的订单数
        const actualOrders = result.data['AK-VS5-13']?.total?.orderCount || 0;
        if (actualOrders < expectedOrders) {
          console.log(`  ❌ AK-VS5-13数据丢失: 期望${expectedOrders}个订单，实际${actualOrders}个`);
          console.log(`     丢失了${expectedOrders - actualOrders}个订单`);
        }
      }
    }
  }

  console.log('\n\n========================================');
  console.log('结论');
  console.log('========================================\n');
  
  console.log('问题确认：');
  console.log('1. 当查询多个SKU时，如果结果超过某个限制（可能是1000条），数据会被截断');
  console.log('2. 这个限制可能在数据库查询层面，或者在API处理层面');
  console.log('3. AK-VS5-13的数据被截断是因为它在查询结果的后面部分');
  console.log('\n可能的解决方案：');
  console.log('1. 修改API，移除或增加查询限制');
  console.log('2. 分批查询SKU，每批少于3个');
  console.log('3. 使用分页查询来获取所有数据');
  console.log('4. 优化查询逻辑，避免一次查询太多数据');
}

testLimitTheory().catch(console.error);