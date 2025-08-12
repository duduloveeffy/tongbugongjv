-- 检查当前数据库字段类型
SELECT 
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale,
  is_nullable
FROM information_schema.columns 
WHERE table_name IN ('orders', 'order_items', 'products', 'product_variations')
  AND column_name IN ('total', 'subtotal', 'price', 'regular_price', 'order_id', 'product_id')
ORDER BY table_name, column_name;