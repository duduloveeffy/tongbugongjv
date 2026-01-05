/**
 * 完整模拟步骤0的所有操作，测量各环节耗时
 */
require("dotenv").config({ path: ".env.local" });

const engineCode = process.env.H3YUN_ENGINE_CODE;
const engineSecret = process.env.H3YUN_ENGINE_SECRET;
const schemaCode = process.env.H3YUN_INVENTORY_SCHEMA_CODE || "sirxt5xvsfeuamv3c2kdg";
const skuMappingSchemaCode = process.env.H3YUN_SKU_MAPPING_SCHEMA_CODE || "D289302e2ae2f1be3c7425cb1dc90a87131231a";

async function loadBatch(schema, from, to) {
  const filter = {
    FromRowNum: from,
    ToRowNum: to,
    RequireCount: false,
    ReturnItems: [],
    SortByCollection: [],
    Matcher: { Type: "And", Matchers: [] }
  };

  const response = await fetch("https://www.h3yun.com/OpenApi/Invoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      EngineCode: engineCode,
      EngineSecret: engineSecret,
    },
    body: JSON.stringify({
      ActionName: "LoadBizObjects",
      SchemaCode: schema,
      Filter: JSON.stringify(filter),
    }),
  });

  const data = await response.json();
  return {
    count: data.ReturnData?.BizObjectArray?.length || 0,
    data: data.ReturnData?.BizObjectArray || [],
    success: data.Successful
  };
}

async function fetchAllData(schema, name) {
  const start = Date.now();
  let from = 0;
  let allData = [];
  let batch = 0;

  while (true) {
    batch++;
    const result = await loadBatch(schema, from, from + 500);
    allData = allData.concat(result.data);

    if (result.count < 500) break;
    from += 500;

    // 当前实现的 500ms 延迟
    await new Promise(r => setTimeout(r, 500));
  }

  const elapsed = Date.now() - start;
  console.log(`  ${name}: ${elapsed} ms (${allData.length} 条, ${batch} 批)`);
  return { elapsed, data: allData };
}

async function main() {
  console.log("📊 步骤0 完整耗时测试\n");
  console.log("============================================================\n");

  const totalStart = Date.now();

  // 1. 拉取库存数据
  console.log("1️⃣ 拉取库存数据:");
  const inventory = await fetchAllData(schemaCode, "库存数据");

  // 2. 拉取SKU映射
  console.log("\n2️⃣ 拉取SKU映射:");
  const mapping = await fetchAllData(skuMappingSchemaCode, "SKU映射");

  // 3. 数据转换（模拟）
  console.log("\n3️⃣ 数据转换:");
  const transformStart = Date.now();
  // 模拟合并仓库等操作
  const transformed = inventory.data.map(item => ({
    sku: item.F0000001,
    stock: item.F0000085 || item.F0000030,
    shortage: item.F0000084
  }));
  const transformTime = Date.now() - transformStart;
  console.log(`  数据转换: ${transformTime} ms`);

  // 4. 总计
  const totalTime = Date.now() - totalStart;

  console.log("\n============================================================");
  console.log("📊 耗时汇总:");
  console.log(`  - 库存数据拉取: ${inventory.elapsed} ms`);
  console.log(`  - SKU映射拉取: ${mapping.elapsed} ms`);
  console.log(`  - 数据转换: ${transformTime} ms`);
  console.log(`  ─────────────────────────────`);
  console.log(`  总计: ${totalTime} ms (${(totalTime/1000).toFixed(1)} 秒)`);
  console.log("\n============================================================");

  if (totalTime > 60000) {
    console.log("⚠️ 警告: 总耗时超过60秒，会导致 Vercel Pro 超时！");
  } else if (totalTime > 10000) {
    console.log("⚠️ 注意: 总耗时超过10秒，会导致 Vercel Hobby 超时！");
  } else {
    console.log("✅ 耗时在安全范围内");
  }
}

main().catch(console.error);