# 分步执行数据库迁移指南

由于函数参数冲突问题，请按照以下步骤分步执行迁移：

## 📋 步骤概览

1. 扩展 orders 表（添加新字段）
2. 创建新的关联表
3. 修复并创建函数
4. 创建索引
5. 验证迁移

## 🚀 详细步骤

### 步骤 1: 扩展 orders 表

在 Supabase SQL 编辑器中执行：

```sql
-- Add payment information fields
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_ip_address TEXT,
ADD COLUMN IF NOT EXISTS customer_user_agent TEXT,
ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_date_gmt TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_status TEXT,
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS paid_via_credit_card BOOLEAN DEFAULT false;

-- Add order attribution fields
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS attribution_origin TEXT,
ADD COLUMN IF NOT EXISTS attribution_source_type TEXT,
ADD COLUMN IF NOT EXISTS attribution_source TEXT,
ADD COLUMN IF NOT EXISTS attribution_medium TEXT,
ADD COLUMN IF NOT EXISTS attribution_campaign TEXT,
ADD COLUMN IF NOT EXISTS attribution_device_type TEXT,
ADD COLUMN IF NOT EXISTS attribution_session_page_views INTEGER,
ADD COLUMN IF NOT EXISTS attribution_utm_source TEXT,
ADD COLUMN IF NOT EXISTS attribution_utm_medium TEXT,
ADD COLUMN IF NOT EXISTS attribution_utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS attribution_utm_content TEXT,
ADD COLUMN IF NOT EXISTS attribution_utm_term TEXT,
ADD COLUMN IF NOT EXISTS attribution_referrer TEXT;

-- Add customer history fields
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS is_returning_customer BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS customer_order_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS customer_total_revenue DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS customer_average_order_value DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS customer_lifetime_value DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS customer_first_order_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS customer_last_order_date TIMESTAMPTZ;
```

✅ **验证**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders' AND column_name LIKE 'attribution_%'
LIMIT 5;
```

### 步骤 2: 创建新表

```sql
-- Create order notes table
CREATE TABLE IF NOT EXISTS wc_order_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  wc_order_id BIGINT NOT NULL,
  note_id BIGINT,
  note TEXT NOT NULL,
  note_type TEXT DEFAULT 'private',
  customer_note BOOLEAN DEFAULT false,
  added_by TEXT,
  added_by_user_id BIGINT,
  date_created TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, wc_order_id, note_id)
);

-- Create customer history table
CREATE TABLE IF NOT EXISTS wc_customer_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  customer_id BIGINT,
  customer_email TEXT NOT NULL,
  customer_first_name TEXT,
  customer_last_name TEXT,
  customer_phone TEXT,
  total_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,
  first_order_date TIMESTAMPTZ,
  last_order_date TIMESTAMPTZ,
  lifetime_value DECIMAL(10,2) DEFAULT 0,
  preferred_payment_method TEXT,
  preferred_category TEXT,
  most_purchased_sku TEXT,
  tags TEXT[],
  notes TEXT,
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, customer_email)
);

-- Create order attribution summary table
CREATE TABLE IF NOT EXISTS wc_order_attribution_summary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  source_type TEXT,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  device_type TEXT,
  order_count INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, period_date, source_type, source, medium, campaign, device_type)
);
```

✅ **验证**:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('wc_order_notes', 'wc_customer_history', 'wc_order_attribution_summary');
```

### 步骤 3: 修复并创建函数

⚠️ **重要**: 执行 `fix_functions_20251225.sql` 文件的全部内容

这个文件会：
1. 先删除所有可能存在的函数版本
2. 重新创建函数，避免参数冲突

```sql
-- 复制并执行 fix_functions_20251225.sql 的内容
```

✅ **验证**:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('get_batch_sales_stats', 'get_product_stock_status', 'update_customer_history_stats');
```

### 步骤 4: 创建索引

```sql
-- Indexes for orders table
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_is_paid ON orders(is_paid);
CREATE INDEX IF NOT EXISTS idx_orders_payment_date ON orders(payment_date);
CREATE INDEX IF NOT EXISTS idx_orders_attribution_source ON orders(attribution_source);
CREATE INDEX IF NOT EXISTS idx_orders_attribution_campaign ON orders(attribution_campaign);
CREATE INDEX IF NOT EXISTS idx_orders_is_returning_customer ON orders(is_returning_customer);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_site ON orders(site_id, customer_email);

-- Indexes for order notes
CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON wc_order_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notes_site_order ON wc_order_notes(site_id, wc_order_id);

-- Indexes for customer history
CREATE INDEX IF NOT EXISTS idx_customer_history_site_email ON wc_customer_history(site_id, customer_email);
CREATE INDEX IF NOT EXISTS idx_customer_history_lifetime_value ON wc_customer_history(lifetime_value DESC);

-- Indexes for order items
CREATE INDEX IF NOT EXISTS idx_order_items_sku_lookup ON order_items(sku, order_id) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_sales_analysis ON orders(site_id, date_created, status) WHERE status IN ('completed', 'processing');
```

### 步骤 5: 创建触发器

```sql
-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_wc_order_notes_updated_at ON wc_order_notes;
CREATE TRIGGER update_wc_order_notes_updated_at
  BEFORE UPDATE ON wc_order_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wc_customer_history_updated_at ON wc_customer_history;
CREATE TRIGGER update_wc_customer_history_updated_at
  BEFORE UPDATE ON wc_customer_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## ✅ 最终验证

执行以下查询确保所有迁移成功：

```sql
-- 检查 orders 表新字段
SELECT
  COUNT(*) FILTER (WHERE column_name LIKE 'attribution_%') as attribution_fields,
  COUNT(*) FILTER (WHERE column_name LIKE 'payment_%') as payment_fields,
  COUNT(*) FILTER (WHERE column_name LIKE 'customer_%') as customer_fields
FROM information_schema.columns
WHERE table_name = 'orders';

-- 检查新表
SELECT COUNT(*) as new_tables_count
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('wc_order_notes', 'wc_customer_history', 'wc_order_attribution_summary');

-- 检查函数
SELECT COUNT(*) as functions_count
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('get_batch_sales_stats', 'get_product_stock_status', 'update_customer_history_stats');

-- 期望结果：
-- attribution_fields: 13
-- payment_fields: 5
-- customer_fields: 7
-- new_tables_count: 3
-- functions_count: 3
```

## 🎉 完成

如果所有验证都通过，恭喜！你的数据库已经成功升级，现在可以：
- 同步完整的 WooCommerce 订单数据
- 追踪营销归因
- 分析客户生命周期价值
- 保存订单备注历史