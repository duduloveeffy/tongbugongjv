// 详细调试批量查询问题

const testSku = 'AK-VS5-13';

async function debugBatchQuery() {
  console.log('\n========================================');
  console.log('调试批量查询问题');
  console.log('========================================\n');

  // 设置环境变量以启用调试日志
  process.env.LOG_LEVEL = 'debug';

  // 1. 测试不同的查询组合
  const testCases = [
    {
      name: '单独查询AK-VS5-13',
      skus: ['AK-VS5-13'],
      expected: '应该返回完整数据'
    },
    {
      name: '批量查询2个SKU（包含AK-VS5-13）',
      skus: ['AK-VS5-13', 'AK-VS2-09'],
      expected: 'AK-VS5-13的数据可能不完整'
    },
    {
      name: '批量查询3个SKU',
      skus: ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'],
      expected: 'AK-VS5-13的数据可能不完整'
    },
    {
      name: '批量查询（AK-VS5-13在不同位置）',
      skus: ['AK-VS2-09', 'AK-VS5-13', 'AK-VS2-12'],
      expected: '测试顺序是否影响结果'
    },
    {
      name: '测试大小写变化',
      skus: ['ak-vs5-13'],
      expected: '测试小写是否能匹配'
    },
    {
      name: '测试大写',
      skus: ['AK-VS5-13'.toUpperCase()],
      expected: '测试全大写是否能匹配'
    }
  ];

  console.log('开始测试不同查询组合...\n');

  for (const testCase of testCases) {
    console.log(`\n测试: ${testCase.name}`);
    console.log(`SKUs: ${testCase.skus.join(', ')}`);
    console.log(`预期: ${testCase.expected}`);
    console.log('---');

    try {
      const response = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skus: testCase.skus,
          siteIds: [],
          statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed'],
          daysBack: 365,
          strictMatch: false
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // 显示每个SKU的结果
        testCase.skus.forEach(sku => {
          const data = result.data[sku];
          if (data && data.total) {
            console.log(`  ${sku}: 订单=${data.total.orderCount}, 销量=${data.total.salesQuantity}`);
          } else {
            console.log(`  ${sku}: 无数据`);
          }
        });

        // 特别关注AK-VS5-13
        const targetData = result.data['AK-VS5-13'] || result.data['ak-vs5-13'] || result.data['AK-VS5-13'.toUpperCase()];
        if (targetData) {
          console.log(`  -> AK-VS5-13实际数据: 订单=${targetData.total.orderCount}, 销量=${targetData.total.salesQuantity}`);
        }
      } else {
        console.log('  请求失败:', response.status);
      }
    } catch (error) {
      console.log('  错误:', error.message);
    }
  }

  // 2. 直接查询数据库分析
  console.log('\n\n========================================');
  console.log('直接数据库分析');
  console.log('========================================\n');

  const dbResponse = await fetch('http://localhost:3000/api/debug/check-sku', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sku: testSku,
      checkType: 'items'
    })
  });

  if (dbResponse.ok) {
    const dbResult = await dbResponse.json();
    console.log('数据库中的SKU格式:');
    console.log(`- 精确匹配(${testSku}): ${dbResult.exactMatch} 条`);
    console.log(`- 大写匹配: ${dbResult.upperMatch} 条`);
    console.log(`- 小写匹配: ${dbResult.lowerMatch} 条`);
    
    // 显示实际的SKU格式
    if (dbResult.exactItems && dbResult.exactItems.length > 0) {
      console.log('\n实际SKU示例:');
      dbResult.exactItems.slice(0, 3).forEach(item => {
        console.log(`  - "${item.sku}" (数量: ${item.quantity})`);
      });
    }
  }

  // 3. 分析结论
  console.log('\n\n========================================');
  console.log('问题分析');
  console.log('========================================\n');
  
  console.log('可能的问题原因:');
  console.log('1. 批量查询时的SKU映射逻辑有bug');
  console.log('2. 数据库查询的IN条件在处理多个SKU时有问题');
  console.log('3. 订单状态筛选在批量查询时被错误应用');
  console.log('4. 分批处理逻辑导致数据丢失');
  console.log('5. SKU大小写匹配问题');
}

debugBatchQuery().then(() => {
  console.log('\n调试完成\n');
}).catch(error => {
  console.error('调试失败:', error);
});