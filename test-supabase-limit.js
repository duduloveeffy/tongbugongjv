// 直接测试Supabase查询限制

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testSupabaseLimit() {
  console.log('\n========================================');
  console.log('直接测试Supabase查询限制');
  console.log('========================================\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // 测试不同的查询方式
  const testCases = [
    {
      name: '默认查询（无limit）',
      query: () => supabase
        .from('order_items')
        .select('*')
        .in('sku', ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'])
    },
    {
      name: '带limit(1000)的查询',
      query: () => supabase
        .from('order_items')
        .select('*')
        .in('sku', ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'])
        .limit(1000)
    },
    {
      name: '带limit(10000)的查询',
      query: () => supabase
        .from('order_items')
        .select('*')
        .in('sku', ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'])
        .limit(10000)
    },
    {
      name: '带range的查询(0-9999)',
      query: () => supabase
        .from('order_items')
        .select('*')
        .in('sku', ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'])
        .range(0, 9999)
    },
    {
      name: '带count的查询',
      query: () => supabase
        .from('order_items')
        .select('*', { count: 'exact' })
        .in('sku', ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'])
        .limit(10000)
    }
  ];

  for (const test of testCases) {
    console.log(`\n测试: ${test.name}`);
    console.log('---');
    
    const { data, error, count } = await test.query();
    
    if (error) {
      console.log(`❌ 错误: ${error.message}`);
    } else {
      console.log(`✅ 成功`);
      console.log(`  返回记录数: ${data?.length || 0}`);
      if (count !== undefined) {
        console.log(`  总记录数(count): ${count}`);
      }
      
      // 统计每个SKU的记录数
      if (data && data.length > 0) {
        const skuCounts = {};
        data.forEach(item => {
          skuCounts[item.sku] = (skuCounts[item.sku] || 0) + 1;
        });
        console.log('  按SKU分布:');
        Object.entries(skuCounts).forEach(([sku, count]) => {
          console.log(`    ${sku}: ${count}条`);
        });
      }
      
      if (data?.length === 1000) {
        console.log('  ⚠️ 警告: 恰好1000条，可能被限制');
      }
    }
  }

  console.log('\n\n========================================');
  console.log('结论');
  console.log('========================================\n');
  
  // 单独测试每个SKU的记录数
  console.log('单独查询每个SKU的实际记录数：');
  const skus = ['AK-VS5-13', 'AK-VS2-09', 'AK-VS2-12'];
  let totalExpected = 0;
  
  for (const sku of skus) {
    const { data, error } = await supabase
      .from('order_items')
      .select('*', { count: 'exact' })
      .eq('sku', sku);
    
    if (!error && data) {
      console.log(`  ${sku}: ${data.length}条`);
      totalExpected += data.length;
    }
  }
  
  console.log(`\n预期总记录数: ${totalExpected}`);
  console.log('如果批量查询返回的记录数少于此值，说明存在限制问题。');
}

testSupabaseLimit().catch(console.error);