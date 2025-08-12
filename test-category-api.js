#!/usr/bin/env node
/**
 * 测试品类趋势 API
 */

async function testCategoryAPI() {
  console.log('🔍 测试品类趋势 API\n');
  
  const category = 'JNR18-02';
  
  try {
    // 测试品类趋势API
    console.log(`测试品类: ${category}`);
    const response = await fetch('http://localhost:3000/api/sales/trends/category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: category,
        period: 'day',
        daysBack: 30,
      }),
    });
    
    const result = await response.json();
    
    console.log('\nAPI 响应:');
    console.log('success:', result.success);
    
    if (result.success && result.data) {
      console.log('\n统计数据:');
      console.log('总销量:', result.data.stats?.totalSales);
      console.log('总订单:', result.data.stats?.totalOrders);
      console.log('平均日销量:', result.data.stats?.avgDailySales);
      
      console.log('\n趋势数据点数:', result.data.trends?.length || 0);
      
      if (result.data.trends && result.data.trends.length > 0) {
        console.log('\n前5天数据:');
        result.data.trends.slice(0, 5).forEach(point => {
          console.log(`  ${point.period_label}: 销量=${point.sales_quantity}, 订单=${point.order_count}`);
        });
        
        // 计算总和验证
        const totalFromTrends = result.data.trends.reduce((sum, point) => 
          sum + (point.sales_quantity || 0), 0);
        console.log('\n从趋势数据计算的总销量:', totalFromTrends);
      }
      
      // 检查TOP SKUs
      if (result.data.topSkus && result.data.topSkus.length > 0) {
        console.log('\nTOP 5 SKUs:');
        result.data.topSkus.slice(0, 5).forEach(sku => {
          console.log(`  ${sku.sku}: 销量=${sku.sales_quantity}`);
        });
      }
    } else {
      console.log('\n错误:', result.error || '未知错误');
    }
    
    // 测试单个SKU
    console.log('\n\n测试单个SKU: JNR1802-01');
    const skuResponse = await fetch('http://localhost:3000/api/sales/trends/sku', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: 'JNR1802-01',
        period: 'day',
        daysBack: 30,
      }),
    });
    
    const skuResult = await skuResponse.json();
    
    if (skuResult.success && skuResult.data) {
      console.log('SKU总销量:', skuResult.data.stats?.totalSales);
      const skuTotalFromTrends = skuResult.data.trends?.reduce((sum, point) => 
        sum + (point.sales_quantity || 0), 0) || 0;
      console.log('SKU从趋势计算的总销量:', skuTotalFromTrends);
    }
    
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

testCategoryAPI().catch(console.error);