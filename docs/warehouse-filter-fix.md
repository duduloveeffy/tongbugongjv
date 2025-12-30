# 仓库筛选功能修复说明

## 问题描述

用户报告在自动同步过程中，Vapsolowholes 站点检测了 1253 个 SKU，但正常情况下应该只有 200 多个。所有 SKU 都被跳过（skipped: 1253），没有实际同步操作。

## 问题根因

在 `src/app/api/sync/site/route.ts` 的 `filterInventoryData` 函数中，**缺少仓库筛选功能**。

该函数在同步站点时用于筛选库存数据，原本包含以下筛选逻辑:
- ✅ SKU 前缀排除 (excludeSkuPrefixes)
- ✅ SKU 筛选 (skuFilter)
- ✅ 品类筛选 (categoryFilters)
- ✅ 隐藏零库存 (hideZeroStock)
- ❌ **仓库排除 (excludeWarehouses) - 缺失!**

## 影响范围

由于缺少仓库筛选,站点同步时会将**所有仓库**的库存数据都传递给产品检测环节,而不是只处理需要同步的仓库数据。

对于 Vapsolowholes 站点的配置:
- **排除仓库**: 深圳,德五，美一仓，独立站备货仓
- **排除 SKU 前缀**: JNR,VS5-,VS2-,HO,AK,YP-,RMTD,24PM,KPV,MA0,UK-,US-,VOL,FX,FL,ADY,VI,TRP3,TRP0,QU0,kp2,kp5,zhixiang,TW2-24-SI-MPW,TW2-11-LL-WI

没有仓库筛选时,系统会检测 1253 个来自所有仓库的 SKU,其中大部分不在 WooCommerce 站点中,导致全部被跳过。

## 解决方案

在 `filterInventoryData` 函数中添加仓库排除逻辑:

```typescript
// 仓库排除
if (excludeWarehouses?.trim()) {
  const excludeList = excludeWarehouses.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
  if (excludeList.some(warehouse => {
    const itemWarehouse = (item.仓库 || '').trim();
    const excludeWarehouse = warehouse.trim();
    return itemWarehouse === excludeWarehouse || itemWarehouse.includes(excludeWarehouse);
  })) {
    return false;
  }
}
```

### 筛选逻辑说明

- 支持多种分隔符: 逗号 `,`、中文逗号 `，`、换行符 `\n`
- 精确匹配: `itemWarehouse === excludeWarehouse`
- 包含匹配: `itemWarehouse.includes(excludeWarehouse)` (处理仓库名称变体)
- 自动去除空格: 使用 `.trim()` 处理前后空格

## 预期效果

修复后,站点同步将:

1. **步骤 0 (Dispatcher)**:
   - 拉取完整的 ERP 库存数据 (1253 条)
   - 缓存到 Redis (不应用站点筛选)

2. **步骤 1 (Site Sync)**:
   - 从 Redis 读取缓存 (1253 条)
   - 应用站点筛选:
     - 排除仓库: 深圳、德五、美一仓、独立站备货仓
     - 排除 SKU 前缀: JNR, VS5-, VS2- 等
   - 筛选后应该只剩 **200-250 条**库存记录
   - 只检测这 200-250 个 SKU 的产品状态
   - 执行实际同步操作

## 验证方法

### 1. 运行诊断脚本

```bash
node scripts/diagnose-auto-sync.js
```

查看站点筛选配置是否正确。

### 2. 检查最近批次

```bash
node scripts/check-recent-sku-counts.js
```

修复后应该看到:
- `检测SKU数: 200-250` (而不是 1253)
- `跳过: 少量` (而不是 1253)
- `有货/无货: 有实际同步数据`

### 3. 查看批次详情

```bash
node scripts/check-batch-details.js
```

查看 SKU 列表应该:
- 不包含被排除仓库的产品
- 不包含被排除前缀的产品

## 相关文件

- **修复代码**: `src/app/api/sync/site/route.ts` (lines 82-96)
- **站点配置**: `site_filters` 表 (Supabase)
- **诊断文档**: `docs/auto-sync-logic.md`
- **诊断脚本**: `scripts/diagnose-auto-sync.js`

## 提交信息

**Commit**: 6d41502
**标题**: fix: 添加仓库筛选功能到站点同步
**日期**: 2025-12-30

## 历史问题

之前的修复尝试:
1. ❌ 在 dispatcher 步骤 0 应用全局仓库排除 - 这会影响所有站点
2. ✅ 移除步骤 0 的筛选,让各站点应用自己的配置
3. ✅ **本次修复**: 在站点筛选函数中添加仓库排除逻辑

## 注意事项

- 修复后需要等待 Vercel 自动部署 (约 1-2 分钟)
- 新批次会使用新的筛选逻辑
- 已完成的旧批次数据不会改变
