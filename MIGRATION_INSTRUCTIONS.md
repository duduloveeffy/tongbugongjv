# 数据库迁移指南 - 增强订单同步功能

## 📋 迁移概述

这次迁移将为您的 Supabase 数据库添加以下功能：

1. **订单表扩展** - 添加支付信息、营销归因、客户历史等字段
2. **新建关联表** - 订单备注、客户历史、归因汇总
3. **分析函数** - 销量统计、库存状态、客户分析等
4. **性能优化** - 添加必要的索引

## 🚀 执行步骤

### 方法一：使用 Supabase SQL 编辑器（推荐）

1. **登录 Supabase 控制台**
   - 访问 https://app.supabase.com
   - 选择您的项目

2. **打开 SQL 编辑器**
   - 在左侧菜单中点击 "SQL Editor"
   - 点击 "New Query" 创建新查询

3. **执行迁移**
   - 复制 `supabase/migrations/combined_migration_20251225.sql` 文件的全部内容
   - 粘贴到 SQL 编辑器中
   - 点击 "Run" 按钮执行

4. **验证迁移**
   执行以下查询验证迁移是否成功：
   ```sql
   -- 检查 orders 表的新字段
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'orders'
   AND column_name LIKE 'attribution_%' OR column_name LIKE 'payment_%'
   LIMIT 5;

   -- 检查新创建的表
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('wc_order_notes', 'wc_customer_history', 'wc_order_attribution_summary');

   -- 检查函数是否创建成功
   SELECT routine_name
   FROM information_schema.routines
   WHERE routine_schema = 'public'
   AND routine_name IN ('get_batch_sales_stats', 'get_product_stock_status', 'update_customer_history_stats');
   ```

### 方法二：分步执行（如果遇到错误）

如果一次性执行所有迁移遇到问题，可以分步执行：

1. **步骤 1：扩展 orders 表**
   - 执行 `20251225_extend_orders_with_payment_attribution.sql` 的第1部分（ALTER TABLE 语句）

2. **步骤 2：创建关联表**
   - 执行创建 `wc_order_notes`、`wc_customer_history` 等表的语句

3. **步骤 3：创建索引**
   - 执行所有 CREATE INDEX 语句

4. **步骤 4：创建函数**
   - 执行 `20251225_create_sales_analysis_functions.sql` 中的函数

## 📁 迁移文件

- **完整迁移文件**：`supabase/migrations/combined_migration_20251225.sql`
- **原始迁移文件**：
  - `supabase/migrations/20251225_extend_orders_with_payment_attribution.sql`
  - `supabase/migrations/20251225_create_sales_analysis_functions.sql`

## ✅ 迁移后验证

迁移完成后，运行以下测试确保一切正常：

### 1. 测试订单同步
触发一次订单同步，检查新字段是否被正确填充：
```sql
SELECT
  order_id,
  payment_status,
  is_paid,
  attribution_source,
  attribution_campaign,
  is_returning_customer,
  customer_lifetime_value
FROM orders
WHERE attribution_source IS NOT NULL
LIMIT 5;
```

### 2. 测试销量统计函数
```sql
SELECT * FROM get_batch_sales_stats(
  ARRAY['SKU001', 'SKU002']::TEXT[],
  ARRAY[(SELECT id FROM wc_sites LIMIT 1)]::UUID[],
  30
);
```

### 3. 测试客户历史更新
```sql
-- 手动触发客户历史更新（替换为实际的 site_id 和 email）
SELECT update_customer_history_stats(
  (SELECT id FROM wc_sites LIMIT 1),
  'customer@example.com'
);
```

## ⚠️ 注意事项

1. **备份数据**：执行迁移前建议先备份数据库
2. **测试环境**：建议先在测试环境执行迁移
3. **性能影响**：迁移可能需要几分钟，期间可能影响性能
4. **错误处理**：如果看到 "already exists" 错误，这是正常的（IF NOT EXISTS 保护）

## 🔧 故障排除

### 常见问题

1. **权限错误**
   - 确保使用具有适当权限的数据库用户
   - 可能需要 SUPERUSER 权限来创建函数

2. **语法错误**
   - 确保复制了完整的 SQL 文件内容
   - 检查是否有特殊字符被错误转换

3. **外键约束错误**
   - 确保 `wc_sites` 和 `orders` 表已存在
   - 检查引用的表是否有正确的主键

## 📞 支持

如果遇到问题，请检查：
1. Supabase 日志（Dashboard → Logs）
2. 确保数据库版本支持所有使用的功能
3. 检查是否有足够的数据库存储空间

## ✨ 迁移完成后

迁移成功后，您的系统将能够：
- 完整同步 WooCommerce 订单的所有信息
- 追踪客户来源和营销效果
- 自动计算客户生命周期价值
- 保存订单备注历史
- 执行高级销量和客户分析

祝贺！您的数据库现在已具备完整的订单数据分析能力。