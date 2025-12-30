/**
 * 自动同步诊断脚本
 * 检查自动同步配置和站点设置
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function diagnose() {
  console.log('=== 自动同步诊断工具 ===\n');

  // 1. 检查自动同步配置
  console.log('1. 检查自动同步配置...');
  const { data: config, error: configError } = await supabase
    .from('auto_sync_config')
    .select('*')
    .eq('name', 'default')
    .single();

  if (configError) {
    console.log('   ❌ 读取配置失败:', configError.message);
    return;
  }

  if (!config) {
    console.log('   ❌ 未找到配置（需要先在自动同步页面保存配置）');
    return;
  }

  console.log(`   ✅ 找到配置`);
  console.log(`   - enabled: ${config.enabled ? '✅ 已启用' : '❌ 未启用'}`);
  console.log(`   - site_ids: ${config.site_ids?.length || 0} 个站点`);
  console.log(`   - filters.isMergedMode: ${config.filters?.isMergedMode}`);
  console.log(`   - filters.excludeWarehouses: ${config.filters?.excludeWarehouses || '(无)'}`);
  console.log();

  if (!config.enabled) {
    console.log('   ⚠️  自动同步未启用！Cron 任务会跳过执行');
    console.log('   解决方法：在自动同步页面勾选"启用自动同步"并保存配置\n');
  }

  if (!config.site_ids || config.site_ids.length === 0) {
    console.log('   ⚠️  未配置站点！');
    console.log('   解决方法：在自动同步页面选择要同步的站点并保存配置\n');
    return;
  }

  // 2. 检查站点状态
  console.log('2. 检查站点状态...');
  const { data: sites, error: sitesError } = await supabase
    .from('wc_sites')
    .select('id, name, enabled')
    .in('id', config.site_ids);

  if (sitesError) {
    console.log('   ❌ 读取站点失败:', sitesError.message);
    return;
  }

  const enabledSites = sites.filter(s => s.enabled);
  const disabledSites = sites.filter(s => !s.enabled);

  console.log(`   - 总共: ${sites.length} 个站点`);
  console.log(`   - 已启用: ${enabledSites.length} 个`);
  console.log(`   - 已禁用: ${disabledSites.length} 个`);
  console.log();

  if (enabledSites.length === 0) {
    console.log('   ⚠️  没有启用的站点！');
    console.log('   解决方法：在站点管理页面启用至少一个站点\n');
  }

  // 3. 检查站点筛选配置
  console.log('3. 检查站点筛选配置...');
  const { data: siteFilters, error: filtersError } = await supabase
    .from('site_filters')
    .select('*')
    .in('site_id', config.site_ids);

  if (filtersError) {
    console.log('   ❌ 读取站点筛选配置失败:', filtersError.message);
  } else {
    console.log(`   - 已配置筛选的站点: ${siteFilters.length} 个`);

    if (siteFilters.length === 0) {
      console.log('   ⚠️  所有站点都没有筛选配置！');
      console.log('   这意味着每个站点都会检查全部库存（可能导致超时）');
      console.log('   解决方法：在自动同步页面为每个站点配置 SKU 筛选并保存\n');
    } else {
      siteFilters.forEach(filter => {
        const site = sites.find(s => s.id === filter.site_id);
        console.log(`   - ${site?.name || '未知站点'}:`);
        console.log(`     SKU筛选: ${filter.sku_filter || '(无)'}`);
        console.log(`     排除前缀: ${filter.exclude_sku_prefixes || '(无)'}`);
        console.log(`     分类筛选: ${filter.category_filters?.length || 0} 个`);
        console.log(`     排除仓库: ${filter.exclude_warehouses || '(无)'}`);
      });
    }
  }
  console.log();

  // 4. 检查最近的批次
  console.log('4. 检查最近的同步批次...');
  const { data: batches, error: batchesError } = await supabase
    .from('sync_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (batchesError) {
    console.log('   ❌ 读取批次失败:', batchesError.message);
  } else if (!batches || batches.length === 0) {
    console.log('   ℹ️  还没有任何同步批次');
  } else {
    console.log(`   最近 ${batches.length} 个批次:`);
    batches.forEach((batch, i) => {
      console.log(`   ${i + 1}. ${batch.id}`);
      console.log(`      状态: ${batch.status}`);
      console.log(`      步骤: ${batch.current_step}/${batch.total_sites}`);
      console.log(`      创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
      if (batch.error_message) {
        console.log(`      错误: ${batch.error_message}`);
      }
    });
  }
  console.log();

  // 5. 总结
  console.log('=== 诊断总结 ===');
  const issues = [];

  if (!config.enabled) {
    issues.push('❌ 自动同步未启用');
  }

  if (!config.site_ids || config.site_ids.length === 0) {
    issues.push('❌ 未配置站点');
  } else if (enabledSites.length === 0) {
    issues.push('❌ 没有启用的站点');
  }

  if (siteFilters && siteFilters.length === 0) {
    issues.push('⚠️  所有站点都没有筛选配置（可能超时）');
  }

  if (issues.length === 0) {
    console.log('✅ 配置正常！自动同步应该可以正常运行');
  } else {
    console.log('发现以下问题：');
    issues.forEach(issue => console.log(`  ${issue}`));
  }
}

diagnose().catch(console.error);
