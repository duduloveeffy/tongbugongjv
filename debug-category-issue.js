// 调试品类数据问题
const debugCategoryIssue = async () => {
  console.log('=== 调试品类数据问题 ===\n');
  
  const SKU = 'JNR1802-25'; // 从截图中看到的SKU
  const CATEGORY = 'JNR18-02'; // 从截图中看到的一级品类
  
  // 1. 检查品类映射表中是否有这个SKU
  console.log('1. 检查品类映射表:');
  try {
    const response = await fetch('http://localhost:3000/api/categories/sync');
    const data = await response.json();
    console.log('总产品数:', data.stats.totalProducts);
    console.log('一级品类列表:', data.categories.level1);
    
    // 手动检查是否包含目标品类
    if (data.categories.level1.includes(CATEGORY)) {
      console.log(`✓ 找到品类 "${CATEGORY}"`);
    } else {
      console.log(`✗ 未找到品类 "${CATEGORY}"`);
      console.log('提示: 需要重新上传库存文件以同步品类映射');
    }
  } catch (error) {
    console.error('API错误:', error.message);
  }
  
  // 2. 直接查询品类趋势
  console.log(`\n2. 查询品类 "${CATEGORY}" 的趋势数据:`);
  try {
    const trendResponse = await fetch('http://localhost:3000/api/sales/trends/category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: CATEGORY,
        period: 'day',
        daysBack: 30
      })
    });
    
    const trendData = await trendResponse.json();
    if (trendData.success) {
      console.log('查询成功!');
      const stats = trendData.data.stats;
      console.log('总订单数:', stats.totalOrders);
      console.log('总销量:', stats.totalSales);
      
      // 检查是否有实际数据
      if (stats.totalSales > 0) {
        console.log('✓ 品类有销售数据');
        
        // 显示前5个数据点
        const trends = trendData.data.trends.slice(0, 5);
        console.log('\n前5天数据:');
        trends.forEach(t => {
          console.log(`  ${t.period_label}: 销量=${t.sales_quantity}, 订单=${t.order_count}`);
        });
      } else {
        console.log('✗ 品类没有销售数据');
        console.log('\n可能的原因:');
        console.log('1. product_categories 表中没有该品类的SKU映射');
        console.log('2. 该品类下的SKU在订单中没有销售记录');
        console.log('3. 品类名称不匹配（大小写、空格等）');
      }
      
      // 检查该品类下有哪些SKU
      if (trendData.data.topSkus && trendData.data.topSkus.length > 0) {
        console.log('\n该品类下的TOP SKUs:');
        trendData.data.topSkus.forEach(sku => {
          console.log(`  ${sku.sku}: 销量=${sku.sales_quantity}`);
        });
      }
    } else {
      console.log('查询失败:', trendData.error);
    }
  } catch (error) {
    console.error('请求错误:', error.message);
  }
  
  // 3. 查询SKU的品类信息
  console.log(`\n3. 查询SKU "${SKU}" 的品类信息:`);
  try {
    const skuResponse = await fetch(`http://localhost:3000/api/sales/trends/sku?sku=${SKU}`);
    const skuData = await skuResponse.json();
    
    if (skuData.success && skuData.data.category) {
      console.log('SKU的品类信息:');
      console.log('  一级品类:', skuData.data.category.category_level1);
      console.log('  二级品类:', skuData.data.category.category_level2);
      console.log('  三级品类:', skuData.data.category.category_level3);
      
      if (skuData.data.category.category_level1 !== CATEGORY) {
        console.log(`\n⚠️ 警告: SKU的一级品类是 "${skuData.data.category.category_level1}"，但图表显示是 "${CATEGORY}"`);
        console.log('这可能是数据不一致的原因');
      }
    } else {
      console.log('✗ 该SKU在品类映射表中没有记录');
      console.log('解决方案: 重新上传包含该SKU品类信息的库存文件');
    }
  } catch (error) {
    console.error('请求错误:', error.message);
  }
  
  console.log('\n=== 调试完成 ===');
};

// 运行调试
debugCategoryIssue().catch(console.error);