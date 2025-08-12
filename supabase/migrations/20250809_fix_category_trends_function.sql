-- 修复品类趋势函数，处理 site_id 可能为空的情况
CREATE OR REPLACE FUNCTION get_category_sales_trends(
  p_category TEXT,
  p_site_ids UUID[] DEFAULT NULL,
  p_period TEXT DEFAULT 'day', -- 'day', 'week', 'month'
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  period_date DATE,
  period_label TEXT,
  order_count BIGINT,
  sales_quantity BIGINT,
  revenue DECIMAL(10,2),
  unique_skus BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT 
      CASE 
        WHEN p_period = 'day' THEN date_trunc('day', d)::date
        WHEN p_period = 'week' THEN date_trunc('week', d)::date
        WHEN p_period = 'month' THEN date_trunc('month', d)::date
      END as period_date
    FROM generate_series(
      CURRENT_DATE - INTERVAL '1 day' * p_days_back,
      CURRENT_DATE,
      CASE 
        WHEN p_period = 'day' THEN INTERVAL '1 day'
        WHEN p_period = 'week' THEN INTERVAL '1 week'
        WHEN p_period = 'month' THEN INTERVAL '1 month'
      END
    ) d
  ),
  category_skus AS (
    -- 修复：移除 site_id 条件，因为品类映射可能不区分站点
    SELECT DISTINCT sku
    FROM product_categories
    WHERE category_level1 = p_category
  ),
  sales_data AS (
    SELECT 
      CASE 
        WHEN p_period = 'day' THEN date_trunc('day', o.date_created)::date
        WHEN p_period = 'week' THEN date_trunc('week', o.date_created)::date
        WHEN p_period = 'month' THEN date_trunc('month', o.date_created)::date
      END as period_date,
      COUNT(DISTINCT o.id) as order_count,
      COALESCE(SUM(oi.quantity), 0) as sales_quantity,
      COALESCE(SUM(oi.total), 0)::DECIMAL(10,2) as revenue,
      COUNT(DISTINCT oi.sku) as unique_skus
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    INNER JOIN category_skus cs ON oi.sku = cs.sku
    WHERE 
      o.status IN ('completed', 'processing')
      AND (p_site_ids IS NULL OR o.site_id = ANY(p_site_ids))
      AND o.date_created >= CURRENT_DATE - INTERVAL '1 day' * p_days_back
      AND o.date_created <= CURRENT_DATE
    GROUP BY 1
  )
  SELECT 
    ds.period_date,
    CASE 
      WHEN p_period = 'day' THEN to_char(ds.period_date, 'MM-DD')
      WHEN p_period = 'week' THEN 'W' || to_char(ds.period_date, 'IW')
      WHEN p_period = 'month' THEN to_char(ds.period_date, 'YYYY-MM')
    END as period_label,
    COALESCE(sd.order_count, 0) as order_count,
    COALESCE(sd.sales_quantity, 0) as sales_quantity,
    COALESCE(sd.revenue, 0) as revenue,
    COALESCE(sd.unique_skus, 0) as unique_skus
  FROM date_series ds
  LEFT JOIN sales_data sd ON ds.period_date = sd.period_date
  ORDER BY ds.period_date;
END;
$$ LANGUAGE plpgsql;

-- 同样修复排名函数
CREATE OR REPLACE FUNCTION get_sku_category_rank(
  p_sku TEXT,
  p_category TEXT,
  p_site_ids UUID[] DEFAULT NULL,
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  sku TEXT,
  total_sales BIGINT,
  category_rank INTEGER,
  total_skus_in_category INTEGER,
  percentile DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH category_sales AS (
    SELECT 
      oi.sku,
      COALESCE(SUM(oi.quantity), 0) as total_sales
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    INNER JOIN (
      -- 不过滤 site_id
      SELECT DISTINCT sku 
      FROM product_categories 
      WHERE category_level1 = p_category
    ) pc ON oi.sku = pc.sku
    WHERE 
      o.status IN ('completed', 'processing')
      AND (p_site_ids IS NULL OR o.site_id = ANY(p_site_ids))
      AND o.date_created >= CURRENT_DATE - INTERVAL '1 day' * p_days_back
    GROUP BY oi.sku
  ),
  ranked_sales AS (
    SELECT 
      sku,
      total_sales,
      RANK() OVER (ORDER BY total_sales DESC) as category_rank,
      COUNT(*) OVER () as total_skus
    FROM category_sales
  )
  SELECT 
    rs.sku,
    rs.total_sales,
    rs.category_rank::INTEGER,
    rs.total_skus::INTEGER as total_skus_in_category,
    ROUND((1.0 - (rs.category_rank - 1.0) / NULLIF(rs.total_skus, 0)) * 100, 2) as percentile
  FROM ranked_sales rs
  WHERE rs.sku = p_sku;
END;
$$ LANGUAGE plpgsql;