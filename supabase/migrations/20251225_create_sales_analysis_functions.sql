-- Create database functions for sales analysis
-- Created: 2025-12-25

-- ============================================
-- 1. BATCH SALES STATS FUNCTION
-- ============================================

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

-- ============================================
-- 2. PRODUCT STOCK STATUS FUNCTION
-- ============================================

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
-- 3. SALES TRENDS FUNCTION
-- ============================================

-- Function to get sales trends over time
CREATE OR REPLACE FUNCTION get_sales_trends(
  p_site_ids UUID[],
  p_days_back INTEGER DEFAULT 30,
  p_group_by TEXT DEFAULT 'day' -- 'day', 'week', 'month'
)
RETURNS TABLE (
  period_date DATE,
  site_id UUID,
  site_name TEXT,
  order_count BIGINT,
  items_sold BIGINT,
  total_revenue DECIMAL(10,2),
  unique_skus BIGINT,
  unique_customers BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC(p_group_by, o.date_created)::DATE as period_date,
    o.site_id,
    s.name::TEXT as site_name,
    COUNT(DISTINCT o.id)::BIGINT as order_count,
    SUM(oi.quantity)::BIGINT as items_sold,
    SUM(o.total)::DECIMAL(10,2) as total_revenue,
    COUNT(DISTINCT oi.sku)::BIGINT as unique_skus,
    COUNT(DISTINCT o.customer_email)::BIGINT as unique_customers
  FROM orders o
  INNER JOIN order_items oi ON oi.order_id = o.id
  INNER JOIN wc_sites s ON s.id = o.site_id
  WHERE
    o.site_id = ANY(p_site_ids)
    AND o.date_created >= NOW() - INTERVAL '1 day' * p_days_back
    AND o.status IN ('completed', 'processing')
  GROUP BY DATE_TRUNC(p_group_by, o.date_created), o.site_id, s.name
  ORDER BY period_date DESC, site_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. TOP SELLING PRODUCTS FUNCTION
-- ============================================

-- Function to get top selling products
CREATE OR REPLACE FUNCTION get_top_selling_products(
  p_site_ids UUID[],
  p_days_back INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  sku TEXT,
  product_name TEXT,
  site_id UUID,
  site_name TEXT,
  quantity_sold BIGINT,
  order_count BIGINT,
  total_revenue DECIMAL(10,2),
  avg_price DECIMAL(10,2),
  last_sold TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oi.sku::TEXT,
    MAX(oi.name)::TEXT as product_name,
    o.site_id,
    s.name::TEXT as site_name,
    SUM(oi.quantity)::BIGINT as quantity_sold,
    COUNT(DISTINCT o.id)::BIGINT as order_count,
    SUM(oi.total)::DECIMAL(10,2) as total_revenue,
    AVG(oi.price)::DECIMAL(10,2) as avg_price,
    MAX(o.date_created) as last_sold
  FROM orders o
  INNER JOIN order_items oi ON oi.order_id = o.id
  INNER JOIN wc_sites s ON s.id = o.site_id
  WHERE
    o.site_id = ANY(p_site_ids)
    AND o.date_created >= NOW() - INTERVAL '1 day' * p_days_back
    AND o.status IN ('completed', 'processing')
    AND oi.sku IS NOT NULL
  GROUP BY oi.sku, o.site_id, s.name
  ORDER BY quantity_sold DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. CUSTOMER PURCHASE PATTERNS FUNCTION
-- ============================================

-- Function to analyze customer purchase patterns
CREATE OR REPLACE FUNCTION get_customer_purchase_patterns(
  p_site_ids UUID[],
  p_customer_email TEXT DEFAULT NULL
)
RETURNS TABLE (
  customer_email TEXT,
  site_id UUID,
  site_name TEXT,
  total_orders BIGINT,
  total_spent DECIMAL(10,2),
  avg_order_value DECIMAL(10,2),
  first_purchase TIMESTAMPTZ,
  last_purchase TIMESTAMPTZ,
  days_as_customer INTEGER,
  preferred_payment TEXT,
  most_purchased_sku TEXT,
  is_returning BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH customer_stats AS (
    SELECT
      o.customer_email,
      o.site_id,
      s.name as site_name,
      COUNT(DISTINCT o.id) as order_count,
      SUM(o.total) as total_amount,
      AVG(o.total) as avg_amount,
      MIN(o.date_created) as first_order,
      MAX(o.date_created) as last_order,
      MODE() WITHIN GROUP (ORDER BY o.payment_method) as preferred_payment_method
    FROM orders o
    INNER JOIN wc_sites s ON s.id = o.site_id
    WHERE
      o.site_id = ANY(p_site_ids)
      AND o.status IN ('completed', 'processing')
      AND (p_customer_email IS NULL OR o.customer_email = p_customer_email)
    GROUP BY o.customer_email, o.site_id, s.name
  ),
  top_skus AS (
    SELECT DISTINCT ON (o.customer_email, o.site_id)
      o.customer_email,
      o.site_id,
      oi.sku as top_sku
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    WHERE
      o.site_id = ANY(p_site_ids)
      AND o.status IN ('completed', 'processing')
      AND oi.sku IS NOT NULL
      AND (p_customer_email IS NULL OR o.customer_email = p_customer_email)
    GROUP BY o.customer_email, o.site_id, oi.sku
    ORDER BY o.customer_email, o.site_id, COUNT(*) DESC
  )
  SELECT
    cs.customer_email::TEXT,
    cs.site_id,
    cs.site_name::TEXT,
    cs.order_count::BIGINT,
    cs.total_amount::DECIMAL(10,2),
    cs.avg_amount::DECIMAL(10,2),
    cs.first_order,
    cs.last_order,
    EXTRACT(DAY FROM (cs.last_order - cs.first_order))::INTEGER as days_as_customer,
    cs.preferred_payment_method::TEXT,
    ts.top_sku::TEXT,
    (cs.order_count > 1) as is_returning
  FROM customer_stats cs
  LEFT JOIN top_skus ts ON ts.customer_email = cs.customer_email AND ts.site_id = cs.site_id
  ORDER BY cs.total_amount DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. ATTRIBUTION ANALYTICS FUNCTION
-- ============================================

-- Function to analyze order attribution
CREATE OR REPLACE FUNCTION get_attribution_analytics(
  p_site_ids UUID[],
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  site_id UUID,
  site_name TEXT,
  source_type TEXT,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  device_type TEXT,
  order_count BIGINT,
  total_revenue DECIMAL(10,2),
  avg_order_value DECIMAL(10,2),
  conversion_value DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.site_id,
    s.name::TEXT as site_name,
    COALESCE(o.attribution_source_type, 'direct')::TEXT as source_type,
    COALESCE(o.attribution_source, 'unknown')::TEXT as source,
    COALESCE(o.attribution_medium, 'none')::TEXT as medium,
    COALESCE(o.attribution_campaign, 'none')::TEXT as campaign,
    COALESCE(o.attribution_device_type, 'unknown')::TEXT as device_type,
    COUNT(*)::BIGINT as order_count,
    SUM(o.total)::DECIMAL(10,2) as total_revenue,
    AVG(o.total)::DECIMAL(10,2) as avg_order_value,
    (SUM(o.total) / NULLIF(COUNT(*), 0))::DECIMAL(10,2) as conversion_value
  FROM orders o
  INNER JOIN wc_sites s ON s.id = o.site_id
  WHERE
    o.site_id = ANY(p_site_ids)
    AND o.date_created >= NOW() - INTERVAL '1 day' * p_days_back
    AND o.status IN ('completed', 'processing')
  GROUP BY
    o.site_id,
    s.name,
    o.attribution_source_type,
    o.attribution_source,
    o.attribution_medium,
    o.attribution_campaign,
    o.attribution_device_type
  ORDER BY total_revenue DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Create indexes to support these functions
CREATE INDEX IF NOT EXISTS idx_order_items_sku_lookup
  ON order_items(sku, order_id)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_sales_analysis
  ON orders(site_id, date_created, status)
  WHERE status IN ('completed', 'processing');

CREATE INDEX IF NOT EXISTS idx_orders_customer_analysis
  ON orders(customer_email, site_id, date_created)
  WHERE status IN ('completed', 'processing');

CREATE INDEX IF NOT EXISTS idx_products_sku_lookup
  ON products(sku, site_id)
  WHERE sku IS NOT NULL;

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

-- Grant execute permissions on functions (adjust role names as needed)
-- GRANT EXECUTE ON FUNCTION get_batch_sales_stats TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_product_stock_status TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_sales_trends TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_top_selling_products TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_customer_purchase_patterns TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_attribution_analytics TO authenticated;

-- ============================================
-- 9. ADD COMMENTS
-- ============================================

COMMENT ON FUNCTION get_batch_sales_stats IS 'Get sales statistics for a batch of SKUs across multiple sites';
COMMENT ON FUNCTION get_product_stock_status IS 'Get current stock status for products by SKU';
COMMENT ON FUNCTION get_sales_trends IS 'Get sales trends over time grouped by day/week/month';
COMMENT ON FUNCTION get_top_selling_products IS 'Get top selling products by quantity sold';
COMMENT ON FUNCTION get_customer_purchase_patterns IS 'Analyze customer purchase patterns and lifetime value';
COMMENT ON FUNCTION get_attribution_analytics IS 'Analyze order attribution and marketing effectiveness';