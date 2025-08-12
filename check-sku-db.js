// 直接检查数据库中的SKU数据
// 使用方法：node check-sku-db.js

const testSku = 'AK-VS5-1102';

async function checkDatabase() {
  console.log(`\n========================================`);
  console.log(`数据库检查: ${testSku}`);
  console.log(`========================================\n`);

  try {
    // 1. 检查order_items表中是否有该SKU
    console.log('1. 检查order_items表...');
    const checkItemsResponse = await fetch('http://localhost:3000/api/debug/check-sku', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: testSku,
        checkType: 'items'
      })
    });

    if (checkItemsResponse.ok) {
      const itemsResult = await checkItemsResponse.json();
      console.log('order_items表结果:', itemsResult);
    }

    // 2. 检查类似的SKU
    console.log('\n2. 查找类似的SKU...');
    const similarResponse = await fetch('http://localhost:3000/api/debug/check-sku', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: testSku,
        checkType: 'similar'
      })
    });

    if (similarResponse.ok) {
      const similarResult = await similarResponse.json();
      console.log('相似SKU:', similarResult);
    }

    // 3. 检查最近的订单
    console.log('\n3. 检查最近同步的订单...');
    const recentOrdersResponse = await fetch('http://localhost:3000/api/debug/check-sku', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: testSku,
        checkType: 'recent'
      })
    });

    if (recentOrdersResponse.ok) {
      const recentResult = await recentOrdersResponse.json();
      console.log('最近订单:', recentResult);
    }

  } catch (error) {
    console.error('检查失败:', error);
  }
}

checkDatabase();