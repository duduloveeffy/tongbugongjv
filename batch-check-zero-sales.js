// 批量检查零销量SKU的脚本
// 用于验证这些SKU是否真的没有销量，还是同步问题

// 需要检查的SKU列表（从您的截图中提取的部分SKU）
const skusToCheck = [
  'AK-VS5-13',
  'AK-VS5-11', 
  'AK-VS5-10',
  'AK-VS5-07',
  'AK-VS2-01',
  'AK-VS2-09',
  'AK-VS2-11',
  'AK-VS2-12',
  'AK-VS2-13',
  'AK-VS2-14',
  'AK-VS2-15',
  // 添加更多需要检查的SKU
];

async function batchCheckSKUs() {
  console.log(`\n========================================`);
  console.log(`批量检查零销量SKU`);
  console.log(`检查数量: ${skusToCheck.length} 个SKU`);
  console.log(`========================================\n`);

  const results = {
    foundInDB: [],
    notFoundInDB: [],
    errors: []
  };

  try {
    // 1. 批量检查Supabase销量数据
    console.log('1. 批量检查Supabase销量数据...\n');
    
    const response = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        skus: skusToCheck,
        siteIds: [], // 查询所有站点
        statuses: ['completed', 'processing', 'pending', 'on-hold'], // 包含所有可能的订单状态
        daysBack: 365, // 查询一年内的数据
        strictMatch: false
      })
    });

    if (!response.ok) {
      console.error('❌ API请求失败:', response.status);
      return;
    }

    const result = await response.json();
    
    console.log('📊 总体结果:');
    console.log(`- 查询SKU数: ${result.processedSkus}`);
    console.log(`- 数据源: ${result.source}`);
    
    // 分析每个SKU的结果
    console.log('\n📋 SKU检查结果:\n');
    console.log('SKU          | 总订单数 | 总销量 | 30天订单 | 30天销量 | 状态');
    console.log('-------------|---------|--------|----------|----------|--------');
    
    skusToCheck.forEach(sku => {
      const skuData = result.data[sku];
      if (skuData && skuData.total) {
        const total = skuData.total;
        const hasData = total.salesQuantity > 0;
        
        console.log(
          `${sku.padEnd(12)} | ${String(total.orderCount).padEnd(7)} | ${String(total.salesQuantity).padEnd(6)} | ${String(total.orderCount30d).padEnd(8)} | ${String(total.salesQuantity30d).padEnd(8)} | ${hasData ? '✅ 有销量' : '❌ 无销量'}`
        );
        
        if (hasData) {
          results.foundInDB.push({
            sku,
            orders: total.orderCount,
            quantity: total.salesQuantity
          });
        } else {
          results.notFoundInDB.push(sku);
        }
      } else {
        console.log(`${sku.padEnd(12)} | 0       | 0      | 0        | 0        | ❌ 无数据`);
        results.notFoundInDB.push(sku);
      }
    });

    // 2. 统计分析
    console.log('\n\n📊 统计分析:');
    console.log(`- 有销量的SKU: ${results.foundInDB.length} 个`);
    console.log(`- 无销量的SKU: ${results.notFoundInDB.length} 个`);
    
    if (results.foundInDB.length > 0) {
      console.log('\n✅ 有销量的SKU详情:');
      results.foundInDB.forEach(item => {
        console.log(`  - ${item.sku}: ${item.orders} 个订单, ${item.quantity} 件`);
      });
    }
    
    if (results.notFoundInDB.length > 0) {
      console.log('\n❌ 无销量的SKU列表:');
      console.log('  ' + results.notFoundInDB.join(', '));
    }

    // 3. 直接查询数据库验证
    console.log('\n\n3. 直接数据库验证（抽样检查）...\n');
    
    // 抽取前3个无销量的SKU进行详细检查
    const samplesToCheck = results.notFoundInDB.slice(0, 3);
    
    for (const sku of samplesToCheck) {
      console.log(`\n检查 ${sku}:`);
      
      const checkResponse = await fetch('http://localhost:3000/api/debug/check-sku', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sku: sku,
          checkType: 'items'
        })
      });

      if (checkResponse.ok) {
        const checkResult = await checkResponse.json();
        console.log(`  - 精确匹配: ${checkResult.exactMatch} 条`);
        console.log(`  - 大写匹配: ${checkResult.upperMatch} 条`);
        console.log(`  - 小写匹配: ${checkResult.lowerMatch} 条`);
        console.log(`  - 模糊匹配: ${checkResult.fuzzyMatch} 条`);
        
        // 检查产品表
        const productCheckResponse = await fetch('http://localhost:3000/api/debug/check-sku', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sku: sku,
            checkType: 'full'
          })
        });
        
        if (productCheckResponse.ok) {
          const productResult = await productCheckResponse.json();
          const diagnostic = productResult.diagnostic;
          console.log(`  - 产品表: ${diagnostic.results.products.count} 条`);
          console.log(`  - 变体表: ${diagnostic.results.variations.count} 条`);
        }
      }
    }

    // 4. 诊断建议
    console.log('\n\n🔍 诊断结果与建议:');
    
    if (results.notFoundInDB.length > 0) {
      console.log('\n发现问题:');
      console.log(`- ${results.notFoundInDB.length} 个SKU在数据库中没有销量记录`);
      console.log('\n可能原因:');
      console.log('1. 这些产品确实没有销售过（新品或滞销品）');
      console.log('2. WooCommerce订单未完全同步到数据库');
      console.log('3. SKU格式不匹配（大小写、空格等）');
      console.log('4. 产品在某些站点有销售但未同步');
      
      console.log('\n建议操作:');
      console.log('1. 执行全量订单同步，确保所有订单都已同步');
      console.log('2. 执行全量产品同步，确保产品信息完整');
      console.log('3. 使用数据完整性验证功能检查同步状态');
      console.log('4. 检查WooCommerce后台这些产品的实际销售情况');
    } else {
      console.log('\n✅ 所有检查的SKU都有销量数据！');
    }

  } catch (error) {
    console.error('\n❌ 批量检查失败:', error.message);
    console.error('错误详情:', error);
  }
}

// 运行批量检查
batchCheckSKUs().then(() => {
  console.log('\n========================================');
  console.log('批量检查完成');
  console.log('========================================\n');
  process.exit(0);
}).catch(error => {
  console.error('检查异常终止:', error);
  process.exit(1);
});