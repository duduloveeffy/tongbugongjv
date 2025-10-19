# 氚云配置迁移指南

## 📢 重要变更

从 2025-01-XX 版本开始，氚云 ERP 的 **SchemaCode 配置已从 `.env.local` 移至独立配置文件**。

---

## 🔄 变更内容

### 之前（旧方式）

所有配置都在 `.env.local` 中：

```bash
# .env.local（旧）
H3YUN_ENGINE_CODE=xxx
H3YUN_ENGINE_SECRET=xxx
H3YUN_INVENTORY_SCHEMA_CODE=sirxt5xvsfeuamv3c2kdg
H3YUN_WAREHOUSE_SCHEMA_CODE=svsphqmtteooobudbgy
H3YUN_SKU_MAPPING_SCHEMA_CODE=e2ae2f1be3c7425cb1dc90a87131231a
```

### 现在（新方式）

**配置分离**：

1. **敏感信息** → `.env.local`
```bash
# .env.local（新）
H3YUN_ENGINE_CODE=xxx
H3YUN_ENGINE_SECRET=xxx
```

2. **表单编码** → `src/config/h3yun.config.ts`
```typescript
// src/config/h3yun.config.ts
export const h3yunSchemaConfig = {
  inventorySchemaCode: 'sirxt5xvsfeuamv3c2kdg',
  warehouseSchemaCode: 'svsphqmtteooobudbgy',
  skuMappingSchemaCode: 'e2ae2f1be3c7425cb1dc90a87131231a',
};
```

---

## 🚀 迁移步骤

### 步骤 1: 备份当前配置

```bash
# 备份 .env.local
cp .env.local .env.local.backup
```

### 步骤 2: 更新 .env.local

编辑 `.env.local`，**移除** 以下三行：
```bash
# ❌ 移除这些行
H3YUN_INVENTORY_SCHEMA_CODE=sirxt5xvsfeuamv3c2kdg
H3YUN_WAREHOUSE_SCHEMA_CODE=svsphqmtteooobudbgy
H3YUN_SKU_MAPPING_SCHEMA_CODE=e2ae2f1be3c7425cb1dc90a87131231a
```

**保留** 敏感信息：
```bash
# ✅ 保留这些行
H3YUN_ENGINE_CODE=t4yq7mzi2zpe1rnn6etflbvm0
H3YUN_ENGINE_SECRET=dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==
```

### 步骤 3: 验证配置文件

检查 `src/config/h3yun.config.ts` 是否包含正确的 SchemaCode：

```typescript
// src/config/h3yun.config.ts
export const h3yunSchemaConfig = {
  inventorySchemaCode: 'sirxt5xvsfeuamv3c2kdg',        // ✅ 您的库存表编码
  warehouseSchemaCode: 'svsphqmtteooobudbgy',          // ✅ 您的仓库表编码
  skuMappingSchemaCode: 'e2ae2f1be3c7425cb1dc90a87131231a',  // ✅ 您的SKU映射表编码
};
```

如果编码不正确，直接在此文件中修改。

### 步骤 4: 重启开发服务器

```bash
# 停止当前服务器（Ctrl+C）
# 重新启动
npm run dev
```

### 步骤 5: 测试验证

```bash
# 方法1: Web界面
# 访问 http://localhost:3000/inventory
# 查看"氚云 ERP 同步"面板是否正常

# 方法2: API测试
curl http://localhost:3000/api/h3yun/config

# 方法3: 完整测试
./test-h3yun-schemas.sh  # Mac/Linux
test-h3yun-schemas.bat  # Windows
```

---

## ✅ 验证清单

- [ ] `.env.local` 中移除了 `H3YUN_*_SCHEMA_CODE` 配置
- [ ] `.env.local` 中保留了 `H3YUN_ENGINE_CODE` 和 `H3YUN_ENGINE_SECRET`
- [ ] `src/config/h3yun.config.ts` 包含正确的 SchemaCode
- [ ] 开发服务器已重启
- [ ] 库存同步功能正常工作
- [ ] SKU映射功能正常（如果使用）

---

## 💡 优势

### 之前的问题
- ❌ SchemaCode 和敏感信息混在一起
- ❌ 修改 SchemaCode 需要编辑 `.env.local`
- ❌ 团队成员难以共享 SchemaCode 配置
- ❌ 不同环境的 SchemaCode 管理不便

### 现在的优势
- ✅ 敏感信息和业务配置分离
- ✅ SchemaCode 可以提交到代码仓库，方便团队协作
- ✅ 修改 SchemaCode 无需重启服务器（热更新）
- ✅ 支持环境变量覆盖（如果需要）
- ✅ 配置更清晰，易于维护

---

## 🔧 回滚方案

如果遇到问题，可以临时回滚：

在 `.env.local` 中添加：
```bash
# 临时回滚：通过环境变量覆盖
H3YUN_INVENTORY_SCHEMA_CODE=sirxt5xvsfeuamv3c2kdg
H3YUN_WAREHOUSE_SCHEMA_CODE=svsphqmtteooobudbgy
H3YUN_SKU_MAPPING_SCHEMA_CODE=e2ae2f1be3c7425cb1dc90a87131231a
```

环境变量优先级更高，会覆盖配置文件。

---

## ❓ 常见问题

### Q: 为什么要做这个变更？

**A**: 提高安全性和可维护性：
- 敏感信息不提交到代码仓库
- 业务配置可以团队共享
- 简化配置管理

### Q: 旧的配置方式还能用吗？

**A**: 可以！通过环境变量覆盖仍然有效，但不推荐作为长期方案。

### Q: 如果我有多个环境怎么办？

**A**: 每个环境使用不同的 `.env.local`（或 `.env.production`），SchemaCode 在配置文件中统一管理。如果不同环境需要不同的 SchemaCode，使用环境变量覆盖。

### Q: 我需要修改 SchemaCode，怎么做？

**A**: 直接编辑 `src/config/h3yun.config.ts`，保存后自动生效（热更新）。

---

## 📖 相关文档

- [配置指南](./H3YUN_CONFIG_GUIDE.md) - 完整配置说明
- [快速测试](../QUICK_TEST.md) - 测试命令
- [SKU映射](./SKU_MAPPING.md) - SKU映射功能说明

---

## 📞 需要帮助？

如遇问题，请：
1. 检查 `.env.local` 格式是否正确
2. 确认 `src/config/h3yun.config.ts` 存在
3. 查看开发服务器控制台错误信息
4. 运行测试脚本诊断问题

测试命令：
```bash
./test-h3yun-schemas.sh  # Mac/Linux
test-h3yun-schemas.bat  # Windows
```
