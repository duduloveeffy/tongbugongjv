# 氚云 ERP 配置指南

## 📋 配置文件结构

氚云 ERP 配置分为两部分：

### 1. 敏感信息配置（`.env.local`）

**位置**: 项目根目录 `.env.local`

**包含内容**:
- `H3YUN_ENGINE_CODE` - 氚云引擎代码（敏感）
- `H3YUN_ENGINE_SECRET` - 氚云引擎密钥（敏感）

**注意**:
- ⚠️ **不要**将此文件提交到 Git
- 已在 `.gitignore` 中排除

### 2. 表单编码配置（`src/config/h3yun.config.ts`）

**位置**: `src/config/h3yun.config.ts`

**包含内容**:
- `inventorySchemaCode` - 库存表单编码
- `warehouseSchemaCode` - 仓库表单编码
- `skuMappingSchemaCode` - SKU映射表单编码

**注意**:
- ✅ **可以**提交到 Git（非敏感信息）
- 修改方便，无需重启开发服务器

---

## 🚀 快速开始

### 步骤 1: 配置敏感信息

复制示例文件：
```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入您的氚云凭证：
```bash
H3YUN_ENGINE_CODE=t4yq7mzi2zpe1rnn6etflbvm0
H3YUN_ENGINE_SECRET=your_secret_here
```

### 步骤 2: 配置表单编码（如需修改）

编辑 `src/config/h3yun.config.ts`：
```typescript
export const h3yunSchemaConfig = {
  // 库存表编码
  inventorySchemaCode: 'sirxt5xvsfeuamv3c2kdg',

  // 仓库表编码
  warehouseSchemaCode: 'svsphqmtteooobudbgy',

  // SKU映射表编码
  skuMappingSchemaCode: 'e2ae2f1be3c7425cb1dc90a87131231a',
};
```

### 步骤 3: 验证配置

```bash
# 启动开发服务器
npm run dev

# 测试连接
curl http://localhost:3000/api/h3yun/config
```

---

## 📝 配置说明

### 当前配置值

| 配置项 | SchemaCode | 说明 |
|--------|-----------|------|
| 库存表 | `sirxt5xvsfeuamv3c2kdg` | 产品库存数据 |
| 仓库表 | `svsphqmtteooobudbgy` | 仓库名称信息 |
| SKU映射表 | `e2ae2f1be3c7425cb1dc90a87131231a` | WooCommerce ↔ 氚云SKU映射 |

### 如何找到表单编码

1. 登录氚云ERP: https://www.h3yun.com
2. 进入**应用管理** → **表单管理**
3. 找到对应的表单
4. 查看表单属性/设置中的 **SchemaCode**

---

## 🔧 高级配置

### 通过环境变量覆盖（可选）

虽然 SchemaCode 已在配置文件中定义，但仍支持通过环境变量覆盖：

在 `.env.local` 中添加：
```bash
# 覆盖库存表编码
H3YUN_INVENTORY_SCHEMA_CODE=custom_schema_code

# 覆盖仓库表编码
H3YUN_WAREHOUSE_SCHEMA_CODE=custom_warehouse_code

# 覆盖SKU映射表编码
H3YUN_SKU_MAPPING_SCHEMA_CODE=custom_sku_mapping_code
```

**优先级**: 环境变量 > 配置文件

---

## 🔍 配置验证

### 方法 1: Web 界面

访问: http://localhost:3000/inventory

查看"氚云 ERP 同步"面板，如果配置正确会显示"氚云 ERP 已配置"。

### 方法 2: API 端点

```bash
# 检查配置状态
curl http://localhost:3000/api/h3yun/config

# 测试连接
curl -X POST http://localhost:3000/api/h3yun/test

# 测试SKU映射表
curl http://localhost:3000/api/h3yun/test-sku-mapping
```

### 方法 3: 命令行脚本

```bash
# Mac/Linux
./test-h3yun-schemas.sh

# Windows
test-h3yun-schemas.bat
```

---

## ❓ 常见问题

### Q1: 为什么要分离配置？

**A**:
- **安全性**: 敏感信息（EngineCode/Secret）不提交到代码仓库
- **便捷性**: 表单编码（SchemaCode）可以直接在代码中修改，方便团队协作
- **灵活性**: 支持多环境配置（dev/staging/prod）

### Q2: 修改配置后需要重启吗？

**A**:
- 修改 `.env.local`: **需要**重启开发服务器
- 修改 `h3yun.config.ts`: **不需要**重启（热更新）

### Q3: 如何在多环境中使用不同的 SchemaCode？

**A**:
使用环境变量覆盖：
```bash
# 开发环境 .env.local
H3YUN_INVENTORY_SCHEMA_CODE=dev_schema_code

# 生产环境 .env.production
H3YUN_INVENTORY_SCHEMA_CODE=prod_schema_code
```

### Q4: 配置文件可以提交到 Git 吗？

**A**:
- ✅ `src/config/h3yun.config.ts` - **可以提交**（非敏感）
- ❌ `.env.local` - **不能提交**（包含敏感信息）
- ✅ `.env.local.example` - **应该提交**（示例模板）

---

## 🔗 相关文档

- [SKU映射功能](./SKU_MAPPING.md)
- [快速测试指南](../QUICK_TEST.md)
- [Curl测试命令](./H3YUN_TEST_COMMANDS.md)

---

## 📞 技术支持

如遇问题，请检查：
1. `.env.local` 文件是否存在且配置正确
2. `src/config/h3yun.config.ts` 中的 SchemaCode 是否正确
3. 氚云账号是否有访问对应表单的权限
4. 网络连接是否正常

测试命令:
```bash
# 测试所有表单
./test-h3yun-schemas.sh  # Mac/Linux
test-h3yun-schemas.bat  # Windows
```
