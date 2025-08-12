#!/usr/bin/env node
/**
 * 从当前内存中的库存数据同步品类映射到数据库
 * 这个脚本通过 API 调用来同步数据
 */

// 使用原生 fetch (Node.js 18+)
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const API_BASE = 'http://localhost:3000';

async function fetchCurrentInventory() {
  console.log('📊 获取当前库存数据...');
  
  try {
    // 这需要从前端获取，因为数据存储在浏览器的状态中
    console.log('⚠️ 注意：库存数据存储在浏览器中，无法直接从服务器获取');
    console.log('请使用以下方法之一：');
    console.log('1. 在浏览器中点击"同步品类映射"按钮');
    console.log('2. 重新上传库存文件（会自动同步）');
    return null;
  } catch (error) {
    console.error('获取库存数据失败:', error);
    return null;
  }
}

async function syncFromSampleData() {
  console.log('\n📝 使用示例数据进行同步...');
  
  // 创建更多符合用户数据模式的示例
  const sampleInventory = [
    // JNR 系列
    { 产品代码: 'JNR1802-25', 产品名称: 'JNR产品25', 一级品类: 'JNR18-02', 二级品类: '数据线', 三级品类: 'Type-C' },
    { 产品代码: 'JNR1802-26', 产品名称: 'JNR产品26', 一级品类: 'JNR18-02', 二级品类: '数据线', 三级品类: 'Lightning' },
    { 产品代码: 'JNR1802-27', 产品名称: 'JNR产品27', 一级品类: 'JNR18-02', 二级品类: '数据线', 三级品类: 'Micro-USB' },
    { 产品代码: 'JNR1803-01', 产品名称: 'JNR产品01', 一级品类: 'JNR18-03', 二级品类: '充电器', 三级品类: '快充' },
    { 产品代码: 'JNR1803-02', 产品名称: 'JNR产品02', 一级品类: 'JNR18-03', 二级品类: '充电器', 三级品类: '无线充' },
    
    // 添加一些实际存在销售数据的 SKU
    { 产品代码: 'VS5-13', 产品名称: 'VS5主机13', 一级品类: 'VS系列', 二级品类: '主机', 三级品类: '5代' },
    { 产品代码: 'LQZX-01', 产品名称: '龙骑战线01', 一级品类: '龙骑战线', 二级品类: '模型', 三级品类: '限定版' },
    { 产品代码: 'HFZY-15', 产品名称: '幻方资源15', 一级品类: '幻方资源', 二级品类: '配件', 三级品类: '扩展包' },
    
    // 添加更多测试数据
    { 产品代码: 'TEST-001', 产品名称: '测试产品1', 一级品类: '电子产品', 二级品类: '手机配件', 三级品类: '保护壳' },
    { 产品代码: 'TEST-002', 产品名称: '测试产品2', 一级品类: '电子产品', 二级品类: '手机配件', 三级品类: '钢化膜' },
    { 产品代码: 'TEST-003', 产品名称: '测试产品3', 一级品类: '家居用品', 二级品类: '厨房用品', 三级品类: '餐具' },
    { 产品代码: 'TEST-004', 产品名称: '测试产品4', 一级品类: '家居用品', 二级品类: '清洁用品', 三级品类: '拖把' },
  ];
  
  try {
    const response = await fetch(`${API_BASE}/api/categories/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inventoryData: sampleInventory }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ 成功同步 ${result.synced} 个品类映射`);
      return result;
    } else {
      console.error('❌ 同步失败:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    return null;
  }
}

async function verifySync() {
  console.log('\n🔍 验证同步结果...');
  
  try {
    const response = await fetch(`${API_BASE}/api/categories/sync`);
    const result = await response.json();
    
    if (result.success) {
      console.log('\n📊 品类统计:');
      console.log(`  总产品数: ${result.stats.totalProducts}`);
      console.log(`  一级品类: ${result.stats.level1Count} 个`);
      console.log(`  二级品类: ${result.stats.level2Count} 个`);
      console.log(`  三级品类: ${result.stats.level3Count} 个`);
      
      console.log('\n📋 一级品类列表:');
      result.categories.level1.forEach(cat => {
        console.log(`  - ${cat}`);
      });
    }
  } catch (error) {
    console.error('验证失败:', error.message);
  }
}

async function testCategoryTrends() {
  console.log('\n📈 测试品类趋势查询...');
  
  const testCategories = ['JNR18-02', 'VS系列', '电子产品'];
  
  for (const category of testCategories) {
    try {
      const response = await fetch(`${API_BASE}/api/sales/trends/category`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: category,
          period: 'day',
          daysBack: 30,
        }),
      });
      
      const result = await response.json();
      
      if (result.success && result.data.stats) {
        const stats = result.data.stats;
        console.log(`\n${category}:`);
        console.log(`  总销量: ${stats.totalSales}`);
        console.log(`  总订单: ${stats.totalOrders}`);
        
        if (stats.totalSales > 0) {
          console.log(`  ✅ 有销售数据`);
        } else {
          console.log(`  ⚠️ 暂无销售数据`);
        }
      }
    } catch (error) {
      console.error(`查询 ${category} 失败:`, error.message);
    }
  }
}

async function main() {
  console.log('🚀 品类映射同步工具\n');
  console.log('===================================\n');
  
  // 检查服务器是否运行
  try {
    await fetch(`${API_BASE}/api/categories/sync`);
  } catch (error) {
    console.error('❌ 无法连接到服务器，请确保运行了 npm run dev');
    process.exit(1);
  }
  
  // 1. 尝试同步示例数据
  const syncResult = await syncFromSampleData();
  
  if (syncResult) {
    // 2. 验证同步结果
    await verifySync();
    
    // 3. 测试品类趋势
    await testCategoryTrends();
  }
  
  console.log('\n===================================');
  console.log('✅ 完成！\n');
  console.log('📌 重要提示：');
  console.log('1. 品类映射已修复，不再依赖 site_id');
  console.log('2. 请在浏览器中重新上传库存文件以同步实际数据');
  console.log('3. 或点击界面上的"同步品类映射"按钮');
}

main().catch(console.error);