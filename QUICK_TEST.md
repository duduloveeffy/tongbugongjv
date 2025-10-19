# 🚀 氚云表单快速测试

## 一键测试（推荐）

### Windows
```cmd
test-h3yun-schemas.bat
```

### Mac/Linux
```bash
./test-h3yun-schemas.sh
```

---

## 单行 CMD 命令（Windows）

### 测试库存表
```cmd
curl -X POST "https://www.h3yun.com/OpenApi/Invoke" -H "Content-Type: application/json" -H "EngineCode: t4yq7mzi2zpe1rnn6etflbvm0" -H "EngineSecret: dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==" -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"sirxt5xvsfeuamv3c2kdg\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}"
```

### 测试仓库表
```cmd
curl -X POST "https://www.h3yun.com/OpenApi/Invoke" -H "Content-Type: application/json" -H "EngineCode: t4yq7mzi2zpe1rnn6etflbvm0" -H "EngineSecret: dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==" -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"svsphqmtteooobudbgy\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}"
```

### 测试SKU映射表
```cmd
curl -X POST "https://www.h3yun.com/OpenApi/Invoke" -H "Content-Type: application/json" -H "EngineCode: t4yq7mzi2zpe1rnn6etflbvm0" -H "EngineSecret: dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==" -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"e2ae2f1be3c7425cb1dc90a87131231a\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}"
```

---

## 结果判断

✅ **成功**: `"Successful":true`
❌ **失败**: `"Successful":false`

---

## 配置信息

| 配置项 | SchemaCode | 说明 |
|-------|-----------|------|
| H3YUN_INVENTORY_SCHEMA_CODE | `sirxt5xvsfeuamv3c2kdg` | 库存表 |
| H3YUN_WAREHOUSE_SCHEMA_CODE | `svsphqmtteooobudbgy` | 仓库表 |
| H3YUN_SKU_MAPPING_SCHEMA_CODE | `e2ae2f1be3c7425cb1dc90a87131231a` | SKU映射表 |

---

## 📖 详细文档

- [完整测试命令文档](docs/H3YUN_TEST_COMMANDS.md)
- [SKU映射功能文档](docs/SKU_MAPPING.md)
- [Curl 测试示例](docs/CURL_TEST_EXAMPLES.md)
