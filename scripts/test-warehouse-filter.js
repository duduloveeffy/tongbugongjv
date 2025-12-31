/**
 * 测试仓库筛选逻辑
 */

// 模拟筛选函数
function testWarehouseFilter() {
  const excludeWarehouses = '深圳,德五，美一仓，独立站备货仓';

  const testData = [
    { 产品代码: 'TEST-01', 仓库: '深圳' },
    { 产品代码: 'TEST-02', 仓库: '德五' },
    { 产品代码: 'TEST-03', 仓库: '美一仓' },
    { 产品代码: 'TEST-04', 仓库: '独立站备货仓' },
    { 产品代码: 'TEST-05', 仓库: '东莞' },
    { 产品代码: 'TEST-06', 仓库: '广州' },
    { 产品代码: 'TEST-07', 仓库: '上海' },
  ];

  console.log('排除仓库配置:', excludeWarehouses);
  console.log('');

  const excludeList = excludeWarehouses.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
  console.log('解析后的排除列表:', excludeList);
  console.log('');

  console.log('测试结果:');
  for (const item of testData) {
    const itemWarehouse = (item.仓库 || '').trim();
    const isExcluded = excludeList.some(warehouse => {
      const excludeWarehouse = warehouse.trim();
      const exactMatch = itemWarehouse === excludeWarehouse;
      const includesMatch = itemWarehouse.includes(excludeWarehouse);
      return exactMatch || includesMatch;
    });

    console.log(`  ${item.产品代码} - 仓库: "${item.仓库}" - ${isExcluded ? '❌ 排除' : '✅ 保留'}`);
  }

  const filtered = testData.filter(item => {
    const itemWarehouse = (item.仓库 || '').trim();
    const isExcluded = excludeList.some(warehouse => {
      const excludeWarehouse = warehouse.trim();
      return itemWarehouse === excludeWarehouse || itemWarehouse.includes(excludeWarehouse);
    });
    return !isExcluded;
  });

  console.log('');
  console.log(`筛选结果: ${testData.length} 条记录 → ${filtered.length} 条记录`);
  console.log('保留的产品:', filtered.map(i => i.产品代码).join(', '));
}

testWarehouseFilter();
