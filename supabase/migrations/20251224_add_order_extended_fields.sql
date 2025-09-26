-- Add extended order fields for payment, attribution, and customer history
-- Created: 2025-12-24

-- First, check if wc_orders_v2 table exists, if not create it
CREATE TABLE IF NOT EXISTS wc_orders_v2 (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid REFERENCES wc_sites(id) ON DELETE CASCADE,
  order_id bigint NOT NULL,
  order_number text,
  order_key text,
  status text,
  currency text,
  payment_method text,
  payment_method_title text,
  transaction_id text,
  total decimal(10,2),
  subtotal decimal(10,2),
  total_tax decimal(10,2),
  shipping_total decimal(10,2),
  shipping_tax decimal(10,2),
  discount_total decimal(10,2),
  discount_tax decimal(10,2),
  customer_id bigint,
  customer_email text,
  customer_first_name text,
  customer_last_name text,
  customer_company text,
  customer_phone text,
  customer_note text,
  billing_first_name text,
  billing_last_name text,
  billing_company text,
  billing_address_1 text,
  billing_address_2 text,
  billing_city text,
  billing_state text,
  billing_postcode text,
  billing_country text,
  billing_email text,
  billing_phone text,
  shipping_first_name text,
  shipping_last_name text,
  shipping_company text,
  shipping_address_1 text,
  shipping_address_2 text,
  shipping_city text,
  shipping_state text,
  shipping_postcode text,
  shipping_country text,
  date_created timestamptz,
  date_modified timestamptz,
  date_completed timestamptz,
  date_paid timestamptz,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(site_id, order_id)
);

-- Add payment information fields
ALTER TABLE wc_orders_v2
ADD COLUMN IF NOT EXISTS payment_date timestamptz,
ADD COLUMN IF NOT EXISTS payment_date_gmt timestamptz,
ADD COLUMN IF NOT EXISTS payment_status text,
ADD COLUMN IF NOT EXISTS payment_url text,
ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS paid_via_credit_card boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS customer_ip_address text,
ADD COLUMN IF NOT EXISTS customer_user_agent text;

-- Add order attribution fields
ALTER TABLE wc_orders_v2
ADD COLUMN IF NOT EXISTS attribution_origin text,
ADD COLUMN IF NOT EXISTS attribution_source_type text,
ADD COLUMN IF NOT EXISTS attribution_source text,
ADD COLUMN IF NOT EXISTS attribution_medium text,
ADD COLUMN IF NOT EXISTS attribution_campaign text,
ADD COLUMN IF NOT EXISTS attribution_device_type text,
ADD COLUMN IF NOT EXISTS attribution_session_page_views integer,
ADD COLUMN IF NOT EXISTS attribution_utm_source text,
ADD COLUMN IF NOT EXISTS attribution_utm_medium text,
ADD COLUMN IF NOT EXISTS attribution_utm_campaign text,
ADD COLUMN IF NOT EXISTS attribution_utm_content text,
ADD COLUMN IF NOT EXISTS attribution_utm_term text,
ADD COLUMN IF NOT EXISTS attribution_referrer text;

-- Add customer history fields
ALTER TABLE wc_orders_v2
ADD COLUMN IF NOT EXISTS customer_total_orders integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS customer_total_revenue decimal(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS customer_average_order_value decimal(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS customer_first_order_date timestamptz,
ADD COLUMN IF NOT EXISTS customer_last_order_date timestamptz,
ADD COLUMN IF NOT EXISTS is_returning_customer boolean DEFAULT false;

-- Add meta data and raw data fields
ALTER TABLE wc_orders_v2
ADD COLUMN IF NOT EXISTS meta_data jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS raw_data jsonb DEFAULT '{}';

-- Create order notes table
CREATE TABLE IF NOT EXISTS wc_order_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid REFERENCES wc_sites(id) ON DELETE CASCADE,
  order_id bigint NOT NULL,
  note_id bigint,
  note text,
  note_type text, -- 'customer' or 'private'
  customer_note boolean DEFAULT false,
  added_by text,
  date_created timestamptz,
  created_at timestamptz DEFAULT NOW(),
  UNIQUE(site_id, order_id, note_id)
);

-- Create order line items table if not exists
CREATE TABLE IF NOT EXISTS wc_order_items_v2 (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid REFERENCES wc_sites(id) ON DELETE CASCADE,
  order_id bigint NOT NULL,
  item_id bigint,
  product_id bigint,
  variation_id bigint,
  name text,
  sku text,
  quantity integer,
  price decimal(10,2),
  subtotal decimal(10,2),
  subtotal_tax decimal(10,2),
  total decimal(10,2),
  total_tax decimal(10,2),
  tax_class text,
  meta_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(site_id, order_id, item_id)
);

-- Create customer history tracking table
CREATE TABLE IF NOT EXISTS wc_customer_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid REFERENCES wc_sites(id) ON DELETE CASCADE,
  customer_id bigint,
  customer_email text,
  total_orders integer DEFAULT 0,
  total_revenue decimal(10,2) DEFAULT 0,
  average_order_value decimal(10,2) DEFAULT 0,
  first_order_date timestamptz,
  last_order_date timestamptz,
  lifetime_value decimal(10,2) DEFAULT 0,
  preferred_payment_method text,
  preferred_category text,
  tags text[],
  notes text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(site_id, customer_email)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wc_orders_v2_site_id ON wc_orders_v2(site_id);
CREATE INDEX IF NOT EXISTS idx_wc_orders_v2_order_id ON wc_orders_v2(order_id);
CREATE INDEX IF NOT EXISTS idx_wc_orders_v2_customer_email ON wc_orders_v2(customer_email);
CREATE INDEX IF NOT EXISTS idx_wc_orders_v2_date_created ON wc_orders_v2(date_created);
CREATE INDEX IF NOT EXISTS idx_wc_orders_v2_date_paid ON wc_orders_v2(date_paid);
CREATE INDEX IF NOT EXISTS idx_wc_orders_v2_status ON wc_orders_v2(status);
CREATE INDEX IF NOT EXISTS idx_wc_orders_v2_payment_method ON wc_orders_v2(payment_method);
CREATE INDEX IF NOT EXISTS idx_wc_orders_v2_attribution ON wc_orders_v2(attribution_source, attribution_medium);

CREATE INDEX IF NOT EXISTS idx_wc_order_notes_site_order ON wc_order_notes(site_id, order_id);
CREATE INDEX IF NOT EXISTS idx_wc_order_items_v2_site_order ON wc_order_items_v2(site_id, order_id);
CREATE INDEX IF NOT EXISTS idx_wc_order_items_v2_sku ON wc_order_items_v2(sku);
CREATE INDEX IF NOT EXISTS idx_wc_customer_history_site_email ON wc_customer_history(site_id, customer_email);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables
DROP TRIGGER IF EXISTS update_wc_orders_v2_updated_at ON wc_orders_v2;
CREATE TRIGGER update_wc_orders_v2_updated_at
  BEFORE UPDATE ON wc_orders_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wc_order_items_v2_updated_at ON wc_order_items_v2;
CREATE TRIGGER update_wc_order_items_v2_updated_at
  BEFORE UPDATE ON wc_order_items_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wc_customer_history_updated_at ON wc_customer_history;
CREATE TRIGGER update_wc_customer_history_updated_at
  BEFORE UPDATE ON wc_customer_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE wc_orders_v2 IS 'Extended WooCommerce orders with payment, attribution and customer data';
COMMENT ON TABLE wc_order_notes IS 'Order notes and comments from WooCommerce';
COMMENT ON TABLE wc_order_items_v2 IS 'Order line items with product details';
COMMENT ON TABLE wc_customer_history IS 'Customer purchase history and analytics';

COMMENT ON COLUMN wc_orders_v2.attribution_origin IS 'Order origin like Organic: Google';
COMMENT ON COLUMN wc_orders_v2.attribution_source_type IS 'Source type like organic, paid, direct';
COMMENT ON COLUMN wc_orders_v2.attribution_device_type IS 'Device type like Mobile, Desktop, Tablet';
COMMENT ON COLUMN wc_orders_v2.customer_total_orders IS 'Total orders by this customer';
COMMENT ON COLUMN wc_orders_v2.customer_average_order_value IS 'Customer average order value';
COMMENT ON COLUMN wc_orders_v2.meta_data IS 'Additional order metadata from WooCommerce';
COMMENT ON COLUMN wc_orders_v2.raw_data IS 'Complete raw order data from WooCommerce API';