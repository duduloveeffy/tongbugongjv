/**
 * 自动同步批次监控脚本
 * 用法: node scripts/monitor-batch.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, prefix, message) {
  const time = new Date().toLocaleTimeString('zh-CN');
  console.log(colors[color] + '[' + time + '] ' + prefix + colors.reset + ' ' + message);
}

async function getLatestBatch() {
  const { data } = await supabase
    .from('sync_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function getSiteResults(batchId) {
  const { data } = await supabase
    .from('sync_site_results')
    .select('*')
    .eq('batch_id', batchId)
    .order('step_index');
  return data || [];
}

async function getInventoryCache(batchId) {
  const { data } = await supabase
    .from('inventory_cache')
    .select('*')
    .eq('batch_id', batchId)
    .single();
  return data;
}

const loggedResults = new Set();

async function monitorBatch() {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📡', '自动同步批次监控器已启动');
  console.log('='.repeat(60));

  const initialBatch = await getLatestBatch();
  const initialBatchId = initialBatch ? initialBatch.id : null;

  log('yellow', '⏳', '等待新批次创建... (当前最新批次: ' + (initialBatchId ? initialBatchId.slice(0, 8) : '无') + ')');
  log('yellow', '💡', '请在前端触发自动同步，或等待 Cron 任务');

  let newBatch = null;
  while (!newBatch) {
    await new Promise(r => setTimeout(r, 1000));
    const latest = await getLatestBatch();
    if (latest && latest.id !== initialBatchId) {
      newBatch = latest;
    }
  }

  console.log('\n' + '='.repeat(60));
  log('green', '🚀', '新批次已创建: ' + newBatch.id);
  console.log('='.repeat(60));

  log('blue', '📋', '批次信息:');
  console.log('   状态: ' + newBatch.status);
  console.log('   站点数: ' + newBatch.total_sites);
  console.log('   站点IDs: ' + JSON.stringify(newBatch.site_ids));
  console.log('   创建时间: ' + newBatch.created_at);

  let lastStatus = newBatch.status;
  let lastStep = newBatch.current_step;
  let inventoryCacheLogged = false;

  while (true) {
    await new Promise(r => setTimeout(r, 2000));

    const batch = await getLatestBatch();
    if (!batch || batch.id !== newBatch.id) {
      log('red', '❌', '批次丢失或被替换');
      break;
    }

    if (batch.status !== lastStatus) {
      console.log('');
      log('magenta', '📌', '状态变化: ' + lastStatus + ' → ' + batch.status);
      lastStatus = batch.status;
    }

    if (batch.current_step !== lastStep) {
      console.log('');
      log('cyan', '👣', '步骤变化: ' + lastStep + ' → ' + batch.current_step);
      lastStep = batch.current_step;
    }

    if (batch.current_step > 0 && !inventoryCacheLogged) {
      const cache = await getInventoryCache(batch.id);
      if (cache) {
        console.log('\n' + '-'.repeat(60));
        log('green', '📦', 'ERP 库存缓存已创建:');
        console.log('   库存记录数: ' + (cache.inventory_data ? cache.inventory_data.length : 0));
        console.log('   SKU映射数: ' + Object.keys(cache.sku_mappings || {}).length);

        const targetSkus = ['AK-HO2-14', 'AK-HO2-10', 'AK-HO5-06'];
        console.log('\n   🔍 目标 SKU 在缓存中的数据:');
        for (const sku of targetSkus) {
          const item = cache.inventory_data ? cache.inventory_data.find(i => i.产品代码 === sku) : null;
          if (item) {
            const ks = Number(item.可售库存) || 0;
            const qh = Number(item.缺货) || 0;
            const jkc = ks - qh;
            console.log('      ' + sku + ': 可售=' + ks + ', 缺货=' + qh + ', 净库存=' + jkc);
          } else {
            console.log('      ' + sku + ': ❌ 未找到');
          }
        }
        console.log('-'.repeat(60));
        inventoryCacheLogged = true;
      }
    }

    const siteResults = await getSiteResults(batch.id);

    for (const result of siteResults) {
      const resultKey = result.site_name + '-' + result.status;

      if (!loggedResults.has(resultKey)) {
        loggedResults.add(resultKey);

        if (result.status === 'running') {
          log('yellow', '⚙️', '站点 ' + result.site_name + ' 开始同步...');
        } else if (result.status === 'completed') {
          console.log('\n' + '-'.repeat(60));
          log('green', '✅', '站点 ' + result.site_name + ' 同步完成:');
          console.log('      检测SKU数: ' + result.total_checked);
          console.log('      同步为有货: ' + result.synced_to_instock);
          console.log('      同步为无货: ' + result.synced_to_outofstock);
          console.log('      跳过: ' + result.skipped);
          console.log('      失败: ' + result.failed);

          if (result.details && Array.isArray(result.details)) {
            const toInstock = result.details.filter(d => d.action === 'to_instock');
            const toOutofstock = result.details.filter(d => d.action === 'to_outofstock');

            if (toInstock.length > 0) {
              console.log('\n      📈 同步为有货的 SKU (' + toInstock.length + '):');
              toInstock.slice(0, 10).forEach(d => {
                console.log('         - ' + d.sku + ': ERP净库存=' + (d.erpNetStock || '?'));
              });
            }

            if (toOutofstock.length > 0) {
              console.log('\n      📉 同步为无货的 SKU (' + toOutofstock.length + '):');
              toOutofstock.slice(0, 10).forEach(d => {
                console.log('         - ' + d.sku + ': ERP净库存=' + (d.erpNetStock || '?'));
              });
            }

            const targetSkus = ['AK-HO2-14', 'AK-HO2-10', 'AK-HO5-06'];
            console.log('\n      🎯 目标 SKU 处理结果:');
            for (const sku of targetSkus) {
              const detail = result.details.find(d => d.sku === sku);
              if (detail) {
                console.log('         ' + sku + ': ' + detail.action + ' (缓存状态=' + (detail.cacheStatus || '?') + ', ERP净库存=' + (detail.erpNetStock || '?') + ')');
              } else {
                console.log('         ' + sku + ': 未在此站点处理');
              }
            }
          }

          console.log('-'.repeat(60));
        } else if (result.status === 'failed') {
          log('red', '❌', '站点 ' + result.site_name + ' 同步失败: ' + result.error_message);
        }
      }
    }

    if (batch.status === 'completed' || batch.status === 'failed') {
      console.log('\n' + '='.repeat(60));
      if (batch.status === 'completed') {
        log('green', '🎉', '批次同步完成!');
      } else {
        log('red', '💥', '批次同步失败: ' + batch.error_message);
      }

      console.log('\n📊 最终统计:');
      console.log('   批次ID: ' + batch.id);
      console.log('   状态: ' + batch.status);
      console.log('   总站点: ' + batch.total_sites);
      console.log('   开始时间: ' + batch.started_at);
      console.log('   完成时间: ' + batch.completed_at);

      if (batch.stats) {
        console.log('   统计: ' + JSON.stringify(batch.stats));
      }

      console.log('='.repeat(60) + '\n');
      break;
    }
  }
}

monitorBatch().catch(console.error);
