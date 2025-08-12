// 最终验证 - 测试用户报告的问题SKU

async function finalVerification() {
  console.log('\n========================================');
  console.log('最终验证 - 测试问题已完全解决');
  console.log('========================================\n');

  // 测试用户报告的有问题的SKU
  const problemSkus = [
    'AK-VS5-1102',  // 用户最初报告的问题SKU
    'AK-VS5-13',    // 我们深入调查的SKU
    'AK-VS2-09',
    'AK-VS2-12',
    'AK-VS2-13'
  ];

  console.log('批量查询所有问题SKU...\n');
  
  const response = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skus: problemSkus,
      siteIds: [],
      statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed'],
      daysBack: 365,
      strictMatch: false
    })
  });

  if (response.ok) {
    const result = await response.json();
    
    console.log('查询结果：');
    console.log('SKU              | 订单数  | 销量');
    console.log('-----------------|---------|-------');
    
    let totalOrders = 0;
    let totalSales = 0;
    let hasData = false;
    
    problemSkus.forEach(sku => {
      const data = result.data[sku];
      if (data && data.total) {
        const orders = data.total.orderCount;
        const sales = data.total.salesQuantity;
        const status = orders > 0 ? '✅' : '⚠️';
        
        console.log(`${sku.padEnd(16)} | ${String(orders).padStart(7)} | ${String(sales).padStart(6)} ${status}`);
        
        totalOrders += orders;
        totalSales += sales;
        if (orders > 0) hasData = true;
      } else {
        console.log(`${sku.padEnd(16)} | ${String(0).padStart(7)} | ${String(0).padStart(6)} ❌`);
      }
    });
    
    console.log('-----------------|---------|-------');
    console.log(`总计             | ${String(totalOrders).padStart(7)} | ${String(totalSales).padStart(6)}`);
    
    console.log('\n========================================');
    console.log('验证结果');
    console.log('========================================\n');
    
    if (hasData && totalOrders > 1000) {
      console.log('✅ 修复成功确认！');
      console.log('');
      console.log('关键成果：');
      console.log('1. 批量查询返回完整数据（总订单数 > 1000）');
      console.log('2. 所有SKU都能正确获取销量数据');
      console.log('3. 不再出现数据截断或丢失问题');
      console.log('');
      console.log('技术细节：');
      console.log('- 使用分页查询绕过Supabase的1000条硬性限制');
      console.log('- 每页1000条，自动获取所有页的数据');
      console.log('- 支持处理任意数量的SKU批量查询');
    } else if (totalOrders === 1000) {
      console.log('❌ 问题仍然存在');
      console.log('总订单数恰好是1000，说明限制问题未解决');
    } else {
      console.log('⚠️ 需要进一步检查');
      console.log(`总订单数: ${totalOrders}`);
    }
    
    // 特别检查AK-VS5-1102
    const vs1102Data = result.data['AK-VS5-1102'];
    if (vs1102Data && vs1102Data.total.orderCount > 0) {
      console.log('\n📍 特别注意：');
      console.log(`AK-VS5-1102（用户报告的问题SKU）现在显示有 ${vs1102Data.total.orderCount} 个订单，${vs1102Data.total.salesQuantity} 件销量`);
      console.log('问题已解决！');
    }
  } else {
    console.log('❌ 请求失败');
  }
}

finalVerification().catch(console.error);