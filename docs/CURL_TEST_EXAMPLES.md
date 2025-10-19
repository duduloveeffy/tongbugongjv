# Curl 测试命令示例

## 测试 SKU 映射表访问

### 方法1：使用测试脚本（推荐）

```bash
# 运行自动化测试脚本
./test-sku-mapping.sh
```

脚本会自动：
- 读取 `.env.local` 环境变量
- 发送API请求到氚云
- 美化显示结果
- 提供故障排查建议

---

### 方法2：手动 curl 命令

#### 基础请求

```bash
curl -X POST 'https://www.h3yun.com/OpenApi/Invoke' \
  -H 'Content-Type: application/json' \
  -H 'EngineCode: YOUR_ENGINE_CODE' \
  -H 'EngineSecret: YOUR_ENGINE_SECRET' \
  -d '{
    "ActionName": "LoadBizObjects",
    "SchemaCode": "e2ae2f1be3c7425cb1dc90a87131231a",
    "Filter": "{\"FromRowNum\":0,\"ToRowNum\":10,\"RequireCount\":false,\"ReturnItems\":[],\"SortByCollection\":[],\"Matcher\":{\"Type\":\"And\",\"Matchers\":[]}}"
  }'
```

#### 使用环境变量的请求

```bash
# 先加载环境变量
export $(cat .env.local | grep -v '^#' | xargs)

# 发送请求
curl -X POST 'https://www.h3yun.com/OpenApi/Invoke' \
  -H 'Content-Type: application/json' \
  -H "EngineCode: $H3YUN_ENGINE_CODE" \
  -H "EngineSecret: $H3YUN_ENGINE_SECRET" \
  -d '{
    "ActionName": "LoadBizObjects",
    "SchemaCode": "'${H3YUN_SKU_MAPPING_SCHEMA_CODE:-e2ae2f1be3c7425cb1dc90a87131231a}'",
    "Filter": "{\"FromRowNum\":0,\"ToRowNum\":10,\"RequireCount\":false,\"ReturnItems\":[],\"SortByCollection\":[],\"Matcher\":{\"Type\":\"And\",\"Matchers\":[]}}"
  }'
```

#### 带美化输出的请求

```bash
curl -s -X POST 'https://www.h3yun.com/OpenApi/Invoke' \
  -H 'Content-Type: application/json' \
  -H "EngineCode: $H3YUN_ENGINE_CODE" \
  -H "EngineSecret: $H3YUN_ENGINE_SECRET" \
  -d '{
    "ActionName": "LoadBizObjects",
    "SchemaCode": "e2ae2f1be3c7425cb1dc90a87131231a",
    "Filter": "{\"FromRowNum\":0,\"ToRowNum\":10,\"RequireCount\":false,\"ReturnItems\":[],\"SortByCollection\":[],\"Matcher\":{\"Type\":\"And\",\"Matchers\":[]}}"
  }' | jq '.'
```

---

### 方法3：通过本地API端点测试

启动开发服务器后：

```bash
# 测试SKU映射表访问
curl http://localhost:3000/api/h3yun/test-sku-mapping | jq '.'
```

输出示例（成功）：
```json
{
  "success": true,
  "message": "SKU映射表访问成功",
  "schemaCode": "e2ae2f1be3c7425cb1dc90a87131231a",
  "stats": {
    "total": 10,
    "valid": 8,
    "invalid": 2,
    "samples": [
      {
        "woocommerceSku": "BUNDLE-A",
        "h3yunSkuId": "PART-1",
        "quantity": 2
      },
      {
        "woocommerceSku": "BUNDLE-A",
        "h3yunSkuId": "PART-2",
        "quantity": 3
      }
    ]
  }
}
```

输出示例（失败）：
```json
{
  "success": false,
  "error": "无法访问SKU映射表 (表单编码: e2ae2f1be3c7425cb1dc90a87131231a)，请检查表单编码是否正确或是否有访问权限",
  "schemaCode": "e2ae2f1be3c7425cb1dc90a87131231a",
  "troubleshooting": [
    "1. 检查表单编码是否正确",
    "2. 确认当前账号是否有访问该表单的权限",
    "3. 验证表单中是否包含必需字段: F0000001, F0000002, F0000003",
    "4. 如果表单不存在或无法访问，请在前端关闭"启用SKU映射"开关"
  ]
}
```

---

## 测试库存同步（带SKU映射）

```bash
curl -X POST http://localhost:3000/api/h3yun/inventory \
  -H 'Content-Type: application/json' \
  -d '{
    "enableSkuMapping": true,
    "pageSize": 500
  }' | jq '.'
```

---

## 响应字段说明

### 成功响应
- `Successful`: `true` - 请求成功
- `ReturnData.BizObjectArray`: SKU映射对象数组
  - `ObjectId`: 记录ID
  - `F0000001`: WooCommerce SKU（选择销售产品）
  - `F0000002`: 氚云SKU ID（替换发货产品）
  - `F0000003`: 数量倍数（替换数量）

### 失败响应
- `Successful`: `false` - 请求失败
- `ErrorMessage`: 错误信息

---

## 常见错误及解决方案

### 错误1: "根据 SchemaCode 获取 BizObjectSchema 失败"

**原因：**
- 表单编码不存在
- 当前账号无权限访问该表单

**解决方案：**
1. 在氚云ERP中确认表单编码
2. 检查账号权限
3. 或在前端关闭"启用SKU映射"开关

### 错误2: "认证失败"

**原因：**
- Engine Code 或 Engine Secret 错误

**解决方案：**
1. 检查 `.env.local` 中的配置
2. 确认氚云账号凭证是否正确

### 错误3: 返回空数组

**原因：**
- 表单存在但没有数据

**解决方案：**
1. 在氚云ERP中添加SKU映射数据
2. 确保字段 F0000001、F0000002、F0000003 有值

---

## 调试技巧

### 1. 查看完整请求和响应

```bash
curl -v -X POST 'https://www.h3yun.com/OpenApi/Invoke' \
  -H 'Content-Type: application/json' \
  -H "EngineCode: $H3YUN_ENGINE_CODE" \
  -H "EngineSecret: $H3YUN_ENGINE_SECRET" \
  -d '...' 2>&1 | tee debug.log
```

### 2. 保存响应到文件

```bash
curl -s ... > response.json
cat response.json | jq '.'
```

### 3. 提取特定字段

```bash
# 检查是否成功
curl -s ... | jq -r '.Successful'

# 获取记录数量
curl -s ... | jq -r '.ReturnData.BizObjectArray | length'

# 提取所有WooCommerce SKU
curl -s ... | jq -r '.ReturnData.BizObjectArray[].F0000001'
```

---

## 参考资料

- [SKU映射功能文档](./SKU_MAPPING.md)
- [氚云API文档](https://www.h3yun.com/api-docs)
