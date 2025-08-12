-- ================================================
-- WooCommerce Multi-site Complete Data Sync Schema V2
-- ================================================
-- This schema stores complete order and product data
-- with incremental sync support for better performance

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- CORE TABLES
-- ================================================

-- 1. Orders Table (Complete order data)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL,
  order_number TEXT,
  order_key TEXT,
  
  -- Order Status and Type
  status TEXT NOT NULL,
  currency TEXT DEFAULT 'USD',
  payment_method TEXT,
  payment_method_title TEXT,
  transaction_id TEXT,
  
  -- Pricing
  total DECIMAL(10,2),
  subtotal DECIMAL(10,2),
  total_tax DECIMAL(10,2),
  shipping_total DECIMAL(10,2),
  shipping_tax DECIMAL(10,2),
  discount_total DECIMAL(10,2),
  discount_tax DECIMAL(10,2),
  
  -- Customer Information
  customer_id INTEGER,
  customer_email TEXT,
  customer_first_name TEXT,
  customer_last_name TEXT,
  customer_company TEXT,
  customer_phone TEXT,
  customer_note TEXT,
  
  -- Billing Address
  billing_first_name TEXT,
  billing_last_name TEXT,
  billing_company TEXT,
  billing_address_1 TEXT,
  billing_address_2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_postcode TEXT,
  billing_country TEXT,
  billing_email TEXT,
  billing_phone TEXT,
  
  -- Shipping Address
  shipping_first_name TEXT,
  shipping_last_name TEXT,
  shipping_company TEXT,
  shipping_address_1 TEXT,
  shipping_address_2 TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_postcode TEXT,
  shipping_country TEXT,
  shipping_method TEXT,
  
  -- Dates
  date_created TIMESTAMP WITH TIME ZONE NOT NULL,
  date_modified TIMESTAMP WITH TIME ZONE,
  date_completed TIMESTAMP WITH TIME ZONE,
  date_paid TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  meta_data JSONB,
  refunds JSONB,
  
  -- Sync Information
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(site_id, order_id)
);

-- 2. Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  item_type TEXT DEFAULT 'line_item', -- line_item, shipping, fee, coupon, tax
  
  -- Product Information
  product_id INTEGER,
  variation_id INTEGER,
  sku TEXT,
  name TEXT,
  quantity INTEGER DEFAULT 1,
  
  -- Pricing
  price DECIMAL(10,2),
  subtotal DECIMAL(10,2),
  subtotal_tax DECIMAL(10,2),
  total DECIMAL(10,2),
  total_tax DECIMAL(10,2),
  
  -- Tax
  tax_class TEXT,
  taxes JSONB,
  
  -- Meta Data
  meta_data JSONB,
  
  -- Constraints
  UNIQUE(order_id, item_id)
);

-- 3. Products Table (Complete product data)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  
  -- Basic Information
  sku TEXT,
  name TEXT NOT NULL,
  slug TEXT,
  permalink TEXT,
  type TEXT DEFAULT 'simple', -- simple, variable, grouped, external
  status TEXT DEFAULT 'publish', -- publish, draft, pending, private
  featured BOOLEAN DEFAULT false,
  catalog_visibility TEXT DEFAULT 'visible', -- visible, catalog, search, hidden
  
  -- Description
  description TEXT,
  short_description TEXT,
  
  -- Pricing
  price DECIMAL(10,2),
  regular_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  date_on_sale_from TIMESTAMP WITH TIME ZONE,
  date_on_sale_to TIMESTAMP WITH TIME ZONE,
  tax_status TEXT DEFAULT 'taxable', -- taxable, shipping, none
  tax_class TEXT,
  
  -- Inventory
  manage_stock BOOLEAN DEFAULT false,
  stock_quantity INTEGER,
  stock_status TEXT DEFAULT 'instock', -- instock, outofstock, onbackorder
  backorders TEXT DEFAULT 'no', -- no, notify, yes
  low_stock_amount INTEGER,
  sold_individually BOOLEAN DEFAULT false,
  
  -- Shipping
  weight TEXT,
  length TEXT,
  width TEXT,
  height TEXT,
  shipping_class TEXT,
  
  -- Linked Products
  upsell_ids INTEGER[],
  cross_sell_ids INTEGER[],
  parent_id INTEGER,
  
  -- Categories and Tags
  categories JSONB,
  tags JSONB,
  
  -- Attributes and Variations
  attributes JSONB,
  default_attributes JSONB,
  variations INTEGER[],
  
  -- Images
  images JSONB,
  
  -- Downloads (for digital products)
  downloadable BOOLEAN DEFAULT false,
  downloads JSONB,
  download_limit INTEGER DEFAULT -1,
  download_expiry INTEGER DEFAULT -1,
  
  -- External Product
  external_url TEXT,
  button_text TEXT,
  
  -- SEO
  meta_title TEXT,
  meta_description TEXT,
  
  -- Reviews
  reviews_allowed BOOLEAN DEFAULT true,
  average_rating DECIMAL(3,2),
  rating_count INTEGER DEFAULT 0,
  
  -- Timestamps
  date_created TIMESTAMP WITH TIME ZONE,
  date_modified TIMESTAMP WITH TIME ZONE,
  date_on_sale_from_gmt TIMESTAMP WITH TIME ZONE,
  date_on_sale_to_gmt TIMESTAMP WITH TIME ZONE,
  
  -- Sync Information
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(site_id, product_id)
);

-- 4. Product Variations Table
CREATE TABLE IF NOT EXISTS product_variations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variation_id INTEGER NOT NULL,
  
  -- Basic Information
  sku TEXT,
  status TEXT DEFAULT 'publish',
  
  -- Pricing
  price DECIMAL(10,2),
  regular_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  date_on_sale_from TIMESTAMP WITH TIME ZONE,
  date_on_sale_to TIMESTAMP WITH TIME ZONE,
  
  -- Inventory
  manage_stock BOOLEAN DEFAULT false,
  stock_quantity INTEGER,
  stock_status TEXT DEFAULT 'instock',
  backorders TEXT DEFAULT 'no',
  
  -- Shipping
  weight TEXT,
  length TEXT,
  width TEXT,
  height TEXT,
  shipping_class TEXT,
  
  -- Downloads
  downloadable BOOLEAN DEFAULT false,
  downloads JSONB,
  download_limit INTEGER DEFAULT -1,
  download_expiry INTEGER DEFAULT -1,
  
  -- Attributes
  attributes JSONB,
  
  -- Image
  image JSONB,
  
  -- Meta
  meta_data JSONB,
  
  -- Timestamps
  date_created TIMESTAMP WITH TIME ZONE,
  date_modified TIMESTAMP WITH TIME ZONE,
  
  -- Sync Information
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(product_id, variation_id)
);

-- ================================================
-- SYNC TRACKING TABLES
-- ================================================

-- 5. Sync Checkpoints V2 (For incremental sync)
CREATE TABLE IF NOT EXISTS sync_checkpoints_v2 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- 'orders', 'products'
  
  -- Order Sync Checkpoint
  last_order_id INTEGER,
  last_order_modified TIMESTAMP WITH TIME ZONE,
  orders_synced_count INTEGER DEFAULT 0,
  
  -- Product Sync Checkpoint
  last_product_id INTEGER,
  last_product_modified TIMESTAMP WITH TIME ZONE,
  products_synced_count INTEGER DEFAULT 0,
  
  -- Sync Statistics
  last_sync_started_at TIMESTAMP WITH TIME ZONE,
  last_sync_completed_at TIMESTAMP WITH TIME ZONE,
  last_sync_duration_ms INTEGER,
  last_sync_status TEXT, -- 'success', 'partial', 'failed'
  last_error_message TEXT,
  
  -- Constraints
  UNIQUE(site_id, sync_type)
);

-- 6. Sync Logs (Detailed sync history)
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  sync_mode TEXT NOT NULL, -- 'full', 'incremental'
  
  -- Sync Status
  status TEXT NOT NULL, -- 'started', 'in_progress', 'completed', 'failed'
  
  -- Sync Statistics
  items_to_sync INTEGER,
  items_synced INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  items_skipped INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  
  -- Error Handling
  error_message TEXT,
  error_details JSONB,
  
  -- Progress Tracking
  progress_percentage INTEGER DEFAULT 0,
  current_page INTEGER DEFAULT 1,
  total_pages INTEGER
);

-- ================================================
-- INDEXES FOR PERFORMANCE
-- ================================================

-- Orders Indexes
CREATE INDEX IF NOT EXISTS idx_orders_site_id ON orders(site_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date_created ON orders(date_created);
CREATE INDEX IF NOT EXISTS idx_orders_date_modified ON orders(date_modified);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);

-- Order Items Indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Products Indexes
CREATE INDEX IF NOT EXISTS idx_products_site_id ON products(site_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_stock_status ON products(stock_status);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_date_modified ON products(date_modified);

-- Product Variations Indexes
CREATE INDEX IF NOT EXISTS idx_variations_product_id ON product_variations(product_id);
CREATE INDEX IF NOT EXISTS idx_variations_sku ON product_variations(sku);

-- Sync Logs Indexes
CREATE INDEX IF NOT EXISTS idx_sync_logs_site_id ON sync_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type ON sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);

-- ================================================
-- FUNCTIONS FOR SALES ANALYTICS
-- ================================================

-- Function to get SKU sales statistics
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
  total_revenue DECIMAL,
  avg_price DECIMAL,
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

-- Function to get sales statistics for multiple SKUs
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
  total_revenue DECIMAL,
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
    AND o.date_created >= CURRENT_DATE - INTERVAL '1 year' -- Limit to 1 year for performance
  GROUP BY oi.sku, s.id, s.name
  ORDER BY oi.sku, s.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get product current stock status
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
  price DECIMAL,
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

-- ================================================
-- TRIGGERS
-- ================================================

-- Trigger to update sync checkpoint after order insert/update
CREATE OR REPLACE FUNCTION update_order_checkpoint()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sync_checkpoints_v2
  SET 
    last_order_id = NEW.order_id,
    last_order_modified = NEW.date_modified,
    orders_synced_count = orders_synced_count + 1
  WHERE 
    site_id = NEW.site_id 
    AND sync_type = 'orders'
    AND (last_order_modified IS NULL OR last_order_modified < NEW.date_modified);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_order_checkpoint_trigger ON orders;
CREATE TRIGGER update_order_checkpoint_trigger
AFTER INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_order_checkpoint();

-- Trigger to update sync checkpoint after product insert/update
CREATE OR REPLACE FUNCTION update_product_checkpoint()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sync_checkpoints_v2
  SET 
    last_product_id = NEW.product_id,
    last_product_modified = NEW.date_modified,
    products_synced_count = products_synced_count + 1
  WHERE 
    site_id = NEW.site_id 
    AND sync_type = 'products'
    AND (last_product_modified IS NULL OR last_product_modified < NEW.date_modified);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_product_checkpoint_trigger ON products;
CREATE TRIGGER update_product_checkpoint_trigger
AFTER INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_product_checkpoint();

-- ================================================
-- VIEWS FOR EASY QUERYING
-- ================================================

-- View for recent orders
CREATE OR REPLACE VIEW recent_orders AS
SELECT 
  o.*,
  s.name as site_name,
  COUNT(oi.id) as item_count
FROM orders o
INNER JOIN wc_sites s ON o.site_id = s.id
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.date_created >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY o.id, s.name;

-- View for low stock products
CREATE OR REPLACE VIEW low_stock_products AS
SELECT 
  p.*,
  s.name as site_name
FROM products p
INNER JOIN wc_sites s ON p.site_id = s.id
WHERE 
  p.manage_stock = true 
  AND p.stock_quantity <= COALESCE(p.low_stock_amount, 5)
  AND p.status = 'publish';

-- ================================================
-- WEBHOOK TABLES
-- ================================================

-- 7. Webhook Endpoints Configuration
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  endpoint_type TEXT NOT NULL DEFAULT 'realtime', -- 'realtime', 'batch'
  webhook_url TEXT NOT NULL,
  secret_key TEXT,
  enabled BOOLEAN DEFAULT true,
  events JSONB DEFAULT '[]', -- Array of enabled events
  last_test_at TIMESTAMP WITH TIME ZONE,
  last_test_status TEXT, -- 'success', 'failed'
  last_test_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(site_id, endpoint_type)
);

-- 8. Webhook Events Log
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  object_id INTEGER, -- Can be null for batch events
  object_type TEXT NOT NULL, -- 'order', 'product', 'batch', 'test'
  processing_time_ms INTEGER,
  status TEXT NOT NULL, -- 'success', 'error', 'partial'
  error_message TEXT,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB, -- Additional event data
  
  -- Indexes for performance
  INDEX (site_id),
  INDEX (event_type),
  INDEX (received_at),
  INDEX (status)
);

-- 9. Webhook Queue (for failed webhook retries)
CREATE TABLE IF NOT EXISTS webhook_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  endpoint_url TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes
  INDEX (site_id),
  INDEX (status),
  INDEX (scheduled_at),
  INDEX (event_type)
);

-- ================================================
-- WEBHOOK INDEXES
-- ================================================

-- Webhook Endpoints Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_site_id ON webhook_endpoints(site_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_enabled ON webhook_endpoints(enabled);

-- Webhook Events Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_site_id ON webhook_events(site_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);

-- Webhook Queue Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_queue_site_id ON webhook_queue(site_id);
CREATE INDEX IF NOT EXISTS idx_webhook_queue_status ON webhook_queue(status);
CREATE INDEX IF NOT EXISTS idx_webhook_queue_scheduled ON webhook_queue(scheduled_at);

-- ================================================
-- WEBHOOK FUNCTIONS
-- ================================================

-- Function to get webhook statistics
CREATE OR REPLACE FUNCTION get_webhook_stats(
  p_site_id UUID,
  p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_events BIGINT,
  successful_events BIGINT,
  failed_events BIGINT,
  avg_processing_time DECIMAL,
  success_rate DECIMAL,
  most_common_event TEXT,
  last_event_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  WITH event_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as successful,
      COUNT(*) FILTER (WHERE status = 'error') as failed,
      AVG(processing_time_ms) as avg_time,
      MAX(received_at) as last_event
    FROM webhook_events
    WHERE site_id = p_site_id
      AND received_at >= CURRENT_DATE - INTERVAL '%d days' day
  ),
  common_event AS (
    SELECT event_type
    FROM webhook_events
    WHERE site_id = p_site_id
      AND received_at >= CURRENT_DATE - INTERVAL '%d days' day
    GROUP BY event_type
    ORDER BY COUNT(*) DESC
    LIMIT 1
  )
  SELECT 
    es.total,
    es.successful,
    es.failed,
    ROUND(es.avg_time::decimal, 2),
    CASE WHEN es.total > 0 THEN ROUND((es.successful::decimal / es.total::decimal) * 100, 2) ELSE 0 END,
    ce.event_type,
    es.last_event
  FROM event_stats es
  CROSS JOIN common_event ce;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old webhook logs
CREATE OR REPLACE FUNCTION cleanup_webhook_logs(
  p_days_to_keep INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete old webhook events
  DELETE FROM webhook_events
  WHERE received_at < CURRENT_DATE - INTERVAL '%d days' day;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Delete old completed webhook queue items
  DELETE FROM webhook_queue
  WHERE status IN ('completed', 'failed')
    AND created_at < CURRENT_DATE - INTERVAL '%d days' day;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- WEBHOOK TRIGGERS
-- ================================================

-- Trigger to update updated_at on webhook endpoints
CREATE OR REPLACE FUNCTION update_webhook_endpoint_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_webhook_endpoints_timestamp ON webhook_endpoints;
CREATE TRIGGER update_webhook_endpoints_timestamp
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_endpoint_timestamp();

-- ================================================
-- WEBHOOK VIEWS
-- ================================================

-- View for webhook endpoint status
CREATE OR REPLACE VIEW webhook_endpoint_status AS
SELECT 
  we.id,
  we.site_id,
  s.name as site_name,
  we.endpoint_type,
  we.webhook_url,
  we.enabled,
  we.last_test_at,
  we.last_test_status,
  we.created_at,
  we.updated_at,
  -- Recent activity stats
  COUNT(wev.id) FILTER (WHERE wev.received_at >= NOW() - INTERVAL '24 hours') as events_last_24h,
  COUNT(wev.id) FILTER (WHERE wev.received_at >= NOW() - INTERVAL '24 hours' AND wev.status = 'success') as successful_last_24h,
  COUNT(wev.id) FILTER (WHERE wev.received_at >= NOW() - INTERVAL '24 hours' AND wev.status = 'error') as failed_last_24h
FROM webhook_endpoints we
JOIN wc_sites s ON we.site_id = s.id
LEFT JOIN webhook_events wev ON we.site_id = wev.site_id
GROUP BY we.id, s.name;

-- View for recent webhook events
CREATE OR REPLACE VIEW recent_webhook_events AS
SELECT 
  wev.*,
  s.name as site_name,
  s.url as site_url
FROM webhook_events wev
JOIN wc_sites s ON wev.site_id = s.id
WHERE wev.received_at >= NOW() - INTERVAL '7 days'
ORDER BY wev.received_at DESC;

-- ================================================
-- INITIAL DATA SETUP
-- ================================================

-- Insert default sync checkpoints for existing sites
INSERT INTO sync_checkpoints_v2 (site_id, sync_type)
SELECT id, 'orders' FROM wc_sites
ON CONFLICT (site_id, sync_type) DO NOTHING;

INSERT INTO sync_checkpoints_v2 (site_id, sync_type)
SELECT id, 'products' FROM wc_sites
ON CONFLICT (site_id, sync_type) DO NOTHING;