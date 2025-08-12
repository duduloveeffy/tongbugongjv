-- 安全的数据库字段升级脚本
-- 这个脚本会检查数据并安全地升级字段类型

-- 开始事务以确保原子性
BEGIN;

-- 1. 首先备份可能有问题的数据
CREATE TABLE IF NOT EXISTS temp_problematic_orders AS
SELECT order_id, site_id, total, subtotal, total_tax
FROM orders 
WHERE total > 999999.99 OR total < -999999.99
   OR subtotal > 999999.99 OR subtotal < -999999.99
   OR total_tax > 999999.99 OR total_tax < -999999.99;

-- 2. 显示将要修复的记录数量
DO $$
DECLARE
  problem_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO problem_count FROM temp_problematic_orders;
  RAISE NOTICE '发现 % 条可能有问题的订单记录', problem_count;
END $$;

-- 3. 安全地升级orders表的数值字段
DO $$
BEGIN
  -- 检查列是否存在且类型需要升级
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'total' 
    AND numeric_precision = 10 AND numeric_scale = 2
  ) THEN
    ALTER TABLE orders 
      ALTER COLUMN total TYPE DECIMAL(15,4) USING LEAST(GREATEST(total, -9999999999.9999), 9999999999.9999);
    RAISE NOTICE '升级orders.total字段完成';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'subtotal' 
    AND numeric_precision = 10 AND numeric_scale = 2
  ) THEN
    ALTER TABLE orders 
      ALTER COLUMN subtotal TYPE DECIMAL(15,4) USING LEAST(GREATEST(subtotal, -9999999999.9999), 9999999999.9999);
    RAISE NOTICE '升级orders.subtotal字段完成';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'total_tax' 
    AND numeric_precision = 10 AND numeric_scale = 2
  ) THEN
    ALTER TABLE orders 
      ALTER COLUMN total_tax TYPE DECIMAL(15,4) USING LEAST(GREATEST(total_tax, -9999999999.9999), 9999999999.9999);
    RAISE NOTICE '升级orders.total_tax字段完成';
  END IF;

  -- 升级其他价格字段
  ALTER TABLE orders 
    ALTER COLUMN shipping_total TYPE DECIMAL(15,4),
    ALTER COLUMN shipping_tax TYPE DECIMAL(15,4),
    ALTER COLUMN discount_total TYPE DECIMAL(15,4),
    ALTER COLUMN discount_tax TYPE DECIMAL(15,4);

  -- 升级ID字段为BIGINT（如果当前是INTEGER）
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'order_id' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE orders ALTER COLUMN order_id TYPE BIGINT;
    RAISE NOTICE '升级orders.order_id字段完成';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'customer_id' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE orders ALTER COLUMN customer_id TYPE BIGINT;
    RAISE NOTICE '升级orders.customer_id字段完成';
  END IF;
END $$;

-- 4. 升级order_items表
DO $$
BEGIN
  ALTER TABLE order_items 
    ALTER COLUMN price TYPE DECIMAL(15,4),
    ALTER COLUMN subtotal TYPE DECIMAL(15,4),
    ALTER COLUMN subtotal_tax TYPE DECIMAL(15,4),
    ALTER COLUMN total TYPE DECIMAL(15,4),
    ALTER COLUMN total_tax TYPE DECIMAL(15,4);

  -- 升级ID字段
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_items' AND column_name = 'product_id' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE order_items ALTER COLUMN product_id TYPE BIGINT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_items' AND column_name = 'variation_id' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE order_items ALTER COLUMN variation_id TYPE BIGINT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_items' AND column_name = 'item_id' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE order_items ALTER COLUMN item_id TYPE BIGINT;
  END IF;

  RAISE NOTICE '升级order_items表完成';
END $$;

-- 5. 升级products表
DO $$
BEGIN
  ALTER TABLE products 
    ALTER COLUMN price TYPE DECIMAL(15,4),
    ALTER COLUMN regular_price TYPE DECIMAL(15,4),
    ALTER COLUMN sale_price TYPE DECIMAL(15,4);

  -- 升级ID字段
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'product_id' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE products ALTER COLUMN product_id TYPE BIGINT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'parent_id' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE products ALTER COLUMN parent_id TYPE BIGINT;
  END IF;

  RAISE NOTICE '升级products表完成';
END $$;

-- 6. 升级product_variations表
DO $$
BEGIN
  ALTER TABLE product_variations 
    ALTER COLUMN price TYPE DECIMAL(15,4),
    ALTER COLUMN regular_price TYPE DECIMAL(15,4),
    ALTER COLUMN sale_price TYPE DECIMAL(15,4);

  -- 升级ID字段
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_variations' AND column_name = 'variation_id' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE product_variations ALTER COLUMN variation_id TYPE BIGINT;
  END IF;

  RAISE NOTICE '升级product_variations表完成';
END $$;

-- 7. 验证升级结果
SELECT 
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns 
WHERE table_name IN ('orders', 'order_items', 'products', 'product_variations')
  AND column_name IN ('total', 'subtotal', 'price', 'regular_price', 'order_id', 'product_id')
ORDER BY table_name, column_name;

-- 8. 清理临时表（如果没有问题数据）
DO $$
DECLARE
  problem_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO problem_count FROM temp_problematic_orders;
  IF problem_count = 0 THEN
    DROP TABLE temp_problematic_orders;
    RAISE NOTICE '没有发现问题数据，已清理临时表';
  ELSE
    RAISE NOTICE '保留临时表 temp_problematic_orders，包含 % 条问题记录', problem_count;
  END IF;
END $$;

-- 提交事务
COMMIT;

-- 显示完成信息
SELECT 'Database upgrade completed successfully!' as status;