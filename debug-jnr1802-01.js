#!/usr/bin/env node
/**
 * 调试 JNR1802-01 的品类映射问题
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugJNR1802() {
  console.log('🔍 调试 JNR1802-01 品类映射问题\n');
  console.log('===================================\n');
  
  const SKU = 'JNR1802-01';
  const EXPECTED_CATEGORY = 'JNR18-02';
  
  // 1. 检查品类映射表
  console.log('1. 检查品类映射表中的 SKU:');
  const { data: categoryData, error: categoryError } = await supabase
    .from('product_categories')
    .select('*')
    .eq('sku', SKU)
    .single();
  
  if (categoryError) {
    console.log(`❌ SKU "${SKU}" 在品类映射表中不存在`);
    console.log('错误:', categoryError.message);
    
    // 尝试插入映射
    console.log('\n尝试添加品类映射...');
    const { error: insertError } = await supabase
      .from('product_categories')
      .insert({
        sku: SKU,
        category_level1: EXPECTED_CATEGORY,
        category_level2: '数据线',
        category_level3: ''
      });
    
    if (insertError) {
      console.log('插入失败:', insertError.message);
    } else {
      console.log('✅ 成功添加品类映射');
    }
  } else {
    console.log('✅ 找到SKU映射:');
    console.log('  SKU:', categoryData.sku);
    console.log('  一级品类:', categoryData.category_level1);
    console.log('  二级品类:', categoryData.category_level2);
    console.log('  三级品类:', categoryData.category_level3);
    
    if (categoryData.category_level1 !== EXPECTED_CATEGORY) {
      console.log(`\n⚠️ 品类不匹配！期望: "${EXPECTED_CATEGORY}", 实际: "${categoryData.category_level1}"`);
    }
  }
  
  // 2. 检查该品类下所有的 SKU
  console.log(`\n2. 检查品类 "${EXPECTED_CATEGORY}" 下的所有 SKU:`);
  const { data: categorySkus, error: skusError } = await supabase
    .from('product_categories')
    .select('sku, category_level2')
    .eq('category_level1', EXPECTED_CATEGORY);
  
  if (skusError) {
    console.log('查询失败:', skusError.message);
  } else {
    console.log(`找到 ${categorySkus?.length || 0} 个 SKU:`);
    categorySkus?.forEach(item => {
      console.log(`  - ${item.sku} (${item.category_level2})`);
    });
  }
  
  // 3. 检查销售数据
  console.log(`\n3. 检查 SKU "${SKU}" 的销售数据:`);
  const { data: salesData, error: salesError } = await supabase
    .from('order_items')
    .select('quantity, orders!inner(date_created, status)')
    .eq('sku', SKU)
    .eq('orders.status', 'completed')
    .gte('orders.date_created', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(5);
  
  if (salesError) {
    console.log('查询失败:', salesError.message);
  } else {
    const totalSales = salesData?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
    console.log(`最近30天销量: ${totalSales}`);
    console.log(`订单数: ${salesData?.length || 0}`);
  }
  
  // 4. 测试品类销售趋势函数
  console.log(`\n4. 测试品类销售趋势函数 (${EXPECTED_CATEGORY}):`);
  const { data: trendData, error: trendError } = await supabase.rpc('get_category_sales_trends', {
    p_category: EXPECTED_CATEGORY,
    p_period: 'day',
    p_days_back: 30
  });
  
  if (trendError) {
    console.log('❌ 函数调用失败:', trendError.message);
  } else {
    const totalCategorySales = trendData?.reduce((sum, item) => 
      sum + Number(item.sales_quantity || 0), 0) || 0;
    console.log(`品类总销量: ${totalCategorySales}`);
    
    if (totalCategorySales === 0) {
      console.log('\n⚠️ 品类销量为0，可能的原因:');
      console.log('1. 品类下没有SKU映射');
      console.log('2. SKU映射的品类名称不匹配');
      console.log('3. 订单数据中没有这些SKU的销售记录');
    } else {
      // 显示前5天的数据
      console.log('\n前5天销售数据:');
      trendData?.slice(0, 5).forEach(item => {
        console.log(`  ${item.period_label}: 销量=${item.sales_quantity}, 订单=${item.order_count}`);
      });
    }
  }
  
  // 5. 批量添加该品类下的测试SKU
  console.log(`\n5. 批量添加 JNR18-02 品类下的 SKU 映射:`);
  const jnrSkus = [
    'JNR1802-01', 'JNR1802-02', 'JNR1802-03', 'JNR1802-04', 'JNR1802-05',
    'JNR1802-06', 'JNR1802-07', 'JNR1802-08', 'JNR1802-09', 'JNR1802-10',
    'JNR1802-11', 'JNR1802-12', 'JNR1802-13', 'JNR1802-14', 'JNR1802-15',
    'JNR1802-16', 'JNR1802-17', 'JNR1802-18', 'JNR1802-19', 'JNR1802-20',
    'JNR1802-21', 'JNR1802-22', 'JNR1802-23', 'JNR1802-24', 'JNR1802-25',
    'JNR1802-26', 'JNR1802-27', 'JNR1802-28', 'JNR1802-29', 'JNR1802-30'
  ];
  
  const mappings = jnrSkus.map(sku => ({
    sku: sku,
    category_level1: 'JNR18-02',
    category_level2: '数据线',
    category_level3: ''
  }));
  
  const { error: upsertError } = await supabase
    .from('product_categories')
    .upsert(mappings, {
      onConflict: 'sku',
      ignoreDuplicates: false
    });
  
  if (upsertError) {
    console.log('批量添加失败:', upsertError.message);
  } else {
    console.log(`✅ 成功添加/更新 ${mappings.length} 个SKU映射`);
  }
  
  // 6. 重新测试品类趋势
  console.log(`\n6. 重新测试品类销售趋势:`);
  const { data: newTrendData, error: newTrendError } = await supabase.rpc('get_category_sales_trends', {
    p_category: EXPECTED_CATEGORY,
    p_period: 'day',
    p_days_back: 30
  });
  
  if (!newTrendError && newTrendData) {
    const newTotalSales = newTrendData.reduce((sum, item) => 
      sum + Number(item.sales_quantity || 0), 0);
    console.log(`品类总销量: ${newTotalSales}`);
    
    if (newTotalSales > 0) {
      console.log('✅ 品类销售数据现在正常显示！');
    }
  }
  
  console.log('\n===================================');
  console.log('✅ 调试完成！');
  console.log('\n建议：请刷新页面查看趋势图是否正常显示');
}

debugJNR1802().catch(console.error);