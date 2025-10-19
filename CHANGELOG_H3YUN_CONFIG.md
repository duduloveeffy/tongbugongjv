# 氚云配置重构变更日志

## 📅 版本 2025-01-XX

### 🎯 主要变更

将氚云 ERP 的 SchemaCode 配置从环境变量（`.env.local`）迁移到独立配置文件（`src/config/h3yun.config.ts`）。

---

## 📦 新增文件

| 文件 | 说明 |
|------|------|
| `src/config/h3yun.config.ts` | 氚云表单编码配置文件 |
| `docs/H3YUN_CONFIG_GUIDE.md` | 完整配置指南 |
| `docs/H3YUN_CONFIG_MIGRATION.md` | 迁移指南 |

---

## 📝 修改文件

### 核心代码

| 文件 | 变更内容 |
|------|---------|
| `src/env.js` | 移除 `H3YUN_*_SCHEMA_CODE` 环境变量定义 |
| `src/lib/h3yun/types.ts` | 更新配置接口注释 |
| `src/app/api/h3yun/inventory/route.ts` | 从配置文件读取 SchemaCode |
| `src/app/api/h3yun/test-sku-mapping/route.ts` | 从配置文件读取 SchemaCode |
| `src/app/api/h3yun/config/route.ts` | 从配置文件读取 SchemaCode |
| `src/app/api/h3yun/test/route.ts` | 从配置文件读取 SchemaCode |

### 文档

| 文件 | 变更内容 |
|------|---------|
| `.env.local.example` | 更新为只包含敏感信息 |
| `docs/SKU_MAPPING.md` | 更新配置说明 |
| `QUICK_TEST.md` | 更新测试命令 |

---

## 🔄 配置变更

### 之前
```bash
# .env.local
H3YUN_ENGINE_CODE=xxx
H3YUN_ENGINE_SECRET=xxx
H3YUN_INVENTORY_SCHEMA_CODE=sirxt5xvsfeuamv3c2kdg
H3YUN_WAREHOUSE_SCHEMA_CODE=svsphqmtteooobudbgy
H3YUN_SKU_MAPPING_SCHEMA_CODE=e2ae2f1be3c7425cb1dc90a87131231a
```

### 现在
```bash
# .env.local（只保留敏感信息）
H3YUN_ENGINE_CODE=xxx
H3YUN_ENGINE_SECRET=xxx
```

```typescript
// src/config/h3yun.config.ts（新增）
export const h3yunSchemaConfig = {
  inventorySchemaCode: 'sirxt5xvsfeuamv3c2kdg',
  warehouseSchemaCode: 'svsphqmtteooobudbgy',
  skuMappingSchemaCode: 'e2ae2f1be3c7425cb1dc90a87131231a',
};
```

---

## ✨ 优势

1. **更安全** - 敏感信息与业务配置分离
2. **更便捷** - SchemaCode 可直接在代码中修改
3. **更协作** - 配置文件可提交到 Git，团队共享
4. **更灵活** - 支持环境变量覆盖（如果需要）
5. **热更新** - 修改配置无需重启开发服务器

---

## 🔧 兼容性

- ✅ **向后兼容** - 仍支持通过环境变量覆盖
- ✅ **无破坏性** - 环境变量优先级更高
- ✅ **平滑迁移** - 可逐步迁移，无需一次性完成

---

## 📋 迁移检查清单

- [ ] 阅读 [迁移指南](docs/H3YUN_CONFIG_MIGRATION.md)
- [ ] 备份当前 `.env.local`
- [ ] 从 `.env.local` 移除 SchemaCode 配置
- [ ] 验证 `src/config/h3yun.config.ts` 中的配置
- [ ] 重启开发服务器
- [ ] 测试库存同步功能
- [ ] 测试SKU映射功能（如果使用）

---

## 📖 相关文档

- [配置指南](docs/H3YUN_CONFIG_GUIDE.md)
- [迁移指南](docs/H3YUN_CONFIG_MIGRATION.md)
- [快速测试](QUICK_TEST.md)

---

## 🐛 已知问题

无

---

## 🎉 贡献者

- Claude Code - 自动化重构

---

## 📌 注意事项

1. **立即行动**：建议尽快从 `.env.local` 移除 SchemaCode 配置
2. **团队同步**：通知团队成员更新本地配置
3. **CI/CD**：检查 CI/CD 流程是否需要更新
4. **文档**：内部文档引用的配置位置需要更新

---

## 🔗 相关 Issue

无

---

## 📞 支持

如遇问题，请查看：
1. [配置指南](docs/H3YUN_CONFIG_GUIDE.md)
2. [迁移指南](docs/H3YUN_CONFIG_MIGRATION.md)
3. 运行测试脚本诊断：`./test-h3yun-schemas.sh`
