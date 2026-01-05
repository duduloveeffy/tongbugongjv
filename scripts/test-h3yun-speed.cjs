const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const engineCode = process.env.H3YUN_ENGINE_CODE;
const engineSecret = process.env.H3YUN_ENGINE_SECRET;
const schemaCode = process.env.H3YUN_INVENTORY_SCHEMA_CODE || "sirxt5xvsfeuamv3c2kdg";

async function loadBatch(from, to) {
  const filter = {
    FromRowNum: from,
    ToRowNum: to,
    RequireCount: false,
    ReturnItems: [],
    SortByCollection: [],
    Matcher: { Type: "And", Matchers: [] }
  };

  const start = Date.now();
  const response = await fetch("https://www.h3yun.com/OpenApi/Invoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      EngineCode: engineCode,
      EngineSecret: engineSecret,
    },
    body: JSON.stringify({
      ActionName: "LoadBizObjects",
      SchemaCode: schemaCode,
      Filter: JSON.stringify(filter),
    }),
  });

  const data = await response.json();
  const elapsed = Date.now() - start;

  return {
    elapsed,
    count: data.ReturnData?.BizObjectArray?.length || 0,
    success: data.Successful
  };
}

async function testSequential() {
  console.log("=== 串行测试（当前实现）===");
  const totalStart = Date.now();

  let from = 0;
  let totalRecords = 0;
  let batch = 0;

  while (true) {
    batch++;
    const result = await loadBatch(from, from + 500);
    console.log(`批次 ${batch}: 耗时 ${result.elapsed} ms, 记录 ${result.count}`);
    totalRecords += result.count;

    if (result.count < 500) break;
    from += 500;

    // 模拟当前实现的 500ms 延迟
    await new Promise(r => setTimeout(r, 500));
  }

  const totalElapsed = Date.now() - totalStart;
  console.log(`\n串行总耗时: ${totalElapsed} ms`);
  console.log(`总记录数: ${totalRecords}`);
  return { time: totalElapsed, records: totalRecords };
}

async function testParallel() {
  console.log("\n=== 并行测试（优化后）===");
  const totalStart = Date.now();

  // 先获取第一批，确定大概有多少数据
  const first = await loadBatch(0, 500);
  console.log(`第1批: 耗时 ${first.elapsed} ms, 记录 ${first.count}`);

  let totalRecords = first.count;

  if (first.count < 500) {
    console.log(`\n并行总耗时: ${Date.now() - totalStart} ms (只需1批)`);
    return { time: Date.now() - totalStart, records: totalRecords };
  }

  // 并行获取后续批次（预估最多6批，共3000条）
  const promises = [];
  for (let i = 1; i <= 5; i++) {
    promises.push(loadBatch(i * 500, (i + 1) * 500));
  }

  const results = await Promise.all(promises);
  results.forEach((r, i) => {
    console.log(`批次 ${i + 2}: 耗时 ${r.elapsed} ms, 记录 ${r.count}`);
    totalRecords += r.count;
  });

  const totalElapsed = Date.now() - totalStart;
  console.log(`\n并行总耗时: ${totalElapsed} ms`);
  console.log(`总记录数: ${totalRecords}`);
  return { time: totalElapsed, records: totalRecords };
}

async function main() {
  console.log("📊 氚云 API 性能测试\n");
  console.log(`SchemaCode: ${schemaCode}\n`);

  const seqResult = await testSequential();
  const parResult = await testParallel();

  console.log("\n=== 对比 ===");
  console.log(`串行: ${seqResult.time} ms (${seqResult.records} 条)`);
  console.log(`并行: ${parResult.time} ms (${parResult.records} 条)`);
  console.log(`节省: ${Math.round((1 - parResult.time/seqResult.time) * 100)}%`);
}

main().catch(console.error);