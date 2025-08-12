// 测试品类映射同步
const testCategorySync = async () => {
  console.log('开始测试品类映射同步...\n');
  
  // 1. 检查当前品类映射状态
  console.log('1. 检查当前品类映射状态:');
  try {
    const checkResponse = await fetch('http://localhost:3000/api/categories/sync');
    const checkData = await checkResponse.json();
    console.log('品类统计:', checkData.stats);
    console.log('一级品类列表:', checkData.categories.level1);
  } catch (error) {
    console.error('检查失败:', error.message);
  }
  
  // 2. 模拟同步一些测试数据
  console.log('\n2. 模拟同步测试品类数据:');
  const testInventoryData = [
    {
      产品代码: 'TEST-SKU-001',
      产品名称: '测试产品1',
      一级品类: '电子产品',
      二级品类: '手机配件',
      三级品类: '充电器',
      可售库存: '100'
    },
    {
      产品代码: 'TEST-SKU-002',
      产品名称: '测试产品2',
      一级品类: '电子产品',
      二级品类: '手机配件',
      三级品类: '数据线',
      可售库存: '200'
    },
    {
      产品代码: 'TEST-SKU-003',
      产品名称: '测试产品3',
      一级品类: '家居用品',
      二级品类: '厨房用品',
      三级品类: '餐具',
      可售库存: '150'
    }
  ];
  
  try {
    const syncResponse = await fetch('http://localhost:3000/api/categories/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryData: testInventoryData })
    });
    const syncData = await syncResponse.json();
    console.log('同步结果:', syncData.message);
    console.log('同步数量:', syncData.synced);
  } catch (error) {
    console.error('同步失败:', error.message);
  }
  
  // 3. 再次检查品类映射状态
  console.log('\n3. 同步后的品类映射状态:');
  try {
    const checkResponse2 = await fetch('http://localhost:3000/api/categories/sync');
    const checkData2 = await checkResponse2.json();
    console.log('品类统计:', checkData2.stats);
    console.log('一级品类列表:', checkData2.categories.level1);
  } catch (error) {
    console.error('检查失败:', error.message);
  }
  
  // 4. 测试品类趋势查询
  console.log('\n4. 测试品类趋势查询（电子产品）:');
  try {
    const trendResponse = await fetch('http://localhost:3000/api/sales/trends/category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: '电子产品',
        period: 'day',
        daysBack: 30
      })
    });
    const trendData = await trendResponse.json();
    if (trendData.success) {
      console.log('查询成功!');
      console.log('统计信息:', trendData.data.stats);
      console.log('趋势数据点数:', trendData.data.trends?.length || 0);
    } else {
      console.log('查询失败:', trendData.error);
    }
  } catch (error) {
    console.error('趋势查询失败:', error.message);
  }
  
  console.log('\n测试完成!');
};

// 运行测试
testCategorySync().catch(console.error);