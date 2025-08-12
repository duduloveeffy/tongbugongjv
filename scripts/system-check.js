#!/usr/bin/env node

/**
 * 系统完整性检查脚本
 * 运行: node scripts/system-check.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🔍 开始系统完整性检查...\n');

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: []
};

function checkResult(name, condition, errorMessage = '') {
  if (condition) {
    console.log(`✅ ${name}`);
    results.passed++;
  } else {
    console.log(`❌ ${name}: ${errorMessage}`);
    results.failed++;
    results.errors.push({ test: name, error: errorMessage });
  }
}

function checkWarning(name, condition, warningMessage = '') {
  if (condition) {
    console.log(`✅ ${name}`);
  } else {
    console.log(`⚠️  ${name}: ${warningMessage}`);
    results.warnings++;
  }
}

// 1. 检查核心文件存在性
console.log('📁 检查核心文件...');
const coreFiles = [
  'package.json',
  'next.config.js',
  'tsconfig.json',
  'src/app/page.tsx',
  'src/lib/supabase.ts',
  'src/store/woocommerce.ts',
  'src/store/multisite.ts',
  'supabase/schema-v2.sql'
];

coreFiles.forEach(filePath => {
  const exists = fs.existsSync(path.join(projectRoot, filePath));
  checkResult(`文件存在: ${filePath}`, exists, `文件不存在: ${filePath}`);
});

// 2. 检查API端点
console.log('\n🔌 检查API端点...');
const apiRoutes = [
  'src/app/api/wc-orders/route.ts',
  'src/app/api/wc-sales-analysis/route.ts',
  'src/app/api/webhook/orders/route.ts',
  'src/app/api/webhook/products/route.ts',
  'src/app/api/webhook/endpoints/route.ts',
  'src/app/api/webhook/events/route.ts'
];

apiRoutes.forEach(routePath => {
  const exists = fs.existsSync(path.join(projectRoot, routePath));
  checkResult(`API端点: ${routePath}`, exists, `API端点不存在: ${routePath}`);
});

// 3. 检查组件
console.log('\n🧩 检查组件...');
const components = [
  'src/components/inventory/InventoryUpload.tsx',
  'src/components/sales/SalesDetectionControls.tsx',
  'src/components/sync/ProductSyncControls.tsx',
  'src/components/webhook/WebhookManager.tsx'
];

components.forEach(componentPath => {
  const exists = fs.existsSync(path.join(projectRoot, componentPath));
  checkResult(`组件: ${componentPath}`, exists, `组件不存在: ${componentPath}`);
});

// 4. 检查Webhook插件
console.log('\n🔗 检查Webhook插件...');
const pluginFiles = [
  'wc-sync-plugin/wc-realtime-sync.php',
  'wc-sync-plugin/includes/class-webhook-manager.php',
  'wc-sync-plugin/includes/class-data-formatter.php',
  'wc-sync-plugin/includes/class-security.php'
];

pluginFiles.forEach(pluginPath => {
  const exists = fs.existsSync(path.join(projectRoot, pluginPath));
  checkResult(`插件文件: ${pluginPath}`, exists, `插件文件不存在: ${pluginPath}`);
});

// 5. 检查文档
console.log('\n📚 检查文档...');
const docs = [
  'docs/WEBHOOK_SETUP.md',
  'docs/DEPLOYMENT_TESTING.md',
  'docs/TROUBLESHOOTING.md',
  'docs/PLUGIN_PACKAGE.md'
];

docs.forEach(docPath => {
  const exists = fs.existsSync(path.join(projectRoot, docPath));
  checkResult(`文档: ${docPath}`, exists, `文档不存在: ${docPath}`);
});

// 6. 检查代码质量
console.log('\n🔍 检查代码质量...');

// 检查TypeScript配置
try {
  const tsconfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'));
  checkResult('TypeScript配置有效', tsconfig.compilerOptions?.strict === true, 'strict模式未启用');
} catch (error) {
  checkResult('TypeScript配置', false, `无法解析tsconfig.json: ${error.message}`);
}

// 检查包依赖
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const hasNextjs = packageJson.dependencies?.next;
  const hasReact = packageJson.dependencies?.react;
  const hasSupabase = packageJson.dependencies?.['@supabase/supabase-js'];
  
  checkResult('Next.js依赖', !!hasNextjs, 'Next.js未安装');
  checkResult('React依赖', !!hasReact, 'React未安装');
  checkResult('Supabase依赖', !!hasSupabase, 'Supabase客户端未安装');
} catch (error) {
  checkResult('依赖检查', false, `无法解析package.json: ${error.message}`);
}

// 7. 检查数据库架构
console.log('\n🗄️  检查数据库架构...');
try {
  const schemaContent = fs.readFileSync(path.join(projectRoot, 'supabase/schema-v2.sql'), 'utf8');
  
  const hasOrdersTable = schemaContent.includes('CREATE TABLE IF NOT EXISTS orders');
  const hasProductsTable = schemaContent.includes('CREATE TABLE IF NOT EXISTS products');
  const hasWebhookTables = schemaContent.includes('CREATE TABLE IF NOT EXISTS webhook_endpoints');
  
  checkResult('订单表定义', hasOrdersTable, 'orders表未定义');
  checkResult('产品表定义', hasProductsTable, 'products表未定义');
  checkResult('Webhook表定义', hasWebhookTables, 'webhook表未定义');
  
  // 检查是否存在已知的SQL错误
  const hasSqlError = schemaContent.includes("INTERVAL '%d days' day");
  checkWarning('SQL语法检查', !hasSqlError, '检测到SQL语法错误，需要应用补丁');
  
} catch (error) {
  checkResult('数据库架构', false, `无法读取schema文件: ${error.message}`);
}

// 8. 检查配置文件
console.log('\n⚙️  检查配置文件...');
try {
  const nextConfig = fs.readFileSync(path.join(projectRoot, 'next.config.js'), 'utf8');
  const hasWebpackConfig = nextConfig.includes('webpack:');
  const hasHeadersConfig = nextConfig.includes('headers()');
  
  checkResult('Next.js配置优化', hasWebpackConfig, 'Webpack配置未优化');
  checkResult('API头部配置', hasHeadersConfig, 'API头部未配置');
} catch (error) {
  checkResult('配置文件检查', false, `无法读取next.config.js: ${error.message}`);
}

// 输出最终结果
console.log('\n' + '='.repeat(50));
console.log('📊 检查结果汇总:');
console.log(`✅ 通过: ${results.passed} 项`);
console.log(`❌ 失败: ${results.failed} 项`);
console.log(`⚠️  警告: ${results.warnings} 项`);

if (results.failed > 0) {
  console.log('\n❌ 发现的错误:');
  results.errors.forEach((error, index) => {
    console.log(`${index + 1}. ${error.test}: ${error.error}`);
  });
}

if (results.failed === 0 && results.warnings === 0) {
  console.log('\n🎉 系统检查完全通过！系统已准备就绪。');
} else if (results.failed === 0) {
  console.log('\n✅ 核心功能检查通过，但有一些警告需要关注。');
} else {
  console.log('\n🔧 发现问题需要修复，请查看上述错误列表。');
}

console.log('\n📋 下一步操作:');
if (results.failed > 0) {
  console.log('1. 修复上述错误');
  console.log('2. 重新运行检查脚本');
}
if (results.warnings > 0) {
  console.log('3. 应用数据库补丁: supabase/patches/002-fix-sql-functions.sql');
}
console.log('4. 运行应用程序: npm run dev');
console.log('5. 测试核心功能');

process.exit(results.failed > 0 ? 1 : 0);