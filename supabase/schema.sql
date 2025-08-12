-- Supabase Schema for Multi-site WooCommerce Sales Sync

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. WooCommerce Sites Configuration
CREATE TABLE IF NOT EXISTS wc_sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Sales Cache Table
CREATE TABLE IF NOT EXISTS sales_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL,
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  order_count INTEGER DEFAULT 0,
  sales_quantity INTEGER DEFAULT 0,
  order_count_30d INTEGER DEFAULT 0,
  sales_quantity_30d INTEGER DEFAULT 0,
  date_range_start DATE,
  date_range_end DATE,
  cache_expires_at TIMESTAMP WITH TIME ZONE,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sku, site_id)
);

-- 3. Sync Tasks Queue
CREATE TABLE IF NOT EXISTS sync_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('full', 'incremental', 'sku_batch')),
  sku_list TEXT[],
  priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 4. Sync Checkpoints for Incremental Sync
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  site_id UUID PRIMARY KEY REFERENCES wc_sites(id) ON DELETE CASCADE,
  last_order_id INTEGER,
  last_order_date TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Sync Metrics for Monitoring
CREATE TABLE IF NOT EXISTS sync_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  total_syncs INTEGER DEFAULT 0,
  successful_syncs INTEGER DEFAULT 0,
  failed_syncs INTEGER DEFAULT 0,
  avg_duration_ms INTEGER,
  total_skus_synced INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(site_id, date)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sales_cache_sku ON sales_cache(sku);
CREATE INDEX IF NOT EXISTS idx_sales_cache_site_id ON sales_cache(site_id);
CREATE INDEX IF NOT EXISTS idx_sales_cache_last_updated ON sales_cache(last_updated);
CREATE INDEX IF NOT EXISTS idx_sync_tasks_status ON sync_tasks(status);
CREATE INDEX IF NOT EXISTS idx_sync_tasks_site_id ON sync_tasks(site_id);
CREATE INDEX IF NOT EXISTS idx_sync_metrics_date ON sync_metrics(date);

-- Update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_wc_sites_updated_at ON wc_sites;
CREATE TRIGGER update_wc_sites_updated_at BEFORE UPDATE ON wc_sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sync_checkpoints_updated_at ON sync_checkpoints;
CREATE TRIGGER update_sync_checkpoints_updated_at BEFORE UPDATE ON sync_checkpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get aggregated sales data across all sites for a SKU
CREATE OR REPLACE FUNCTION get_aggregated_sales(p_sku TEXT)
RETURNS TABLE (
  total_order_count BIGINT,
  total_sales_quantity BIGINT,
  total_order_count_30d BIGINT,
  total_sales_quantity_30d BIGINT,
  site_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(order_count), 0) AS total_order_count,
    COALESCE(SUM(sales_quantity), 0) AS total_sales_quantity,
    COALESCE(SUM(order_count_30d), 0) AS total_order_count_30d,
    COALESCE(SUM(sales_quantity_30d), 0) AS total_sales_quantity_30d,
    COUNT(DISTINCT site_id)::INTEGER AS site_count
  FROM sales_cache
  WHERE sku = p_sku
    AND cache_expires_at > NOW();
END;
$$ LANGUAGE plpgsql;

-- 6. Products Cache Table
CREATE TABLE IF NOT EXISTS products_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  product_id INTEGER,
  sku TEXT NOT NULL,
  name TEXT,
  description TEXT,
  price DECIMAL(10,2),
  regular_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  stock_quantity INTEGER DEFAULT 0,
  stock_status TEXT, -- 'instock', 'outofstock', 'onbackorder'
  manage_stock BOOLEAN DEFAULT false,
  status TEXT, -- 'publish', 'draft', 'pending', 'private'
  product_type TEXT, -- 'simple', 'variable', 'grouped', etc.
  product_url TEXT,
  image_url TEXT,
  categories JSONB,
  attributes JSONB,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(site_id, sku)
);

-- 7. Stock History Table (for tracking inventory changes)
CREATE TABLE IF NOT EXISTS stock_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  product_name TEXT,
  stock_before INTEGER,
  stock_after INTEGER,
  change_amount INTEGER,
  change_type TEXT, -- 'sale', 'restock', 'adjustment', 'sync'
  change_reason TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for products cache
CREATE INDEX IF NOT EXISTS idx_products_cache_sku ON products_cache(sku);
CREATE INDEX IF NOT EXISTS idx_products_cache_site_id ON products_cache(site_id);
CREATE INDEX IF NOT EXISTS idx_products_cache_stock_status ON products_cache(stock_status);
CREATE INDEX IF NOT EXISTS idx_products_cache_status ON products_cache(status);

-- Indexes for stock history
CREATE INDEX IF NOT EXISTS idx_stock_history_sku ON stock_history(sku);
CREATE INDEX IF NOT EXISTS idx_stock_history_site_id ON stock_history(site_id);
CREATE INDEX IF NOT EXISTS idx_stock_history_recorded_at ON stock_history(recorded_at);

-- Function to record stock changes automatically
CREATE OR REPLACE FUNCTION record_stock_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
    INSERT INTO stock_history (
      site_id,
      sku,
      product_name,
      stock_before,
      stock_after,
      change_amount,
      change_type,
      change_reason
    ) VALUES (
      NEW.site_id,
      NEW.sku,
      NEW.name,
      OLD.stock_quantity,
      NEW.stock_quantity,
      NEW.stock_quantity - OLD.stock_quantity,
      'sync',
      'Automatic sync from WooCommerce'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically record stock changes
DROP TRIGGER IF EXISTS products_stock_change_trigger ON products_cache;
CREATE TRIGGER products_stock_change_trigger
AFTER UPDATE ON products_cache
FOR EACH ROW
EXECUTE FUNCTION record_stock_change();

-- Row Level Security (RLS) - Optional, enable if needed
-- ALTER TABLE wc_sites ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sales_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sync_tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE products_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock_history ENABLE ROW LEVEL SECURITY;