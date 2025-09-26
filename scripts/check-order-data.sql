-- 检查订单表的新字段状态

-- 1. 检查总订单数
SELECT COUNT(*) as total_orders FROM orders;

-- 2. 检查哪些新字段已有数据
SELECT
  COUNT(*) FILTER (WHERE payment_status IS NOT NULL) as has_payment_status,
  COUNT(*) FILTER (WHERE is_paid IS NOT NULL) as has_is_paid,
  COUNT(*) FILTER (WHERE attribution_source IS NOT NULL) as has_attribution_source,
  COUNT(*) FILTER (WHERE attribution_campaign IS NOT NULL) as has_attribution_campaign,
  COUNT(*) FILTER (WHERE is_returning_customer IS NOT NULL) as has_returning_customer,
  COUNT(*) FILTER (WHERE customer_lifetime_value IS NOT NULL) as has_lifetime_value
FROM orders;

-- 3. 查看最近同步的订单（包括所有字段）
SELECT
  order_id,
  order_number,
  customer_email,
  payment_method,
  date_paid,
  -- 检查新字段
  payment_status,
  is_paid,
  attribution_source,
  attribution_medium,
  is_returning_customer,
  synced_at
FROM orders
ORDER BY synced_at DESC
LIMIT 5;

-- 4. 检查 meta_data 字段是否包含归因数据
SELECT
  order_id,
  customer_email,
  meta_data::text as meta_data_preview
FROM orders
WHERE meta_data IS NOT NULL
  AND meta_data::text LIKE '%attribution%'
LIMIT 3;