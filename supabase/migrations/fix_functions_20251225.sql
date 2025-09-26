-- ============================================
-- FIX FUNCTIONS - Safe Drop and Recreate
-- Created: 2025-12-25
--
-- This script safely drops and recreates functions
-- to handle parameter changes and conflicts
-- ============================================

-- Drop ALL existing versions of functions first
DROP FUNCTION IF EXISTS get_batch_sales_stats(TEXT[], UUID[], INTEGER);
DROP FUNCTION IF EXISTS get_batch_sales_stats(TEXT[], UUID[]);
DROP FUNCTION IF EXISTS get_product_stock_status(TEXT[], UUID[]);
DROP FUNCTION IF EXISTS update_customer_history_stats(UUID, TEXT);

-- ============================================
-- RECREATE FUNCTIONS
-- ============================================

-- Function to update customer history
CREATE OR REPLACE FUNCTION update_customer_history_stats(
  p_site_id UUID,
  p_customer_email TEXT
) RETURNS VOID AS $$
DECLARE
  v_stats RECORD;
BEGIN
  SELECT
    COUNT(*) as order_count,
    SUM(total) as total_revenue,
    AVG(total) as avg_order_value,
    MIN(date_created) as first_order,
    MAX(date_created) as last_order,
    MODE() WITHIN GROUP (ORDER BY payment_method) as preferred_payment
  INTO v_stats
  FROM orders
  WHERE site_id = p_site_id
    AND customer_email = p_customer_email
    AND status IN ('completed', 'processing');

  INSERT INTO wc_customer_history (
    site_id,
    customer_email,
    total_orders,
    total_revenue,
    average_order_value,
    first_order_date,
    last_order_date,
    lifetime_value,
    preferred_payment_method,
    last_calculated_at
  ) VALUES (
    p_site_id,
    p_customer_email,
    v_stats.order_count,
    COALESCE(v_stats.total_revenue, 0),
    COALESCE(v_stats.avg_order_value, 0),
    v_stats.first_order,
    v_stats.last_order,
    COALESCE(v_stats.total_revenue, 0),
    v_stats.preferred_payment,
    NOW()
  )
  ON CONFLICT (site_id, customer_email)
  DO UPDATE SET
    total_orders = EXCLUDED.total_orders,
    total_revenue = EXCLUDED.total_revenue,
    average_order_value = EXCLUDED.average_order_value,
    first_order_date = EXCLUDED.first_order_date,
    last_order_date = EXCLUDED.last_order_date,
    lifetime_value = EXCLUDED.lifetime_value,
    preferred_payment_method = EXCLUDED.preferred_payment_method,
    last_calculated_at = NOW(),
    updated_at = NOW();

  UPDATE orders
  SET
    is_returning_customer = (v_stats.order_count > 1),
    customer_order_count = v_stats.order_count,
    customer_total_revenue = v_stats.total_revenue,
    customer_average_order_value = v_stats.avg_order_value,
    customer_lifetime_value = v_stats.total_revenue,
    customer_first_order_date = v_stats.first_order,
    customer_last_order_date = v_stats.last_order
  WHERE site_id = p_site_id
    AND customer_email = p_customer_email;
END;
$$ LANGUAGE plpgsql;

-- Function to get batch sales statistics
CREATE OR REPLACE FUNCTION get_batch_sales_stats(
  p_skus TEXT[],
  p_site_ids UUID[],
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
  total_revenue DECIMAL(10,2),
  last_order_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH sales_data AS (
    SELECT
      oi.sku,
      o.site_id,
      s.name as site_name,
      COUNT(DISTINCT o.id) as order_count_all,
      SUM(oi.quantity) as sales_quantity_all,
      COUNT(DISTINCT CASE
        WHEN o.date_created >= NOW() - INTERVAL '1 day' * p_days_back
        THEN o.id
      END) as order_count_recent,
      SUM(CASE
        WHEN o.date_created >= NOW() - INTERVAL '1 day' * p_days_back
        THEN oi.quantity
        ELSE 0
      END) as sales_quantity_recent,
      SUM(oi.total) as total_rev,
      MAX(o.date_created) as last_order
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    INNER JOIN wc_sites s ON s.id = o.site_id
    WHERE
      oi.sku = ANY(p_skus)
      AND o.site_id = ANY(p_site_ids)
      AND o.status IN ('completed', 'processing')
      AND oi.sku IS NOT NULL
    GROUP BY oi.sku, o.site_id, s.name
  )
  SELECT
    sd.sku::TEXT,
    sd.site_id,
    sd.site_name::TEXT,
    sd.order_count_all::BIGINT,
    sd.sales_quantity_all::BIGINT,
    sd.order_count_recent::BIGINT,
    sd.sales_quantity_recent::BIGINT,
    sd.total_rev::DECIMAL(10,2),
    sd.last_order
  FROM sales_data sd
  ORDER BY sd.sku, sd.site_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get product stock status
CREATE OR REPLACE FUNCTION get_product_stock_status(
  p_skus TEXT[],
  p_site_ids UUID[]
)
RETURNS TABLE (
  sku TEXT,
  site_id UUID,
  site_name TEXT,
  product_name TEXT,
  product_id BIGINT,
  stock_quantity INTEGER,
  stock_status TEXT,
  price DECIMAL(10,2),
  manage_stock BOOLEAN,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.sku::TEXT,
    p.site_id,
    s.name::TEXT as site_name,
    p.name::TEXT as product_name,
    p.product_id,
    p.stock_quantity::INTEGER,
    p.stock_status::TEXT,
    p.price::DECIMAL(10,2),
    p.manage_stock,
    p.status::TEXT
  FROM products p
  INNER JOIN wc_sites s ON s.id = p.site_id
  WHERE
    p.sku = ANY(p_skus)
    AND p.site_id = ANY(p_site_ids)
    AND p.sku IS NOT NULL
  ORDER BY p.sku, s.name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICATION
-- ============================================
-- After running this script, verify functions exist:
--
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN (
--   'get_batch_sales_stats',
--   'get_product_stock_status',
--   'update_customer_history_stats'
-- );
-- ============================================