-- ============================================
-- COMBINED MIGRATION FOR ENHANCED ORDER SYNC
-- Created: 2025-12-25
--
-- Instructions:
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Copy and paste this entire file
-- 4. Click "Run" to execute
-- ============================================

-- ============================================
-- PART 1: EXTEND EXISTING ORDERS TABLE
-- ============================================

-- Add payment information fields
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_ip_address TEXT,
ADD COLUMN IF NOT EXISTS customer_user_agent TEXT,
ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_date_gmt TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_status TEXT,
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS paid_via_credit_card BOOLEAN DEFAULT false;

-- Add order attribution fields (marketing source tracking)
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

-- ============================================
-- PART 2: CREATE RELATED TABLES
-- ============================================

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

-- ============================================
-- PART 3: CREATE INDEXES
-- ============================================

-- Indexes for orders table (new fields)
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
CREATE INDEX IF NOT EXISTS idx_order_notes_note_type ON wc_order_notes(note_type);

-- Indexes for customer history
CREATE INDEX IF NOT EXISTS idx_customer_history_site_email ON wc_customer_history(site_id, customer_email);
CREATE INDEX IF NOT EXISTS idx_customer_history_lifetime_value ON wc_customer_history(lifetime_value DESC);

-- Indexes for order items and products
CREATE INDEX IF NOT EXISTS idx_order_items_sku_lookup ON order_items(sku, order_id) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_sales_analysis ON orders(site_id, date_created, status) WHERE status IN ('completed', 'processing');
CREATE INDEX IF NOT EXISTS idx_products_sku_lookup ON products(sku, site_id) WHERE sku IS NOT NULL;

-- ============================================
-- PART 4: CREATE HELPER FUNCTIONS
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

-- ============================================
-- PART 5: SALES ANALYSIS FUNCTIONS
-- ============================================

-- Drop existing function if exists (to handle parameter changes)
DROP FUNCTION IF EXISTS get_batch_sales_stats(TEXT[], UUID[], INTEGER);

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

-- Drop existing function if exists (to handle parameter changes)
DROP FUNCTION IF EXISTS get_product_stock_status(TEXT[], UUID[]);

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
-- PART 6: CREATE TRIGGERS
-- ============================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to new tables
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

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- After running this migration, your database will have:
-- 1. Extended orders table with payment, attribution, and customer fields
-- 2. New tables for order notes and customer history
-- 3. Functions for sales analysis and customer tracking
-- 4. Optimized indexes for performance
-- ============================================