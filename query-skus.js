async function listTables() {
  const url = 'https://evcmuhykdcmyvgbyluds.supabase.co';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2Y211aHlrZGNteXZnYnlsdWRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1NjA2ODgsImV4cCI6MjA3MDEzNjY4OH0.hn1ivSqFjWhC9TpDJumca2bhAUAVldVcHpQBSJWH6uA';

  // Try products_cache
  const productsRes = await fetch(url + '/rest/v1/products_cache?select=site_id,sku&limit=5000', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  const products = await productsRes.json();

  if (!Array.isArray(products)) {
    console.log('Products response:', JSON.stringify(products));
    return;
  }

  // Group SKUs by site
  const siteSkus = {};
  products.forEach(p => {
    if (!siteSkus[p.site_id]) siteSkus[p.site_id] = new Set();
    if (p.sku) siteSkus[p.site_id].add(p.sku);
  });

  // Get site names
  const sitesRes = await fetch(url + '/rest/v1/wc_sites?select=id,name', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  const sites = await sitesRes.json();
  const siteNames = {};
  sites.forEach(s => siteNames[s.id] = s.name);

  // Convert to arrays and show prefixes
  console.log('=== Products Cache per Site ===\n');
  Object.keys(siteSkus).forEach(siteId => {
    const skus = Array.from(siteSkus[siteId]);
    const prefixes = new Set();
    skus.forEach(sku => {
      const match = sku.match(/^([A-Za-z]+)/);
      if (match) prefixes.add(match[1]);
    });
    console.log('Site:', siteNames[siteId] || siteId);
    console.log('  SKU count:', skus.length);
    console.log('  SKU prefixes:', Array.from(prefixes).sort().join(', '));
    console.log('  Sample SKUs:', skus.slice(0, 8).join(', '));
    console.log('');
  });

  console.log('Total products in cache:', products.length);
}

listTables().catch(console.error);
