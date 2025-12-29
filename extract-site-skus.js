async function extractAndApplyFilters() {
  const url = 'https://evcmuhykdcmyvgbyluds.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2Y211aHlrZGNteXZnYnlsdWRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1NjA2ODgsImV4cCI6MjA3MDEzNjY4OH0.hn1ivSqFjWhC9TpDJumca2bhAUAVldVcHpQBSJWH6uA';
  const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2Y211aHlrZGNteXZnYnlsdWRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDU2MDY4OCwiZXhwIjoyMDcwMTM2Njg4fQ.KljaPh35GDCtBFBzflnrEfoqsNYodltWN_TzakXdiB4';

  // 1. 获取所有站点
  console.log('=== 步骤1: 获取站点列表 ===\n');
  const sitesRes = await fetch(url + '/rest/v1/wc_sites?select=id,name', {
    headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey }
  });
  const sites = await sitesRes.json();
  console.log(`共 ${sites.length} 个站点\n`);

  // 2. 从 products_cache 提取 SKU
  console.log('=== 步骤2: 从 products_cache 提取 ===\n');
  const productsRes = await fetch(url + '/rest/v1/products_cache?select=site_id,sku', {
    headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey }
  });
  const products = await productsRes.json();

  const productSkusBySite = {};
  if (Array.isArray(products)) {
    products.forEach(p => {
      if (!productSkusBySite[p.site_id]) productSkusBySite[p.site_id] = new Set();
      if (p.sku) productSkusBySite[p.site_id].add(p.sku);
    });
    console.log(`products_cache: ${products.length} 条记录`);
  }

  // 3. 从 orders + order_items 提取 SKU（分页获取所有数据）
  console.log('\n=== 步骤3: 从 orders + order_items 提取 ===\n');

  let allOrders = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const ordersRes = await fetch(
      `${url}/rest/v1/orders?select=id,site_id&limit=${pageSize}&offset=${page * pageSize}`,
      { headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey } }
    );
    const orders = await ordersRes.json();
    if (!Array.isArray(orders) || orders.length === 0) break;
    allOrders = allOrders.concat(orders);
    if (orders.length < pageSize) break;
    page++;
  }
  console.log(`orders: ${allOrders.length} 条记录`);

  const orderSiteMap = {};
  allOrders.forEach(o => orderSiteMap[o.id] = o.site_id);

  let allOrderItems = [];
  page = 0;

  while (true) {
    const itemsRes = await fetch(
      `${url}/rest/v1/order_items?select=order_id,sku&limit=${pageSize}&offset=${page * pageSize}`,
      { headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey } }
    );
    const items = await itemsRes.json();
    if (!Array.isArray(items) || items.length === 0) break;
    allOrderItems = allOrderItems.concat(items);
    if (items.length < pageSize) break;
    page++;
  }
  console.log(`order_items: ${allOrderItems.length} 条记录`);

  const orderSkusBySite = {};
  allOrderItems.forEach(item => {
    const siteId = orderSiteMap[item.order_id];
    if (siteId && item.sku) {
      if (!orderSkusBySite[siteId]) orderSkusBySite[siteId] = new Set();
      orderSkusBySite[siteId].add(item.sku);
    }
  });

  // 4. 合并所有 SKU 数据
  console.log('\n=== 步骤4: 合并数据并提取前缀 ===\n');

  const allSiteData = {};

  for (const site of sites) {
    const skusFromProducts = productSkusBySite[site.id] || new Set();
    const skusFromOrders = orderSkusBySite[site.id] || new Set();
    const allSkus = new Set([...skusFromProducts, ...skusFromOrders]);

    // 提取 SKU 前缀
    const prefixes = new Set();
    allSkus.forEach(sku => {
      const match = sku.match(/^([A-Za-z]{2,})/);
      if (match) {
        const prefix = match[1].toUpperCase();
        prefixes.add(prefix);
      }
    });

    allSiteData[site.id] = {
      name: site.name,
      skuCount: allSkus.size,
      skus: Array.from(allSkus),
      prefixes: Array.from(prefixes).sort(),
    };
  }

  // 5. 输出统计
  console.log('=== 各站点 SKU 统计 ===\n');
  console.log('站点名称'.padEnd(25) + 'SKU数量'.padEnd(10) + 'SKU前缀');
  console.log('-'.repeat(100));

  for (const site of sites) {
    const data = allSiteData[site.id];
    const prefixStr = data.prefixes.length > 0 ? data.prefixes.join(', ') : '(无数据)';
    console.log(
      data.name.padEnd(25) +
      String(data.skuCount).padEnd(10) +
      prefixStr
    );
  }

  // 6. 应用筛选配置（写入 site_filters 表）
  console.log('\n\n=== 步骤5: 应用默认筛选配置到 site_filters 表 ===\n');

  let successCount = 0;
  let skipCount = 0;

  for (const site of sites) {
    const data = allSiteData[site.id];

    if (data.prefixes.length === 0) {
      console.log(`⏭️  ${data.name}: 无SKU数据，跳过`);
      skipCount++;
      continue;
    }

    const skuFilter = data.prefixes.join(',');

    // 使用 upsert 写入 site_filters 表（如果记录不存在则插入，存在则更新）
    const updateRes = await fetch(`${url}/rest/v1/site_filters`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        site_id: site.id,
        sku_filter: skuFilter,
        updated_at: new Date().toISOString()
      })
    });

    if (updateRes.ok) {
      console.log(`✅ ${data.name}: sku_filter = "${skuFilter}"`);
      successCount++;
    } else {
      const error = await updateRes.text();
      console.log(`❌ ${data.name}: 写入失败 - ${error}`);
    }
  }

  console.log(`\n完成! 成功写入 ${successCount} 个站点筛选配置，跳过 ${skipCount} 个站点`);
}

extractAndApplyFilters().catch(console.error);