// 深入调查 AK-VS5-13 的数据不一致问题

const targetSku = 'AK-VS5-13';

async function investigateSku() {
  console.log(`\n========================================`);
  console.log(`深入调查: ${targetSku}`);
  console.log(`========================================\n`);

  try {
    // 1. 获取完整诊断信息
    console.log('1. 获取完整诊断信息...\n');
    
    const response = await fetch('http://localhost:3000/api/debug/check-sku', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sku: targetSku,
        checkType: 'full'
      })
    });

    if (!response.ok) {
      console.error('诊断请求失败');
      return;
    }

    const result = await response.json();
    const diagnostic = result.diagnostic;

    console.log('📊 诊断结果:');
    console.log(`- 订单项数量: ${diagnostic.results.orderItems.count}`);
    console.log(`- 产品数量: ${diagnostic.results.products.count}`);
    console.log(`- 变体数量: ${diagnostic.results.variations.count}`);

    // 显示找到的订单项详情
    if (diagnostic.results.orderItems.items && diagnostic.results.orderItems.items.length > 0) {
      console.log('\n📦 找到的订单项:');
      diagnostic.results.orderItems.items.forEach((item, index) => {
        console.log(`\n订单 ${index + 1}:`);
        console.log(`  - SKU: ${item.sku}`);
        console.log(`  - 数量: ${item.quantity}`);
        console.log(`  - 订单ID: ${item.order_id}`);
        
        if (item.orders) {
          console.log(`  - WC订单号: ${item.orders.order_id}`);
          console.log(`  - 订单日期: ${item.orders.date_created}`);
          console.log(`  - 订单状态: ${item.orders.status}`);
          console.log(`  - 站点: ${item.orders.wc_sites?.name || '未知'}`);
        }
      });
    }

    // 2. 再次尝试销量分析，使用严格匹配
    console.log('\n\n2. 使用严格匹配模式查询销量...\n');
    
    const strictResponse = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        skus: [targetSku],
        siteIds: [],
        statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed', 'cancelled', 'refunded'],
        daysBack: 365,
        strictMatch: true // 使用严格匹配
      })
    });

    if (strictResponse.ok) {
      const strictResult = await strictResponse.json();
      console.log('严格匹配结果:');
      
      if (strictResult.data && strictResult.data[targetSku]) {
        const skuData = strictResult.data[targetSku];
        console.log(`- 总订单数: ${skuData.total.orderCount}`);
        console.log(`- 总销量: ${skuData.total.salesQuantity}`);
        
        if (skuData.bySite && Object.keys(skuData.bySite).length > 0) {
          console.log('\n按站点明细:');
          Object.entries(skuData.bySite).forEach(([siteId, siteData]) => {
            console.log(`  ${siteData.siteName}: ${siteData.salesQuantity} 件`);
          });
        }
      } else {
        console.log('❌ 严格匹配模式下未找到销量数据');
      }
    }

    // 3. 尝试宽松匹配
    console.log('\n3. 使用宽松匹配模式查询销量...\n');
    
    const looseResponse = await fetch('http://localhost:3000/api/sales-analysis/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        skus: [targetSku],
        siteIds: [],
        statuses: ['completed', 'processing', 'pending', 'on-hold', 'failed', 'cancelled', 'refunded'],
        daysBack: 365,
        strictMatch: false // 使用宽松匹配
      })
    });

    if (looseResponse.ok) {
      const looseResult = await looseResponse.json();
      console.log('宽松匹配结果:');
      
      if (looseResult.data && looseResult.data[targetSku]) {
        const skuData = looseResult.data[targetSku];
        console.log(`- 总订单数: ${skuData.total.orderCount}`);
        console.log(`- 总销量: ${skuData.total.salesQuantity}`);
      } else {
        console.log('❌ 宽松匹配模式下也未找到销量数据');
      }
    }

    // 4. 分析问题原因
    console.log('\n\n🔍 问题分析:');
    
    if (diagnostic.results.orderItems.count > 0) {
      console.log('\n发现的问题:');
      console.log('- order_items表中有数据，但销量API返回0');
      console.log('\n可能的原因:');
      
      // 检查订单状态
      const statuses = new Set();
      diagnostic.results.orderItems.items.forEach(item => {
        if (item.orders?.status) {
          statuses.add(item.orders.status);
        }
      });
      
      if (statuses.size > 0) {
        console.log(`- 订单状态包括: ${Array.from(statuses).join(', ')}`);
        
        // 检查是否都是非计算状态
        const nonCountedStatuses = ['cancelled', 'refunded', 'failed', 'trash'];
        const hasOnlyNonCountedStatus = Array.from(statuses).every(s => 
          nonCountedStatuses.includes(s)
        );
        
        if (hasOnlyNonCountedStatus) {
          console.log('  ⚠️ 所有订单都是取消/退款/失败状态，不计入销量');
        }
      }
      
      console.log('\n其他可能原因:');
      console.log('1. 销量API查询逻辑有bug');
      console.log('2. 数据关联问题（orders表关联失败）');
      console.log('3. 站点筛选问题（某些站点被排除）');
      console.log('4. 日期筛选问题（订单日期超出查询范围）');
    }

  } catch (error) {
    console.error('调查失败:', error);
  }
}

investigateSku();