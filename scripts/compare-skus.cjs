const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function compare() {
  const siteId = "4fcb9c7d-e546-4ff7-aa10-894b5bd81b42"; // Vapsolowholes

  // 1. 获取最新的 ERP 库存缓存（inventory_data 是 JSON 数组）
  const { data: erpRecord } = await supabase
    .from("inventory_cache")
    .select("inventory_data")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // 从 JSON 数组中提取所有 SKU
  const inventoryArray = erpRecord?.inventory_data || [];
  const erpSkus = new Set(inventoryArray.map(item => item['产品代码']));

  // 2. 获取 WC products 缓存中的 SKU
  const { data: wcData } = await supabase
    .from("products")
    .select("sku")
    .eq("site_id", siteId);

  const wcSkus = new Set(wcData?.map(r => r.sku) || []);

  // 3. 找交集
  const matched = [...erpSkus].filter(sku => wcSkus.has(sku));
  const erpOnly = [...erpSkus].filter(sku => wcSkus.has(sku) === false);
  const wcOnly = [...wcSkus].filter(sku => erpSkus.has(sku) === false);

  console.log("📊 SKU 匹配分析:");
  console.log("  - ERP 库存缓存 SKU 数量:", erpSkus.size);
  console.log("  - WC products 缓存 SKU 数量:", wcSkus.size);
  console.log("  - 匹配的 SKU 数量:", matched.length);
  console.log("  - 仅在 ERP 中的 SKU:", erpOnly.length);
  console.log("  - 仅在 WC 中的 SKU:", wcOnly.length);

  console.log("\n📋 ERP SKU 样本 (前10个):");
  [...erpSkus].slice(0, 10).forEach(sku => console.log("  -", sku));

  console.log("\n📋 WC SKU 样本 (前10个):");
  [...wcSkus].slice(0, 10).forEach(sku => console.log("  -", sku));

  if (matched.length > 0) {
    console.log("\n✅ 匹配的 SKU 样本:");
    matched.slice(0, 5).forEach(sku => console.log("  -", sku));
  } else {
    console.log("\n❌ 没有任何 SKU 匹配！这就是为什么自动同步全部显示'未缓存'");
  }
}

compare().catch(console.error);
