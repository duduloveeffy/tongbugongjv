// 测试脚本：检查特定SKU的销量数据
// 使用方法：node test-sku-sales.js

const testSku = 'AK-VS5-1102';

async function testSkuSales() {
  console.log(`\n========================================`);
  console.log(`检查 SKU: ${testSku} 的销量数据`);
  console.log(`========================================\n`);

  try {
    // 测试Supabase数据源
    console.log('1. 测试从Supabase获取销量数据...');
    const response = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        skus: [testSku],
        siteIds: [], // 空数组表示查询所有站点
        statuses: ['completed', 'processing', 'pending'],
        daysBack: 30,
        strictMatch: false // 使用宽松匹配
      })
    });

    if (!response.ok) {
      console.error('❌ API请求失败:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('错误详情:', errorText);
      return;
    }

    const result = await response.json();
    
    console.log('\n📊 API响应:');
    console.log('- 成功:', result.success);
    console.log('- 数据源:', result.source);
    console.log('- 处理的SKU数:', result.processedSkus);
    
    if (result.sites && result.sites.length > 0) {
      console.log('\n🏪 站点信息:');
      result.sites.forEach(site => {
        console.log(`  - ${site.name}: ${site.url}`);
      });
    }

    if (result.data && result.data[testSku]) {
      const skuData = result.data[testSku];
      console.log(`\n✅ 找到 ${testSku} 的销量数据:`);
      console.log('\n📈 总计:');
      console.log(`  - 总订单数: ${skuData.total.orderCount}`);
      console.log(`  - 总销售数量: ${skuData.total.salesQuantity}`);
      console.log(`  - 30天订单数: ${skuData.total.orderCount30d}`);
      console.log(`  - 30天销售数量: ${skuData.total.salesQuantity30d}`);
      
      if (skuData.bySite && Object.keys(skuData.bySite).length > 0) {
        console.log('\n📍 按站点明细:');
        Object.entries(skuData.bySite).forEach(([siteId, siteData]) => {
          console.log(`\n  站点ID: ${siteId}`);
          if (siteData.siteName) {
            console.log(`  站点名称: ${siteData.siteName}`);
          }
          console.log(`  - 订单数: ${siteData.orderCount}`);
          console.log(`  - 销售数量: ${siteData.salesQuantity}`);
          console.log(`  - 30天订单数: ${siteData.orderCount30d}`);
          console.log(`  - 30天销售数量: ${siteData.salesQuantity30d}`);
          if (siteData.lastOrderDate) {
            console.log(`  - 最后订单日期: ${siteData.lastOrderDate}`);
          }
        });
      }
    } else {
      console.log(`\n❌ 未找到 ${testSku} 的销量数据`);
      console.log('可能的原因:');
      console.log('1. 数据库中没有该SKU的订单记录');
      console.log('2. WooCommerce订单还未同步到数据库');
      console.log('3. SKU格式不匹配（大小写、空格等）');
      
      // 尝试不同的SKU格式
      console.log('\n尝试其他格式...');
      const alternativeFormats = [
        testSku.toLowerCase(),
        testSku.toUpperCase(),
        testSku.replace(/-/g, ''),
        testSku.replace(/-/g, ' ')
      ];
      
      for (const altSku of alternativeFormats) {
        if (altSku !== testSku) {
          console.log(`\n测试格式: "${altSku}"`);
          const altResponse = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              skus: [altSku],
              siteIds: [],
              statuses: ['completed', 'processing', 'pending'],
              daysBack: 30,
              strictMatch: true // 使用严格匹配
            })
          });
          
          if (altResponse.ok) {
            const altResult = await altResponse.json();
            if (altResult.data && altResult.data[altSku]) {
              const altData = altResult.data[altSku];
              console.log(`✅ 找到数据！总销量: ${altData.total.salesQuantity}`);
            } else {
              console.log('❌ 未找到数据');
            }
          }
        }
      }
    }

    // 显示完整的返回数据（用于调试）
    if (process.env.DEBUG === 'true') {
      console.log('\n🔍 完整响应数据:');
      console.log(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }
}

// 运行测试
testSkuSales().then(() => {
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================\n');
  process.exit(0);
}).catch(error => {
  console.error('测试异常终止:', error);
  process.exit(1);
});