1. 通知原理 (第 1182-1184 行)

const instockSkus = details.filter(d => d.action === 'to_instock').map(d => d.sku);
通知中的"有货 SKU"是从 details 数组中筛选出来的，只有当 syncSku() 函数返回成功且记录了 to_instock 动作时才会出现。
2. 同步流程 (第 288-329 行)
同步确实是：

先调用 WC API 更新 (PUT)
如果成功 (updateResponse.ok)，再更新 Supabase 缓存

3. SKU 映射 (第 614-633 行)
从第 911 行可以看到：


const wooSkus = skuMappings[sku] || [sku];
ERP SKU 会被映射到多个 WooCommerce SKU。