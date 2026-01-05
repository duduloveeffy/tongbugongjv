/**
 * 详细自动同步批次监控脚本
 * 记录每个 SKU 的完整处理过程
 * 用法: node scripts/monitor-batch-detailed.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

function log(color, prefix, message) {
  const time = new Date().toLocaleTimeString('zh-CN');
  console.log(colors[color] + '[' + time + '] ' + prefix + colors.reset + ' ' + message);
}

function logSection(title) {
  console.log('\n' + colors.cyan + '═'.repeat(70) + colors.reset);
  console.log(colors.bold + colors.cyan + ' ' + title + colors.reset);
  console.log(colors.cyan + '═'.repeat(70) + colors.reset);
}

function logSubSection(title) {
  console.log('\n' + colors.yellow + '─'.repeat(60) + colors.reset);
  console.log(colors.yellow + ' ' + title + colors.reset);
  console.log(colors.yellow + '─'.repeat(60) + colors.reset);
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

async function getProductsCache(siteId, skus) {
  const { data } = await supabase
    .from('products')
    .select('sku, status, stock_status, name')
    .eq('site_id', siteId)
    .in('sku', skus);
  return data || [];
}

async function getSiteInfo(siteId) {
  const { data } = await supabase
    .from('wc_sites')
    .select('id, name, url')
    .eq('id', siteId)
    .single();
  return data;
}

const loggedResults = new Set();

async function monitorBatch() {
  logSection('自动同步详细监控器');

  log('cyan', '📡', '监控器已启动，等待新批次...');
  log('gray', '💡', '请在前端触发自动同步');

  const initialBatch = await getLatestBatch();
  const initialBatchId = initialBatch ? initialBatch.id : null;

  if (initialBatchId) {
    log('gray', '📋', '当前最新批次: ' + initialBatchId.slice(0, 8) + '...');
  }

  // 等待新批次
  let newBatch = null;
  while (!newBatch) {
    await new Promise(r => setTimeout(r, 1000));
    const latest = await getLatestBatch();
    if (latest && latest.id !== initialBatchId) {
      newBatch = latest;
    }
  }

  logSection('新批次已创建');

  console.log(colors.green + '  批次 ID: ' + colors.white + newBatch.id + colors.reset);
  console.log(colors.green + '  状态: ' + colors.white + newBatch.status + colors.reset);
  console.log(colors.green + '  站点数: ' + colors.white + newBatch.total_sites + colors.reset);
  console.log(colors.green + '  站点 IDs: ' + colors.gray + JSON.stringify(newBatch.site_ids) + colors.reset);
  console.log(colors.green + '  创建时间: ' + colors.white + newBatch.created_at + colors.reset);

  let lastStatus = newBatch.status;
  let lastStep = newBatch.current_step;
  let inventoryCacheLogged = false;
  let inventoryCache = null;

  while (true) {
    await new Promise(r => setTimeout(r, 1500));

    const batch = await getLatestBatch();
    if (!batch || batch.id !== newBatch.id) {
      log('red', '❌', '批次丢失或被替换');
      break;
    }

    // 状态变化
    if (batch.status !== lastStatus) {
      logSubSection('状态变化: ' + lastStatus + ' → ' + batch.status);
      lastStatus = batch.status;
    }

    // 步骤变化
    if (batch.current_step !== lastStep) {
      log('cyan', '👣', '步骤变化: ' + lastStep + ' → ' + batch.current_step);
      lastStep = batch.current_step;
    }

    // ERP 库存缓存创建
    if (batch.current_step > 0 && !inventoryCacheLogged) {
      inventoryCache = await getInventoryCache(batch.id);
      if (inventoryCache) {
        logSubSection('ERP 库存缓存已创建');

        const inventoryData = inventoryCache.inventory_data || [];
        const skuMappings = inventoryCache.sku_mappings || {};

        console.log(colors.green + '  库存记录数: ' + colors.white + inventoryData.length + colors.reset);
        console.log(colors.green + '  SKU 映射数: ' + colors.white + Object.keys(skuMappings).length + colors.reset);

        // 显示前 10 个 SKU 的详细信息
        console.log('\n' + colors.cyan + '  前 10 个 SKU 的 ERP 数据:' + colors.reset);
        console.log(colors.gray + '  ' + '-'.repeat(56) + colors.reset);
        console.log(colors.gray + '  SKU            | 可售库存 | 缺货 | 净库存 | 产品名称' + colors.reset);
        console.log(colors.gray + '  ' + '-'.repeat(56) + colors.reset);

        inventoryData.slice(0, 10).forEach(item => {
          const sku = item.产品代码 || '?';
          const ks = Number(item.可售库存) || 0;
          const qh = Number(item.缺货) || 0;
          const net = ks - qh;
          const name = (item.产品名称 || '').slice(0, 20);

          const netColor = net > 0 ? colors.green : (net < 0 ? colors.red : colors.yellow);

          console.log('  ' +
            colors.white + sku.padEnd(15) + colors.reset + '| ' +
            colors.blue + String(ks).padStart(8) + colors.reset + ' | ' +
            colors.magenta + String(qh).padStart(4) + colors.reset + ' | ' +
            netColor + String(net).padStart(6) + colors.reset + ' | ' +
            colors.gray + name + colors.reset
          );
        });

        inventoryCacheLogged = true;
      }
    }

    // 站点同步结果
    const siteResults = await getSiteResults(batch.id);

    for (const result of siteResults) {
      const resultKey = result.site_name + '-' + result.status;

      if (!loggedResults.has(resultKey)) {
        loggedResults.add(resultKey);

        if (result.status === 'running') {
          log('yellow', '⚙️', '站点 ' + result.site_name + ' 开始同步...');
        } else if (result.status === 'completed') {
          await logDetailedSiteResult(result, inventoryCache, batch.site_ids[result.step_index]);
        } else if (result.status === 'failed') {
          log('red', '❌', '站点 ' + result.site_name + ' 同步失败: ' + result.error_message);
        }
      }
    }

    // 批次完成
    if (batch.status === 'completed' || batch.status === 'failed') {
      logSection('批次同步' + (batch.status === 'completed' ? '完成' : '失败'));

      if (batch.status === 'completed') {
        console.log(colors.green + '  🎉 同步成功完成!' + colors.reset);
      } else {
        console.log(colors.red + '  💥 同步失败: ' + batch.error_message + colors.reset);
      }

      console.log('\n' + colors.cyan + '  最终统计:' + colors.reset);
      console.log('  批次 ID: ' + batch.id);
      console.log('  状态: ' + batch.status);
      console.log('  总站点: ' + batch.total_sites);
      console.log('  开始时间: ' + batch.started_at);
      console.log('  完成时间: ' + batch.completed_at);

      if (batch.stats) {
        console.log('\n' + colors.cyan + '  统计数据:' + colors.reset);
        console.log('  ' + JSON.stringify(batch.stats, null, 2).split('\n').join('\n  '));
      }

      console.log('\n' + colors.cyan + '═'.repeat(70) + colors.reset + '\n');
      break;
    }
  }
}

async function logDetailedSiteResult(result, inventoryCache, siteId) {
  logSubSection('站点 ' + result.site_name + ' 同步完成');

  // 基本统计
  console.log(colors.green + '  检测 SKU 数: ' + colors.white + result.total_checked + colors.reset);
  console.log(colors.blue + '  同步为有货: ' + colors.white + result.synced_to_instock + colors.reset);
  console.log(colors.red + '  同步为无货: ' + colors.white + result.synced_to_outofstock + colors.reset);
  console.log(colors.gray + '  跳过: ' + colors.white + result.skipped + colors.reset);
  console.log(colors.yellow + '  失败: ' + colors.white + result.failed + colors.reset);

  const details = result.details || [];
  const inventoryData = inventoryCache?.inventory_data || [];

  // 获取 products 表缓存数据
  const allSkus = details.map(d => d.sku);
  const productsCache = await getProductsCache(siteId, allSkus);
  const productsCacheMap = new Map(productsCache.map(p => [p.sku, p]));

  // 创建 ERP 数据映射
  const erpDataMap = new Map(inventoryData.map(item => [item.产品代码, item]));

  // 详细 SKU 处理日志
  console.log('\n' + colors.cyan + '  每个 SKU 的详细处理过程:' + colors.reset);
  console.log(colors.gray + '  ' + '═'.repeat(90) + colors.reset);
  console.log(colors.gray +
    '  SKU            | ERP可售 | ERP缺货 | ERP净库存 | WC缓存状态  | 处理结果    | 产品名称' +
    colors.reset);
  console.log(colors.gray + '  ' + '─'.repeat(90) + colors.reset);

  // 按处理结果分组统计
  const toInstock = [];
  const toOutofstock = [];
  const skipped = [];
  const failed = [];

  for (const detail of details) {
    const sku = detail.sku;
    const erpItem = erpDataMap.get(sku);
    const productCache = productsCacheMap.get(sku);

    // ERP 数据
    const erpKs = erpItem ? (Number(erpItem.可售库存) || 0) : '?';
    const erpQh = erpItem ? (Number(erpItem.缺货) || 0) : '?';
    const erpNet = erpItem ? (erpKs - erpQh) : '?';
    const productName = erpItem ? (erpItem.产品名称 || '').slice(0, 15) : '';

    // WC 缓存数据
    const wcStatus = productCache ? productCache.stock_status : '未缓存';

    // 处理结果
    let actionText = '';
    let actionColor = colors.gray;

    switch (detail.action) {
      case 'to_instock':
        actionText = '→ 有货';
        actionColor = colors.green;
        toInstock.push({ sku, erpNet, wcStatus, name: productName });
        break;
      case 'to_outofstock':
        actionText = '→ 无货';
        actionColor = colors.red;
        toOutofstock.push({ sku, erpNet, wcStatus, name: productName });
        break;
      case 'skipped':
        actionText = '跳过';
        actionColor = colors.gray;
        skipped.push({ sku, erpNet, wcStatus, name: productName, reason: getSkipReason(erpNet, wcStatus) });
        break;
      case 'failed':
        actionText = '失败';
        actionColor = colors.yellow;
        failed.push({ sku, erpNet, wcStatus, name: productName, error: detail.error });
        break;
      default:
        actionText = detail.action || '?';
    }

    // ERP 净库存颜色
    const netColor = typeof erpNet === 'number'
      ? (erpNet > 0 ? colors.green : (erpNet < 0 ? colors.red : colors.yellow))
      : colors.gray;

    // WC 状态颜色
    const wcColor = wcStatus === 'instock' ? colors.green : (wcStatus === 'outofstock' ? colors.red : colors.gray);

    console.log('  ' +
      colors.white + sku.padEnd(15) + colors.reset + '| ' +
      colors.blue + String(erpKs).padStart(7) + colors.reset + ' | ' +
      colors.magenta + String(erpQh).padStart(7) + colors.reset + ' | ' +
      netColor + String(erpNet).padStart(9) + colors.reset + ' | ' +
      wcColor + wcStatus.padEnd(11) + colors.reset + ' | ' +
      actionColor + actionText.padEnd(11) + colors.reset + ' | ' +
      colors.gray + productName + colors.reset
    );
  }

  // 分类汇总
  if (toInstock.length > 0) {
    console.log('\n' + colors.green + '  📈 同步为有货 (' + toInstock.length + '):' + colors.reset);
    toInstock.forEach(item => {
      console.log(colors.green + '     ✓ ' + item.sku + colors.gray + ' (ERP净库存=' + item.erpNet + ', WC原状态=' + item.wcStatus + ')' + colors.reset);
    });
  }

  if (toOutofstock.length > 0) {
    console.log('\n' + colors.red + '  📉 同步为无货 (' + toOutofstock.length + '):' + colors.reset);
    toOutofstock.forEach(item => {
      console.log(colors.red + '     ✓ ' + item.sku + colors.gray + ' (ERP净库存=' + item.erpNet + ', WC原状态=' + item.wcStatus + ')' + colors.reset);
    });
  }

  if (skipped.length > 0 && skipped.length <= 20) {
    console.log('\n' + colors.gray + '  ⏭️ 跳过 (' + skipped.length + '):' + colors.reset);
    skipped.forEach(item => {
      console.log(colors.gray + '     - ' + item.sku + ' [' + item.reason + ']' + colors.reset);
    });
  } else if (skipped.length > 20) {
    console.log('\n' + colors.gray + '  ⏭️ 跳过 (' + skipped.length + '): 数量过多，仅显示原因统计' + colors.reset);

    // 统计跳过原因
    const reasonCounts = {};
    skipped.forEach(item => {
      reasonCounts[item.reason] = (reasonCounts[item.reason] || 0) + 1;
    });
    Object.entries(reasonCounts).forEach(([reason, count]) => {
      console.log(colors.gray + '     - ' + reason + ': ' + count + ' 个' + colors.reset);
    });
  }

  if (failed.length > 0) {
    console.log('\n' + colors.yellow + '  ❌ 失败 (' + failed.length + '):' + colors.reset);
    failed.forEach(item => {
      console.log(colors.yellow + '     ! ' + item.sku + ': ' + (item.error || '未知错误') + colors.reset);
    });
  }
}

function getSkipReason(erpNet, wcStatus) {
  if (wcStatus === '未缓存') {
    return 'WC缓存中无此SKU';
  }

  if (typeof erpNet !== 'number') {
    return 'ERP数据缺失';
  }

  if (erpNet > 0 && wcStatus === 'instock') {
    return '状态一致(有货)';
  }

  if (erpNet <= 0 && wcStatus === 'outofstock') {
    return '状态一致(无货)';
  }

  if (erpNet <= 0 && wcStatus === 'instock') {
    return '应同步为无货但被跳过';
  }

  if (erpNet > 0 && wcStatus === 'outofstock') {
    return '应同步为有货但被跳过';
  }

  return '未知原因';
}

monitorBatch().catch(console.error);
