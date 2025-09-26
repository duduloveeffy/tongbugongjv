-- Extend existing orders table with payment, attribution, and customer history fields
-- Created: 2025-12-25

-- ============================================
-- 1. EXTEND EXISTING ORDERS TABLE
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
-- 2. CREATE RELATED TABLES
-- ============================================

-- Create order notes table (one-to-many relationship with orders)
CREATE TABLE IF NOT EXISTS wc_order_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  wc_order_id BIGINT NOT NULL, -- WooCommerce order ID for reference
  note_id BIGINT, -- WooCommerce note ID
  note TEXT NOT NULL,
  note_type TEXT DEFAULT 'private', -- 'customer' or 'private'
  customer_note BOOLEAN DEFAULT false,
  added_by TEXT,
  added_by_user_id BIGINT,
  date_created TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, wc_order_id, note_id)
);

-- Create customer history summary table (maintains customer statistics)
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

-- Create order attribution summary table (for analytics)
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
-- 3. CREATE INDEXES FOR PERFORMANCE
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
CREATE INDEX IF NOT EXISTS idx_order_notes_date_created ON wc_order_notes(date_created);

-- Indexes for customer history
CREATE INDEX IF NOT EXISTS idx_customer_history_site_email ON wc_customer_history(site_id, customer_email);
CREATE INDEX IF NOT EXISTS idx_customer_history_customer_id ON wc_customer_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_history_lifetime_value ON wc_customer_history(lifetime_value DESC);
CREATE INDEX IF NOT EXISTS idx_customer_history_last_order ON wc_customer_history(last_order_date DESC);

-- Indexes for attribution summary
CREATE INDEX IF NOT EXISTS idx_attribution_summary_site_period ON wc_order_attribution_summary(site_id, period_date);
CREATE INDEX IF NOT EXISTS idx_attribution_summary_source ON wc_order_attribution_summary(source_type, source);

-- ============================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================

-- Function to update customer history based on orders
CREATE OR REPLACE FUNCTION update_customer_history_stats(
  p_site_id UUID,
  p_customer_email TEXT
) RETURNS VOID AS $$
DECLARE
  v_stats RECORD;
BEGIN
  -- Calculate customer statistics from orders
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

  -- Upsert customer history
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

  -- Update returning customer flag in orders
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

-- Function to extract attribution data from meta_data JSON
CREATE OR REPLACE FUNCTION extract_attribution_from_meta(meta_data JSONB)
RETURNS TABLE (
  origin TEXT,
  source_type TEXT,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  device_type TEXT,
  session_page_views INTEGER,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referrer TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(
      meta_data->>'_wc_order_attribution_origin',
      meta_data->>'origin',
      CASE
        WHEN meta_data->>'_wc_order_attribution_source_type' = 'organic'
          THEN 'Organic: ' || COALESCE(meta_data->>'_wc_order_attribution_source', 'Unknown')
        WHEN meta_data->>'_wc_order_attribution_source_type' = 'paid'
          THEN 'Paid: ' || COALESCE(meta_data->>'_wc_order_attribution_source', 'Unknown')
        ELSE NULL
      END
    )::TEXT as origin,
    (meta_data->>'_wc_order_attribution_source_type')::TEXT as source_type,
    (meta_data->>'_wc_order_attribution_source')::TEXT as source,
    (meta_data->>'_wc_order_attribution_medium')::TEXT as medium,
    (meta_data->>'_wc_order_attribution_campaign')::TEXT as campaign,
    (meta_data->>'_wc_order_attribution_device_type')::TEXT as device_type,
    (meta_data->>'_wc_order_attribution_session_pages')::INTEGER as session_page_views,
    COALESCE(meta_data->>'_wc_order_attribution_utm_source', meta_data->>'utm_source')::TEXT as utm_source,
    COALESCE(meta_data->>'_wc_order_attribution_utm_medium', meta_data->>'utm_medium')::TEXT as utm_medium,
    COALESCE(meta_data->>'_wc_order_attribution_utm_campaign', meta_data->>'utm_campaign')::TEXT as utm_campaign,
    COALESCE(meta_data->>'_wc_order_attribution_utm_content', meta_data->>'utm_content')::TEXT as utm_content,
    COALESCE(meta_data->>'_wc_order_attribution_utm_term', meta_data->>'utm_term')::TEXT as utm_term,
    (meta_data->>'_wc_order_attribution_referrer')::TEXT as referrer;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. CREATE TRIGGERS
-- ============================================

-- Trigger to update timestamps
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

DROP TRIGGER IF EXISTS update_wc_order_attribution_summary_updated_at ON wc_order_attribution_summary;
CREATE TRIGGER update_wc_order_attribution_summary_updated_at
  BEFORE UPDATE ON wc_order_attribution_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. ADD COMMENTS FOR DOCUMENTATION
-- ============================================

-- Comments on new columns
COMMENT ON COLUMN orders.attribution_origin IS 'Order origin like Organic: Google, Paid: Facebook';
COMMENT ON COLUMN orders.attribution_source_type IS 'Source type: organic, paid, direct, referral';
COMMENT ON COLUMN orders.attribution_device_type IS 'Device type: Mobile, Desktop, Tablet';
COMMENT ON COLUMN orders.customer_order_count IS 'Total orders by this customer at time of order';
COMMENT ON COLUMN orders.customer_lifetime_value IS 'Customer total spending at time of order';
COMMENT ON COLUMN orders.is_returning_customer IS 'Whether customer has previous orders';

-- Comments on tables
COMMENT ON TABLE wc_order_notes IS 'Order notes and comments from WooCommerce';
COMMENT ON TABLE wc_customer_history IS 'Customer purchase history and lifetime value tracking';
COMMENT ON TABLE wc_order_attribution_summary IS 'Aggregated order attribution data for analytics';

-- Comments on functions
COMMENT ON FUNCTION update_customer_history_stats IS 'Updates customer history statistics based on order data';
COMMENT ON FUNCTION extract_attribution_from_meta IS 'Extracts WooCommerce order attribution data from meta_data JSON';