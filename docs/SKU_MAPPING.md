# SKU映射功能文档

## 功能概述

SKU映射功能允许系统自动处理WooCommerce SKU和氚云ERP SKU之间的差异。当一个WooCommerce SKU对应多个氚云SKU时，系统会自动聚合计算库存。

## 使用场景

假设你有以下情况：
- WooCommerce网站销售"套装产品A"（SKU: `BUNDLE-A`）
- 该套装在氚云ERP中由多个独立SKU组成：
  - `PART-1`: 每套需要 2 个
  - `PART-2`: 每套需要 3 个

使用SKU映射功能后，系统会自动计算：
- `PART-1` 库存: 100 个 → 可组装 50 套
- `PART-2` 库存: 90 个 → 可组装 30 套
- **最终结果**: `BUNDLE-A` 可售库存 = 30 套（取最小值）

## 配置要求

### 1. 氚云映射表设置

在氚云ERP中创建SKU映射表，表单编码默认为 `e2ae2f1be3c7425cb1dc90a87131231a`

**必需字段：**
| 字段编码 | 字段名称 | 说明 | 示例 |
|---------|---------|------|------|
| F0000001 | 选择销售产品 | WooCommerce SKU | `BUNDLE-A` |
| F0000002 | 替换发货产品 | 氚云SKU ID | `PART-1` |
| F0000003 | 替换数量 | 数量倍数 | `2` |

**示例数据：**
```
F0000001      | F0000002  | F0000003
------------- | --------- | ---------
BUNDLE-A      | PART-1    | 2
BUNDLE-A      | PART-2    | 3
```

### 2. 环境变量配置

在 `.env.local` 文件中（可选）：
```bash
# SKU映射表单编码（可选，有默认值）
H3YUN_SKU_MAPPING_SCHEMA_CODE=e2ae2f1be3c7425cb1dc90a87131231a
```

## 使用方法

### 步骤1: 启用SKU映射

1. 访问 [库存分析页面](/inventory)
2. 找到"氚云 ERP 同步"面板
3. 打开"启用SKU映射"开关

### 步骤2: 测试映射表访问（可选）

点击"测试映射表访问"按钮验证配置：
- ✅ 成功：显示找到的映射记录数量
- ❌ 失败：显示错误信息和故障排查建议

### 步骤3: 同步库存

点击"同步库存"按钮，系统会自动：
1. 获取氚云库存数据
2. 获取SKU映射表
3. 进行聚合计算
4. 返回以WooCommerce SKU为主的库存数据

## 聚合算法

```
对于每个WooCommerce SKU:
  1. 查找所有映射的氚云SKU
  2. 对每个氚云SKU计算可用套数 = 氚云库存 ÷ 数量倍数
  3. 取所有可用套数的最小值作为最终库存
```

**公式：**
```
WooCommerce库存 = min(氚云SKU₁库存 ÷ 数量₁, 氚云SKU₂库存 ÷ 数量₂, ...)
```

## 常见问题

### Q1: 如果映射表不存在怎么办？

**A:** 关闭"启用SKU映射"开关，系统将使用常规模式同步（直接使用氚云SKU）。

### Q2: 如何验证映射是否生效？

**A:** 查看同步后的数据：
- 仓库字段显示为"聚合仓库"表示使用了映射
- 产品代码是WooCommerce SKU而非氚云SKU

### Q3: 映射表更新后需要重新同步吗？

**A:** 是的，每次同步都会重新读取映射表，确保使用最新数据。

### Q4: 支持多对一映射吗？

**A:** 当前主要支持一对多（1个WooCommerce SKU → 多个氚云SKU）。虽然技术上支持多对多，但建议避免多个WooCommerce SKU映射到同一个氚云SKU，这可能导致库存计算混乱。

### Q5: 如何处理没有映射的SKU？

**A:** 未在映射表中的SKU会被跳过，不会出现在最终结果中。如果需要混合模式（部分映射+部分直接使用），建议分两次同步或扩展代码逻辑。

## API端点

### 同步库存（带映射）
```http
POST /api/h3yun/inventory
Content-Type: application/json

{
  "enableSkuMapping": true,
  "pageSize": 500
}
```

### 测试映射表访问
```http
GET /api/h3yun/test-sku-mapping
```

## 技术实现

### 核心文件
- `src/lib/h3yun/types.ts` - 类型定义
- `src/lib/h3yun/client.ts` - API客户端
- `src/lib/h3yun/sku-mapping.ts` - 映射处理逻辑
- `src/lib/h3yun/transformer.ts` - 数据转换器
- `src/app/api/h3yun/inventory/route.ts` - API端点
- `src/components/inventory/H3YunSyncPanel.tsx` - 前端UI

### 性能优化
- 使用 `Map` 数据结构实现 O(1) 查找
- 双向映射缓存（WooCommerce ↔ H3Yun）
- 批量获取数据，减少API调用

## 更新日志

- **2025-01-XX**: 初始实现SKU映射功能
  - 支持一对多映射关系
  - 自动聚合计算库存
  - 前端UI开关和测试工具
