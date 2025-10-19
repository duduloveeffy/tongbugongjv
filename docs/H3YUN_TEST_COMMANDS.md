# 氚云表单连接测试命令

## 一键测试脚本

### Windows CMD
```cmd
test-h3yun-schemas.bat
```

### Mac/Linux Bash
```bash
./test-h3yun-schemas.sh
```

---

## 独立 Curl 命令（可直接在 CMD 中运行）

### 1. 测试库存表 (H3YUN_INVENTORY_SCHEMA_CODE)

**SchemaCode**: `sirxt5xvsfeuamv3c2kdg`

```cmd
curl -X POST "https://www.h3yun.com/OpenApi/Invoke" -H "Content-Type: application/json" -H "EngineCode: t4yq7mzi2zpe1rnn6etflbvm0" -H "EngineSecret: dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==" -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"sirxt5xvsfeuamv3c2kdg\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}"
```

**预期结果**：
- ✅ 成功: `{"Successful":true, ...}`
- ❌ 失败: `{"Successful":false,"ErrorMessage":"..."}`

---

### 2. 测试仓库表 (H3YUN_WAREHOUSE_SCHEMA_CODE)

**SchemaCode**: `svsphqmtteooobudbgy`

```cmd
curl -X POST "https://www.h3yun.com/OpenApi/Invoke" -H "Content-Type: application/json" -H "EngineCode: t4yq7mzi2zpe1rnn6etflbvm0" -H "EngineSecret: dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==" -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"svsphqmtteooobudbgy\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}"
```

**预期结果**：
- ✅ 成功: `{"Successful":true, ...}`
- ❌ 失败: `{"Successful":false,"ErrorMessage":"..."}`

---

### 3. 测试SKU映射表 (H3YUN_SKU_MAPPING_SCHEMA_CODE)

**SchemaCode**: `e2ae2f1be3c7425cb1dc90a87131231a`

```cmd
curl -X POST "https://www.h3yun.com/OpenApi/Invoke" -H "Content-Type: application/json" -H "EngineCode: t4yq7mzi2zpe1rnn6etflbvm0" -H "EngineSecret: dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==" -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"e2ae2f1be3c7425cb1dc90a87131231a\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}"
```

**预期结果**：
- ✅ 成功: `{"Successful":true, ...}`
- ❌ 失败: `{"Successful":false,"ErrorMessage":"根据 SchemaCode 获取 BizObjectSchema 失败"}`

**如果失败**: 说明此表单不存在或无访问权限

---

## Mac/Linux Bash 命令（多行格式）

### 测试库存表
```bash
curl -X POST 'https://www.h3yun.com/OpenApi/Invoke' \
  -H 'Content-Type: application/json' \
  -H 'EngineCode: t4yq7mzi2zpe1rnn6etflbvm0' \
  -H 'EngineSecret: dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==' \
  -d '{
    "ActionName": "LoadBizObjects",
    "SchemaCode": "sirxt5xvsfeuamv3c2kdg",
    "Filter": "{\"FromRowNum\":0,\"ToRowNum\":1,\"RequireCount\":false,\"ReturnItems\":[],\"SortByCollection\":[],\"Matcher\":{\"Type\":\"And\",\"Matchers\":[]}}"
  }'
```

### 测试仓库表
```bash
curl -X POST 'https://www.h3yun.com/OpenApi/Invoke' \
  -H 'Content-Type: application/json' \
  -H 'EngineCode: t4yq7mzi2zpe1rnn6etflbvm0' \
  -H 'EngineSecret: dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==' \
  -d '{
    "ActionName": "LoadBizObjects",
    "SchemaCode": "svsphqmtteooobudbgy",
    "Filter": "{\"FromRowNum\":0,\"ToRowNum\":1,\"RequireCount\":false,\"ReturnItems\":[],\"SortByCollection\":[],\"Matcher\":{\"Type\":\"And\",\"Matchers\":[]}}"
  }'
```

### 测试SKU映射表
```bash
curl -X POST 'https://www.h3yun.com/OpenApi/Invoke' \
  -H 'Content-Type: application/json' \
  -H 'EngineCode: t4yq7mzi2zpe1rnn6etflbvm0' \
  -H 'EngineSecret: dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==' \
  -d '{
    "ActionName": "LoadBizObjects",
    "SchemaCode": "e2ae2f1be3c7425cb1dc90a87131231a",
    "Filter": "{\"FromRowNum\":0,\"ToRowNum\":1,\"RequireCount\":false,\"ReturnItems\":[],\"SortByCollection\":[],\"Matcher\":{\"Type\":\"And\",\"Matchers\":[]}}"
  }'
```

---

## 快速诊断

### ✅ 成功示例
```json
{
  "Successful": true,
  "ErrorMessage": null,
  "ReturnData": {
    "BizObjectArray": [
      { ... }
    ]
  }
}
```

### ❌ 失败示例
```json
{
  "Successful": false,
  "ErrorMessage": "根据 SchemaCode 获取 BizObjectSchema 失败",
  "ReturnData": {}
}
```

### 常见错误及解决方案

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| 根据 SchemaCode 获取 BizObjectSchema 失败 | 表单不存在或无权限 | 1. 检查 SchemaCode 是否正确<br>2. 确认账号有访问权限<br>3. 在氚云后台查看表单是否存在 |
| 认证失败 | EngineCode/Secret 错误 | 检查 .env.local 配置 |
| 空数组 | 表单存在但没有数据 | 正常，说明连接成功 |

---

## 测试结果预期

根据您之前的测试结果，预期：

1. **库存表** ✅ - 应该能成功访问
2. **仓库表** ✅ - 应该能成功访问
3. **SKU映射表** ❌ - 目前无法访问（需要创建或更新 SchemaCode）

如果 SKU 映射表访问失败，请在前端**关闭"启用SKU映射"开关**，使用常规同步模式。
