/**
 * 自动同步诊断脚本
 *
 * 用法: node scripts/diagnose-sync.js [站点名称]
 * 例如: node scripts/diagnose-sync.js vapsolo-de
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function diagnose(siteName) {
  console.log('\n========================================');
  console.log('🔍 自动同步诊断工具');
  console.log('========================================\n');

  // 1. 获取站点信息
  console.log(`📍 查找站点: ${siteName || '全部'}`);

  let siteQuery = supabase.from('wc_sites').select('id, name, url, enabled');
  if (siteName) {
    siteQuery = siteQuery.ilike('name', `%${siteName}%`);
  }

  const { data: sites, error: siteError } = await siteQuery;

  if (siteError) {
    console.error('❌ 查询站点失败:', siteError.message);
    return;
  }

  if (!sites || sites.length === 0) {
    console.log('❌ 未找到匹配的站点');
    return;
  }

  console.log(`✅ 找到 ${sites.length} 个站点:\n`);
  sites.forEach(s => console.log(`   - ${s.name} (${s.id}) ${s.enabled ? '✓启用' : '✗禁用'}`));

  // 2. 获取自动同步配置
  console.log('\n📋 检查自动同步配置...');
  const { data: config } = await supabase
    .from('auto_sync_config')
    .select('*')
    .eq('name', 'default')
    .single();

  if (config) {
    console.log(`   启用状态: ${config.enabled ? '✓' : '✗'}`);
    console.log(`   同步为有货: ${config.sync_to_instock ? '✓' : '✗'}`);
    console.log(`   同步为无货: ${config.sync_to_outofstock ? '✓' : '✗'}`);
    console.log(`   配置的站点: ${config.site_ids?.length || 0} 个`);

    if (config.site_ids?.length > 0) {
      const configuredSites = sites.filter(s => config.site_ids.includes(s.id));
      configuredSites.forEach(s => console.log(`      - ${s.name}`));
    }
  } else {
    console.log('   ⚠️ 未找到配置');
  }

  // 3. 对每个站点检查产品缓存
  for (const site of sites) {
    console.log(`\n========================================`);
    console.log(`🏪 站点: ${site.name}`);
    console.log(`========================================`);

    // 3.1 统计该站点的产品缓存
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', site.id);

    console.log(`\n📦 产品缓存统计:`);
    console.log(`   总产品数: ${totalProducts || 0}`);

    // 3.2 按 stock_status 分组统计
    const { data: instockProducts } = await supabase
      .from('products')
      .select('sku', { count: 'exact' })
      .eq('site_id', site.id)
      .eq('stock_status', 'instock');

    const { data: outofstockProducts } = await supabase
      .from('products')
      .select('sku', { count: 'exact' })
      .eq('site_id', site.id)
      .eq('stock_status', 'outofstock');

    console.log(`   有货(instock): ${instockProducts?.length || 0}`);
    console.log(`   无货(outofstock): ${outofstockProducts?.length || 0}`);

    // 3.3 检查缓存新鲜度
    const { data: oldestProduct } = await supabase
      .from('products')
      .select('sku, synced_at')
      .eq('site_id', site.id)
      .order('synced_at', { ascending: true })
      .limit(1)
      .single();

    const { data: newestProduct } = await supabase
      .from('products')
      .select('sku, synced_at')
      .eq('site_id', site.id)
      .order('synced_at', { ascending: false })
      .limit(1)
      .single();

    if (oldestProduct && newestProduct) {
      const oldestAge = Math.round((Date.now() - new Date(oldestProduct.synced_at).getTime()) / (1000 * 60 * 60 * 24));
      const newestAge = Math.round((Date.now() - new Date(newestProduct.synced_at).getTime()) / (1000 * 60 * 60 * 24));

      console.log(`\n⏰ 缓存新鲜度:`);
      console.log(`   最旧数据: ${oldestAge} 天前 (${oldestProduct.sku})`);
      console.log(`   最新数据: ${newestAge} 天前 (${newestProduct.sku})`);
    }

    // 3.4 检查最近一次同步批次的结果
    console.log(`\n📊 最近同步批次结果:`);
    const { data: latestResult } = await supabase
      .from('sync_site_results')
      .select('*, diagnostics')
      .eq('site_id', site.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (latestResult) {
      console.log(`   状态: ${latestResult.status}`);
      console.log(`   检测数: ${latestResult.total_checked}`);
      console.log(`   同步为有货: ${latestResult.synced_to_instock}`);
      console.log(`   同步为无货: ${latestResult.synced_to_outofstock}`);
      console.log(`   失败: ${latestResult.failed}`);
      console.log(`   跳过: ${latestResult.skipped}`);
      console.log(`   时间: ${latestResult.completed_at || latestResult.created_at}`);

      if (latestResult.diagnostics) {
        console.log(`\n   🔬 诊断信息:`);
        const diag = latestResult.diagnostics;
        if (diag.detection) {
          console.log(`      缓存命中: ${diag.detection.cacheHits}`);
          console.log(`      API调用: ${diag.detection.apiCalls}`);
          console.log(`      未找到: ${diag.detection.notFound}`);
        }
        if (diag.sync) {
          console.log(`      需同步为有货: ${diag.sync.needSyncToInstock?.length || 0}`);
          if (diag.sync.needSyncToInstock?.length > 0) {
            diag.sync.needSyncToInstock.slice(0, 10).forEach(s => console.log(`         - ${s}`));
            if (diag.sync.needSyncToInstock.length > 10) {
              console.log(`         ... 还有 ${diag.sync.needSyncToInstock.length - 10} 个`);
            }
          }
          console.log(`      需同步为无货: ${diag.sync.needSyncToOutofstock?.length || 0}`);
        }
      } else {
        console.log(`   ⚠️ 无诊断信息（需要更新代码并重新运行同步）`);
      }
    } else {
      console.log(`   ⚠️ 无同步记录`);
    }

    // 3.5 列出所有 outofstock 的产品
    console.log(`\n🔴 当前缓存中 outofstock 的产品 (${outofstockProducts?.length || 0} 个):`);
    if (outofstockProducts && outofstockProducts.length > 0) {
      outofstockProducts.slice(0, 30).forEach(p => console.log(`   - ${p.sku}`));
      if (outofstockProducts.length > 30) {
        console.log(`   ... 还有 ${outofstockProducts.length - 30} 个`);
      }
    }
  }

  // 4. 查看最近的同步批次详情
  console.log('\n========================================');
  console.log('📋 最近同步批次详情');
  console.log('========================================');

  const { data: latestBatches } = await supabase
    .from('sync_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (latestBatches && latestBatches.length > 0) {
    for (const batch of latestBatches) {
      console.log(`\n🔹 批次 ${batch.id.slice(0, 8)}...`);
      console.log(`   状态: ${batch.status}`);
      console.log(`   当前步骤: ${batch.current_step}/${batch.total_sites}`);
      console.log(`   创建时间: ${batch.created_at}`);
      console.log(`   完成时间: ${batch.completed_at || '未完成'}`);

      // 查该批次的站点结果（不查 diagnostics 列，因为可能还没加）
      const { data: siteResults, error: srError } = await supabase
        .from('sync_site_results')
        .select('site_name, status, total_checked, synced_to_instock, synced_to_outofstock, failed, skipped, details')
        .eq('batch_id', batch.id)
        .order('step_index');

      console.log(`   站点结果数: ${siteResults?.length || 0}${srError ? ` (错误: ${srError.message})` : ''}`);

      if (siteResults && siteResults.length > 0) {
        for (const r of siteResults) {
          console.log(`\n   📍 ${r.site_name}: ${r.status}`);
          console.log(`      检测: ${r.total_checked}, 有货+${r.synced_to_instock}, 无货+${r.synced_to_outofstock}, 失败${r.failed}, 跳过${r.skipped}`);

          // 从 details 中提取同步的 SKU
          if (r.details && Array.isArray(r.details)) {
            const toInstock = r.details.filter(d => d.action === 'to_instock').map(d => d.sku);
            const toOutofstock = r.details.filter(d => d.action === 'to_outofstock').map(d => d.sku);
            if (toInstock.length > 0) {
              console.log(`      ⚡ 已同步为有货: ${toInstock.join(', ')}`);
            }
            if (toOutofstock.length > 0) {
              console.log(`      ⚡ 已同步为无货: ${toOutofstock.join(', ')}`);
            }
          }
        }
      }
    }
  } else {
    console.log('⚠️ 无批次记录');
  }

  // 5. 【关键】对比缓存和实际 WooCommerce 状态
  // 随机抽取几个 outofstock 的产品，调用 WooCommerce API 验证
  console.log('\n========================================');
  console.log('🔬 验证缓存准确性（抽样检查）');
  console.log('========================================');

  for (const site of sites) {
    // 获取站点 API 凭据
    const { data: siteDetail } = await supabase
      .from('wc_sites')
      .select('url, api_key, api_secret')
      .eq('id', site.id)
      .single();

    if (!siteDetail) {
      console.log(`\n⚠️ ${site.name}: 无法获取 API 凭据`);
      continue;
    }

    // 获取该站点缓存中 outofstock 的产品（最多验证 5 个）
    const { data: outofstockSample } = await supabase
      .from('products')
      .select('sku, stock_status, synced_at')
      .eq('site_id', site.id)
      .eq('stock_status', 'outofstock')
      .limit(5);

    if (!outofstockSample || outofstockSample.length === 0) {
      console.log(`\n✅ ${site.name}: 缓存中没有 outofstock 产品`);
      continue;
    }

    console.log(`\n📍 ${site.name}: 验证 ${outofstockSample.length} 个 outofstock 产品...`);

    const auth = Buffer.from(`${siteDetail.api_key}:${siteDetail.api_secret}`).toString('base64');
    const baseUrl = siteDetail.url.replace(/\/$/, '');

    for (const product of outofstockSample) {
      try {
        const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(product.sku)}`, {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const products = await response.json();
          if (products.length > 0) {
            const wcProduct = products[0];
            const cacheAge = Math.round((Date.now() - new Date(product.synced_at).getTime()) / (1000 * 60 * 60 * 24));
            const match = product.stock_status === wcProduct.stock_status ? '✅' : '❌';

            console.log(`   ${match} ${product.sku}: 缓存=${product.stock_status}, WC实际=${wcProduct.stock_status} (缓存${cacheAge}天前)`);

            if (product.stock_status !== wcProduct.stock_status) {
              console.log(`      ⚠️ 缓存不一致！需要更新缓存`);
            }
          } else {
            console.log(`   ⚠️ ${product.sku}: WooCommerce 中不存在`);
          }
        } else {
          console.log(`   ❌ ${product.sku}: API 错误 ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ ${product.sku}: 请求失败 - ${error.message}`);
      }

      // 避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 6. 检查最近批次的库存缓存数据
  console.log('\n========================================');
  console.log('📦 检查 ERP 库存数据与产品缓存匹配');
  console.log('========================================');

  if (latestBatches && latestBatches.length > 0) {
    const latestBatch = latestBatches[0];

    // 获取库存缓存
    const { data: inventoryCache } = await supabase
      .from('inventory_cache')
      .select('inventory_data, sku_mappings')
      .eq('batch_id', latestBatch.id)
      .single();

    if (inventoryCache && inventoryCache.inventory_data) {
      const erpData = inventoryCache.inventory_data;
      const skuMappings = inventoryCache.sku_mappings || {};

      console.log(`\n✅ 找到 ERP 库存缓存: ${erpData.length} 条`);
      console.log(`   SKU 映射数量: ${Object.keys(skuMappings).length}`);

      // 构建 ERP SKU 到库存的映射
      const erpStockMap = new Map();
      for (const item of erpData) {
        const 可售库存 = Number(item.可售库存) || 0;
        const 缺货 = Number(item.缺货) || 0;
        const netStock = 可售库存 - 缺货;
        erpStockMap.set(item.产品代码, netStock);
      }

      // 对于 vapsolo-de 站点，找出 outofstock 但 ERP 有货的产品
      for (const site of sites) {
        const { data: outofstockProducts } = await supabase
          .from('products')
          .select('sku, stock_status')
          .eq('site_id', site.id)
          .eq('stock_status', 'outofstock');

        if (!outofstockProducts) continue;

        console.log(`\n📍 ${site.name}: 检查 ${outofstockProducts.length} 个 outofstock 产品`);

        let needSyncCount = 0;
        const needSyncList = [];

        for (const product of outofstockProducts) {
          // 检查直接 SKU 匹配
          let erpStock = erpStockMap.get(product.sku);

          // 检查反向映射（WC SKU → H3yun SKU）
          if (erpStock === undefined) {
            for (const [h3yunSku, wcSkus] of Object.entries(skuMappings)) {
              if (Array.isArray(wcSkus) && wcSkus.includes(product.sku)) {
                erpStock = erpStockMap.get(h3yunSku);
                if (erpStock !== undefined) {
                  break;
                }
              }
            }
          }

          if (erpStock !== undefined && erpStock > 0) {
            needSyncCount++;
            if (needSyncList.length < 10) {
              needSyncList.push(`${product.sku}(ERP库存:${erpStock})`);
            }
          }
        }

        console.log(`   ⚡ 需要同步为有货: ${needSyncCount} 个`);
        if (needSyncList.length > 0) {
          console.log(`   列表: ${needSyncList.join(', ')}${needSyncCount > 10 ? '...' : ''}`);
        }

        // 打印一些 ERP 有货但缓存中找不到的 SKU
        console.log(`\n   🔍 ERP 有货的 SKU 在缓存中的匹配情况（抽样）:`);
        let sampleCount = 0;
        for (const [sku, stock] of erpStockMap) {
          if (stock > 0 && sampleCount < 5) {
            // 检查这个 SKU 在产品缓存中是否存在
            const wcSkus = skuMappings[sku] || [sku];
            for (const wcSku of wcSkus) {
              const { data: cached } = await supabase
                .from('products')
                .select('sku, stock_status')
                .eq('site_id', site.id)
                .eq('sku', wcSku)
                .single();

              if (cached) {
                console.log(`      ${sku} → ${wcSku}: 缓存=${cached.stock_status}, ERP库存=${stock}`);
                sampleCount++;
              }
            }
          }
          if (sampleCount >= 5) break;
        }
      }
    } else {
      console.log('⚠️ 未找到库存缓存数据');
    }
  }

  console.log('\n========================================');
  console.log('✅ 诊断完成');
  console.log('========================================\n');
}

// 查询特定 SKU 的详细信息
async function querySkus(skuList, siteNameFilter) {
  console.log('\n========================================');
  console.log('🔍 查询特定 SKU 详情');
  console.log('========================================\n');

  // 获取站点
  let siteQuery = supabase.from('wc_sites').select('id, name, url, api_key, api_secret');
  if (siteNameFilter) {
    siteQuery = siteQuery.ilike('name', `%${siteNameFilter}%`);
  }
  const { data: sites } = await siteQuery;

  if (!sites || sites.length === 0) {
    console.log('❌ 未找到站点');
    return;
  }

  // 获取最新批次的 ERP 缓存
  const { data: latestBatch } = await supabase
    .from('sync_batches')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let erpStockMap = new Map();
  let skuMappings = {};

  if (latestBatch) {
    const { data: inventoryCache } = await supabase
      .from('inventory_cache')
      .select('inventory_data, sku_mappings')
      .eq('batch_id', latestBatch.id)
      .single();

    if (inventoryCache) {
      skuMappings = inventoryCache.sku_mappings || {};
      for (const item of inventoryCache.inventory_data || []) {
        const netStock = (Number(item.可售库存) || 0) - (Number(item.缺货) || 0);
        erpStockMap.set(item.产品代码, netStock);
      }
    }
  }

  for (const sku of skuList) {
    console.log(`\n📦 SKU: ${sku}`);
    console.log('─'.repeat(40));

    // 1. 查 ERP 库存
    const erpStock = erpStockMap.get(sku);
    console.log(`   ERP 库存: ${erpStock !== undefined ? erpStock : '❌ 未找到'}`);

    // 2. 查 SKU 映射
    const mappedSkus = skuMappings[sku];
    if (mappedSkus) {
      console.log(`   SKU 映射: ${sku} → [${mappedSkus.join(', ')}]`);
    }

    // 3. 查产品缓存
    for (const site of sites) {
      const { data: cached } = await supabase
        .from('products')
        .select('sku, stock_status, synced_at')
        .eq('site_id', site.id)
        .eq('sku', sku)
        .single();

      if (cached) {
        const age = Math.round((Date.now() - new Date(cached.synced_at).getTime()) / (1000 * 60));
        console.log(`   ${site.name} 缓存: stock_status=${cached.stock_status}, 更新于 ${age} 分钟前`);
      } else {
        console.log(`   ${site.name} 缓存: ❌ 不存在`);
      }

      // 4. 查 WooCommerce 实际状态
      const auth = Buffer.from(`${site.api_key}:${site.api_secret}`).toString('base64');
      const baseUrl = site.url.replace(/\/$/, '');

      try {
        const response = await fetch(`${baseUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`, {
          headers: { 'Authorization': `Basic ${auth}` },
        });

        if (response.ok) {
          const products = await response.json();
          if (products.length > 0) {
            const wcProduct = products[0];
            console.log(`   ${site.name} WC实际: stock_status=${wcProduct.stock_status}, stock_quantity=${wcProduct.stock_quantity}`);

            // 对比
            if (cached && cached.stock_status !== wcProduct.stock_status) {
              console.log(`   ⚠️ 缓存与实际不一致！缓存=${cached.stock_status}, 实际=${wcProduct.stock_status}`);
            }
          } else {
            console.log(`   ${site.name} WC实际: ❌ 产品不存在`);
          }
        }
      } catch (e) {
        console.log(`   ${site.name} WC实际: ❌ 查询失败`);
      }

      await new Promise(r => setTimeout(r, 300));
    }

    // 5. 判断是否应该同步
    if (erpStock !== undefined) {
      for (const site of sites) {
        const { data: cached } = await supabase
          .from('products')
          .select('stock_status')
          .eq('site_id', site.id)
          .eq('sku', sku)
          .single();

        if (cached) {
          const shouldSyncToInstock = cached.stock_status === 'outofstock' && erpStock > 0;
          const shouldSyncToOutofstock = cached.stock_status === 'instock' && erpStock <= 0;

          if (shouldSyncToInstock) {
            console.log(`   ✅ 应该同步为有货 (缓存=outofstock, ERP=${erpStock})`);
          } else if (shouldSyncToOutofstock) {
            console.log(`   ✅ 应该同步为无货 (缓存=instock, ERP=${erpStock})`);
          } else {
            console.log(`   ⏭️ 不需要同步 (缓存=${cached.stock_status}, ERP=${erpStock})`);
          }
        }
      }
    }
  }

  console.log('\n========================================');
  console.log('✅ 查询完成');
  console.log('========================================\n');
}

// 运行
const args = process.argv.slice(2);
if (args[0] === '--sku') {
  // 查询特定 SKU: node scripts/diagnose-sync.js --sku AK-HO2-14,AK-HO2-10 vapsolo-de
  const skuList = args[1].split(',').map(s => s.trim());
  const siteFilter = args[2];
  querySkus(skuList, siteFilter).catch(console.error);
} else {
  // 常规诊断
  const siteName = args[0];
  diagnose(siteName).catch(console.error);
}
