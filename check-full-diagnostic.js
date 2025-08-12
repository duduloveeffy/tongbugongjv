// 完整诊断脚本
const testSku = 'AK-VS5-1102';

async function fullDiagnostic() {
  console.log(`\n========================================`);
  console.log(`完整诊断: ${testSku}`);
  console.log(`========================================\n`);

  try {
    // 1. 完整数据库诊断
    console.log('运行完整诊断...');
    const response = await fetch('http://localhost:3000/api/debug/check-sku', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: testSku,
        checkType: 'full'
      })
    });

    if (!response.ok) {
      console.error('请求失败:', response.status);
      return;
    }

    const result = await response.json();
    const diagnostic = result.diagnostic;

    console.log(`\n诊断时间: ${diagnostic.timestamp}`);
    console.log(`搜索SKU: ${diagnostic.searchedSku}`);
    
    console.log('\n=== 订单项 (order_items) ===');
    console.log(`找到: ${diagnostic.results.orderItems.count} 条记录`);
    if (diagnostic.results.orderItems.items.length > 0) {
      diagnostic.results.orderItems.items.forEach(item => {
        console.log(`- SKU: ${item.sku}, 数量: ${item.quantity}`);
        if (item.orders) {
          console.log(`  订单ID: ${item.orders.order_id}, 日期: ${item.orders.date_created}`);
          console.log(`  状态: ${item.orders.status}, 站点: ${item.orders.wc_sites?.name}`);
        }
      });
    }

    console.log('\n=== 产品 (products) ===');
    console.log(`找到: ${diagnostic.results.products.count} 条记录`);
    if (diagnostic.results.products.items.length > 0) {
      diagnostic.results.products.items.forEach(product => {
        console.log(`- SKU: ${product.sku}, 名称: ${product.name}`);
        console.log(`  类型: ${product.type}, 状态: ${product.status}`);
      });
    }

    console.log('\n=== 产品变体 (variations) ===');
    console.log(`找到: ${diagnostic.results.variations.count} 条记录`);
    if (diagnostic.results.variations.items.length > 0) {
      diagnostic.results.variations.items.forEach(variation => {
        console.log(`- SKU: ${variation.sku}, 变体ID: ${variation.variation_id}`);
        console.log(`  产品ID: ${variation.product_id}`);
      });
    }

    // 2. 检查WooCommerce站点的产品
    console.log('\n=== 检查WooCommerce站点 ===');
    const sitesResponse = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'GET'
    });

    if (sitesResponse.ok) {
      const sitesData = await sitesResponse.json();
      if (sitesData.sites && sitesData.sites.length > 0) {
        console.log(`\n找到 ${sitesData.sites.length} 个启用的站点:`);
        sitesData.sites.forEach(site => {
          console.log(`- ${site.name}: ${site.url}`);
          console.log(`  最后同步: ${site.last_sync_at || '未同步'}`);
        });
      }
    }

    // 3. 检查是否需要同步
    if (diagnostic.results.orderItems.count === 0 && 
        diagnostic.results.products.count === 0 && 
        diagnostic.results.variations.count === 0) {
      console.log('\n⚠️ 诊断结果:');
      console.log(`SKU "${testSku}" 在数据库中完全不存在`);
      console.log('\n可能的原因:');
      console.log('1. WooCommerce中有该产品，但还未同步到数据库');
      console.log('2. SKU格式不匹配（检查大小写、空格、特殊字符）');
      console.log('3. 该产品在WooCommerce中也不存在');
      console.log('\n建议:');
      console.log('1. 执行全量产品同步');
      console.log('2. 执行全量订单同步');
      console.log('3. 检查WooCommerce后台该产品是否存在');
    }

  } catch (error) {
    console.error('诊断失败:', error);
  }
}

fullDiagnostic();