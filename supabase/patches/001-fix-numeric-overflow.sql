-- 修复数值字段溢出问题
-- 将价格字段的精度从 DECIMAL(10,2) 改为 DECIMAL(15,4)
-- 将订单ID字段改为 BIGINT 以支持更大的数值

-- 修复 orders 表的数值字段
ALTER TABLE orders 
  ALTER COLUMN total TYPE DECIMAL(15,4),
  ALTER COLUMN subtotal TYPE DECIMAL(15,4),
  ALTER COLUMN total_tax TYPE DECIMAL(15,4),
  ALTER COLUMN shipping_total TYPE DECIMAL(15,4),
  ALTER COLUMN shipping_tax TYPE DECIMAL(15,4),
  ALTER COLUMN discount_total TYPE DECIMAL(15,4),
  ALTER COLUMN discount_tax TYPE DECIMAL(15,4),
  ALTER COLUMN order_id TYPE BIGINT,
  ALTER COLUMN customer_id TYPE BIGINT;

-- 修复 order_items 表的数值字段
ALTER TABLE order_items 
  ALTER COLUMN product_id TYPE BIGINT,
  ALTER COLUMN variation_id TYPE BIGINT,
  ALTER COLUMN quantity TYPE INTEGER,
  ALTER COLUMN price TYPE DECIMAL(15,4),
  ALTER COLUMN subtotal TYPE DECIMAL(15,4),
  ALTER COLUMN subtotal_tax TYPE DECIMAL(15,4),
  ALTER COLUMN total TYPE DECIMAL(15,4),
  ALTER COLUMN total_tax TYPE DECIMAL(15,4),
  ALTER COLUMN item_id TYPE BIGINT;

-- 修复 products 表的数值字段
ALTER TABLE products 
  ALTER COLUMN product_id TYPE BIGINT,
  ALTER COLUMN price TYPE DECIMAL(15,4),
  ALTER COLUMN regular_price TYPE DECIMAL(15,4),
  ALTER COLUMN sale_price TYPE DECIMAL(15,4),
  ALTER COLUMN stock_quantity TYPE INTEGER,
  ALTER COLUMN parent_id TYPE BIGINT;

-- 修复 product_variations 表的数值字段
ALTER TABLE product_variations 
  ALTER COLUMN variation_id TYPE BIGINT,
  ALTER COLUMN price TYPE DECIMAL(15,4),
  ALTER COLUMN regular_price TYPE DECIMAL(15,4),
  ALTER COLUMN sale_price TYPE DECIMAL(15,4),
  ALTER COLUMN stock_quantity TYPE INTEGER;

-- 更新相关函数以处理新的数据类型
CREATE OR REPLACE FUNCTION get_sku_sales_stats(
  p_sku TEXT,
  p_site_id UUID DEFAULT NULL,
  p_start_date TIMESTAMP DEFAULT NULL,
  p_end_date TIMESTAMP DEFAULT NULL
)
RETURNS TABLE (
  sku TEXT,
  site_id UUID,
  site_name TEXT,
  total_orders BIGINT,
  total_quantity BIGINT,
  total_revenue DECIMAL(15,4),
  avg_price DECIMAL(15,4),
  first_order_date TIMESTAMP WITH TIME ZONE,
  last_order_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oi.sku,
    s.id as site_id,
    s.name as site_name,
    COUNT(DISTINCT o.id) as total_orders,
    COALESCE(SUM(oi.quantity), 0) as total_quantity,
    COALESCE(SUM(oi.total), 0) as total_revenue,
    CASE 
      WHEN SUM(oi.quantity) > 0 THEN SUM(oi.total) / SUM(oi.quantity)
      ELSE 0
    END as avg_price,
    MIN(o.date_created) as first_order_date,
    MAX(o.date_created) as last_order_date
  FROM order_items oi
  INNER JOIN orders o ON oi.order_id = o.id
  INNER JOIN wc_sites s ON o.site_id = s.id
  WHERE 
    oi.sku = p_sku
    AND o.status IN ('completed', 'processing')
    AND (p_site_id IS NULL OR o.site_id = p_site_id)
    AND (p_start_date IS NULL OR o.date_created >= p_start_date)
    AND (p_end_date IS NULL OR o.date_created <= p_end_date)
  GROUP BY oi.sku, s.id, s.name;
END;
$$ LANGUAGE plpgsql;

-- 更新批量销售统计函数
CREATE OR REPLACE FUNCTION get_batch_sales_stats(
  p_skus TEXT[],
  p_site_ids UUID[] DEFAULT NULL,
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  sku TEXT,
  site_id UUID,
  site_name TEXT,
  order_count BIGINT,
  sales_quantity BIGINT,
  order_count_30d BIGINT,
  sales_quantity_30d BIGINT,
  total_revenue DECIMAL(15,4),
  last_order_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oi.sku,
    s.id as site_id,
    s.name as site_name,
    COUNT(DISTINCT o.id) as order_count,
    COALESCE(SUM(oi.quantity), 0) as sales_quantity,
    COUNT(DISTINCT CASE 
      WHEN o.date_created >= CURRENT_DATE - INTERVAL '30 days' 
      THEN o.id 
    END) as order_count_30d,
    COALESCE(SUM(CASE 
      WHEN o.date_created >= CURRENT_DATE - INTERVAL '30 days' 
      THEN oi.quantity 
      ELSE 0 
    END), 0) as sales_quantity_30d,
    COALESCE(SUM(oi.total), 0) as total_revenue,
    MAX(o.date_created) as last_order_date
  FROM order_items oi
  INNER JOIN orders o ON oi.order_id = o.id
  INNER JOIN wc_sites s ON o.site_id = s.id
  WHERE 
    oi.sku = ANY(p_skus)
    AND o.status IN ('completed', 'processing')
    AND (p_site_ids IS NULL OR o.site_id = ANY(p_site_ids))
    AND o.date_created >= CURRENT_DATE - INTERVAL '1 year'
  GROUP BY oi.sku, s.id, s.name
  ORDER BY oi.sku, s.name;
END;
$$ LANGUAGE plpgsql;

-- 更新产品库存状态函数
CREATE OR REPLACE FUNCTION get_product_stock_status(
  p_skus TEXT[],
  p_site_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  sku TEXT,
  site_id UUID,
  site_name TEXT,
  product_name TEXT,
  stock_quantity INTEGER,
  stock_status TEXT,
  price DECIMAL(15,4),
  manage_stock BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.sku,
    s.id as site_id,
    s.name as site_name,
    p.name as product_name,
    p.stock_quantity,
    p.stock_status,
    p.price,
    p.manage_stock
  FROM products p
  INNER JOIN wc_sites s ON p.site_id = s.id
  WHERE 
    p.sku = ANY(p_skus)
    AND (p_site_ids IS NULL OR p.site_id = ANY(p_site_ids))
    AND p.status = 'publish'
  ORDER BY p.sku, s.name;
END;
$$ LANGUAGE plpgsql;