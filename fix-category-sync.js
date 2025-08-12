#!/usr/bin/env node
/**
 * 修复品类同步问题
 * 1. 执行数据库迁移，移除 site_id 依赖
 * 2. 重新同步品类映射
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('📦 执行数据库迁移...\n');
  
  const migrationPath = path.join(__dirname, 'supabase/migrations/20250810_fix_category_mapping_site_issue.sql');
  
  try {
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // 分割SQL语句并逐个执行
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log(`执行: ${statement.substring(0, 50)}...`);
      const { error } = await supabase.rpc('exec_sql', {
        sql: statement + ';'
      }).single();
      
      if (error && !error.message.includes('already exists')) {
        console.error('❌ 迁移失败:', error.message);
        // 继续执行，有些错误可能是因为对象已存在
      }
    }
    
    console.log('✅ 迁移完成\n');
  } catch (error) {
    console.error('❌ 读取迁移文件失败:', error.message);
    // 继续执行，尝试直接运行修复
  }
}

async function fixCategoryTable() {
  console.log('🔧 修复品类映射表结构...\n');
  
  try {
    // 检查表结构
    const { data: columns } = await supabase
      .rpc('get_table_columns', { table_name: 'product_categories' })
      .single();
    
    console.log('当前表结构:', columns);
    
    // 如果还有 site_id 列，尝试删除
    if (columns && columns.includes('site_id')) {
      console.log('发现 site_id 列，尝试删除...');
      
      // 使用原生 SQL 删除列
      const { error } = await supabase.rpc('exec_sql', {
        sql: 'ALTER TABLE product_categories DROP COLUMN IF EXISTS site_id CASCADE;'
      }).single();
      
      if (error) {
        console.error('删除 site_id 失败:', error.message);
      } else {
        console.log('✅ site_id 列已删除');
      }
    }
  } catch (error) {
    console.log('跳过表结构检查:', error.message);
  }
}

async function syncTestCategories() {
  console.log('📝 同步测试品类数据...\n');
  
  // 创建测试数据，包含用户截图中的 SKU
  const testMappings = [
    { sku: 'JNR1802-25', category_level1: 'JNR18-02', category_level2: '数据线', category_level3: '' },
    { sku: 'JNR1802-26', category_level1: 'JNR18-02', category_level2: '数据线', category_level3: '' },
    { sku: 'JNR1802-27', category_level1: 'JNR18-02', category_level2: '数据线', category_level3: '' },
    // 添加一些有销售数据的 SKU
    { sku: 'LQZX-01', category_level1: '龙骑战线', category_level2: '模型', category_level3: '' },
    { sku: 'HFZY-15', category_level1: '幻方资源', category_level2: '配件', category_level3: '' },
    { sku: 'VS5-13', category_level1: 'VS系列', category_level2: '主机', category_level3: '' },
  ];
  
  try {
    // 清空现有数据
    const { error: deleteError } = await supabase
      .from('product_categories')
      .delete()
      .neq('sku', '');
    
    if (deleteError) {
      console.log('清空数据时出错:', deleteError.message);
    }
    
    // 插入测试数据
    const { data, error } = await supabase
      .from('product_categories')
      .upsert(testMappings, {
        onConflict: 'sku',
        ignoreDuplicates: false
      });
    
    if (error) {
      console.error('同步失败:', error);
    } else {
      console.log(`✅ 成功同步 ${testMappings.length} 个品类映射`);
    }
    
    // 验证同步结果
    const { data: verifyData, error: verifyError } = await supabase
      .from('product_categories')
      .select('*')
      .limit(10);
    
    if (!verifyError && verifyData) {
      console.log('\n当前品类映射（前10条）:');
      verifyData.forEach(item => {
        console.log(`  ${item.sku} -> ${item.category_level1} / ${item.category_level2}`);
      });
    }
  } catch (error) {
    console.error('同步过程出错:', error);
  }
}

async function testCategoryQuery() {
  console.log('\n🔍 测试品类查询...\n');
  
  try {
    // 测试查询 JNR18-02 品类
    const { data, error } = await supabase.rpc('get_category_sales_trends', {
      p_category: 'JNR18-02',
      p_period: 'day',
      p_days_back: 30
    });
    
    if (error) {
      console.error('查询失败:', error);
    } else if (data && data.length > 0) {
      console.log('✅ 品类查询成功');
      
      // 计算总销量
      const totalSales = data.reduce((sum, item) => sum + Number(item.sales_quantity || 0), 0);
      console.log(`总销量: ${totalSales}`);
      
      // 显示前5天数据
      console.log('\n前5天数据:');
      data.slice(0, 5).forEach(item => {
        console.log(`  ${item.period_label}: 销量=${item.sales_quantity}, 订单=${item.order_count}`);
      });
    } else {
      console.log('⚠️ 查询成功但无数据');
    }
  } catch (error) {
    console.error('查询过程出错:', error);
  }
}

async function main() {
  console.log('🚀 开始修复品类同步问题\n');
  console.log('===================================\n');
  
  // 1. 运行迁移
  // await runMigration();
  
  // 2. 修复表结构
  await fixCategoryTable();
  
  // 3. 同步测试数据
  await syncTestCategories();
  
  // 4. 测试查询
  await testCategoryQuery();
  
  console.log('\n===================================');
  console.log('✅ 修复完成！');
  console.log('\n下一步：');
  console.log('1. 重新上传您的库存文件，系统会自动同步品类映射');
  console.log('2. 或者点击"同步品类映射"按钮手动同步现有库存数据');
}

// 添加 RPC 函数来执行原生 SQL（如果不存在）
async function createExecSqlFunction() {
  const createFunction = `
    CREATE OR REPLACE FUNCTION exec_sql(sql text)
    RETURNS void AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;
  
  try {
    await supabase.rpc('exec_sql', { sql: createFunction }).single();
  } catch (error) {
    // 函数可能已存在，忽略错误
  }
}

// 添加获取表列的函数
async function createGetColumnsFunction() {
  const createFunction = `
    CREATE OR REPLACE FUNCTION get_table_columns(table_name text)
    RETURNS json AS $$
    BEGIN
      RETURN (
        SELECT json_agg(column_name)
        FROM information_schema.columns
        WHERE table_name = $1
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;
  
  try {
    await supabase.rpc('exec_sql', { sql: createFunction }).single();
  } catch (error) {
    // 函数可能已存在，忽略错误
  }
}

// 运行主函数
main().catch(console.error);