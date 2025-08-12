// 刷新销量检测 - 包含所有订单状态

// 从您的截图中提取的46个SKU
const allSkus = [
  'AK-VS5-13', 'AK-VS5-11', 'AK-VS5-10', 'AK-VS5-07',
  'AK-VS2-01', 'AK-VS2-09', 'AK-VS2-11', 'AK-VS2-12',
  'AK-VS2-13', 'AK-VS2-14', 'AK-VS2-15',
  // 添加更多SKU...
];

async function refreshSalesDetection() {
  console.log(`\n========================================`);
  console.log(`刷新销量检测 - 包含所有订单状态`);
  console.log(`检查 ${allSkus.length} 个SKU`);
  console.log(`========================================\n`);

  try {
    console.log('正在检测销量数据（包括所有订单状态）...\n');
    
    const response = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        skus: allSkus,
        siteIds: [], // 查询所有站点
        // 包含所有可能的订单状态
        statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed', 'cancelled', 'refunded'],
        daysBack: 365, // 查询一年内的数据
        strictMatch: false // 使用宽松匹配以确保找到所有数据
      })
    });

    if (!response.ok) {
      console.error('❌ API请求失败:', response.status);
      return;
    }

    const result = await response.json();
    
    console.log('📊 检测结果:\n');
    console.log('SKU          | 总订单 | 总销量 | 30天订单 | 30天销量 | 状态');
    console.log('-------------|--------|--------|----------|----------|----------');
    
    let totalWithSales = 0;
    let totalWithoutSales = 0;
    const salesData = [];
    
    allSkus.forEach(sku => {
      const skuData = result.data[sku];
      if (skuData && skuData.total) {
        const total = skuData.total;
        const hasData = total.salesQuantity > 0;
        
        console.log(
          `${sku.padEnd(12)} | ${String(total.orderCount).padStart(6)} | ${String(total.salesQuantity).padStart(6)} | ${String(total.orderCount30d).padStart(8)} | ${String(total.salesQuantity30d).padStart(8)} | ${hasData ? '✅' : '❌'}`
        );
        
        if (hasData) {
          totalWithSales++;
          salesData.push({
            sku,
            orders: total.orderCount,
            quantity: total.salesQuantity,
            orders30d: total.orderCount30d,
            quantity30d: total.salesQuantity30d
          });
        } else {
          totalWithoutSales++;
        }
      } else {
        console.log(`${sku.padEnd(12)} |      0 |      0 |        0 |        0 | ❌`);
        totalWithoutSales++;
      }
    });

    console.log('\n\n📊 统计汇总:');
    console.log(`✅ 有销量的SKU: ${totalWithSales} 个`);
    console.log(`❌ 无销量的SKU: ${totalWithoutSales} 个`);
    console.log(`📦 总计: ${allSkus.length} 个SKU`);
    
    if (salesData.length > 0) {
      // 按30天销量排序
      salesData.sort((a, b) => b.quantity30d - a.quantity30d);
      
      console.log('\n\n🏆 TOP 10 畅销产品（30天）:');
      console.log('排名 | SKU          | 30天订单 | 30天销量 | 总订单 | 总销量');
      console.log('-----|--------------|----------|----------|--------|--------');
      
      salesData.slice(0, 10).forEach((item, index) => {
        console.log(
          `${String(index + 1).padStart(4)} | ${item.sku.padEnd(12)} | ${String(item.orders30d).padStart(8)} | ${String(item.quantity30d).padStart(8)} | ${String(item.orders).padStart(6)} | ${String(item.quantity).padStart(6)}`
        );
      });
    }
    
    console.log('\n\n💡 建议:');
    if (totalWithoutSales > 0) {
      console.log('- 仍有部分SKU显示无销量，可能是新产品或确实没有销售');
      console.log('- 建议检查这些产品在WooCommerce后台的实际情况');
    }
    console.log('- 销量数据已包含所有订单状态（包括失败和取消的订单）');
    console.log('- 如需更准确的数据，可以只统计completed和processing状态的订单');

  } catch (error) {
    console.error('\n❌ 检测失败:', error.message);
  }
}

// 运行刷新检测
refreshSalesDetection().then(() => {
  console.log('\n========================================');
  console.log('销量检测完成');
  console.log('========================================\n');
  process.exit(0);
}).catch(error => {
  console.error('检测异常终止:', error);
  process.exit(1);
});