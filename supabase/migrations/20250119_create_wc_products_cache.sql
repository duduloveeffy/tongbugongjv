-- Create WooCommerce products cache tables
-- This provides local caching of WooCommerce product data to reduce API calls

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- WooCommerce products cache table
CREATE TABLE IF NOT EXISTS wc_products_cache (
  id SERIAL PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  sku VARCHAR(255) NOT NULL,
  name TEXT,
  type VARCHAR(50), -- simple, variable, grouped, external
  status VARCHAR(50), -- publish, draft, pending, private
  stock_status VARCHAR(50), -- instock, outofstock, onbackorder
  stock_quantity INTEGER,
  manage_stock BOOLEAN DEFAULT false,
  price DECIMAL(10,2),
  regular_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  categories JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '[]'::jsonb,
  variations JSONB DEFAULT '[]'::jsonb,
  meta_data JSONB DEFAULT '[]'::jsonb,
  images JSONB DEFAULT '[]'::jsonb,
  permalink TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, sku)
);

-- Create indexes for better query performance
CREATE INDEX idx_wc_products_cache_site_id ON wc_products_cache(site_id);
CREATE INDEX idx_wc_products_cache_sku ON wc_products_cache(sku);
CREATE INDEX idx_wc_products_cache_site_sku ON wc_products_cache(site_id, sku);
CREATE INDEX idx_wc_products_cache_synced_at ON wc_products_cache(synced_at);

-- Product sync status table (tracks sync progress per site)
CREATE TABLE IF NOT EXISTS wc_products_sync_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,
  total_products INTEGER DEFAULT 0,
  synced_products INTEGER DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  last_sync_duration_ms INTEGER, -- Duration of last sync in milliseconds
  sync_status VARCHAR(50) DEFAULT 'idle', -- idle, syncing, completed, error
  sync_progress DECIMAL(5,2) DEFAULT 0, -- Progress percentage
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id)
);

-- Create index for site_id lookup
CREATE INDEX idx_wc_products_sync_status_site_id ON wc_products_sync_status(site_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS update_wc_products_cache_updated_at ON wc_products_cache;
CREATE TRIGGER update_wc_products_cache_updated_at
    BEFORE UPDATE ON wc_products_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wc_products_sync_status_updated_at ON wc_products_sync_status;
CREATE TRIGGER update_wc_products_sync_status_updated_at
    BEFORE UPDATE ON wc_products_sync_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get cached product by SKU
CREATE OR REPLACE FUNCTION get_cached_product(
    p_site_id UUID,
    p_sku VARCHAR
)
RETURNS TABLE (
    id INTEGER,
    product_id INTEGER,
    sku VARCHAR,
    name TEXT,
    type VARCHAR,
    status VARCHAR,
    stock_status VARCHAR,
    stock_quantity INTEGER,
    manage_stock BOOLEAN,
    price DECIMAL,
    synced_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pc.id,
        pc.product_id,
        pc.sku,
        pc.name,
        pc.type,
        pc.status,
        pc.stock_status,
        pc.stock_quantity,
        pc.manage_stock,
        pc.price,
        pc.synced_at
    FROM wc_products_cache pc
    WHERE pc.site_id = p_site_id
      AND pc.sku = p_sku
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to batch get cached products by SKUs
CREATE OR REPLACE FUNCTION get_cached_products_batch(
    p_site_id UUID,
    p_skus TEXT[]
)
RETURNS TABLE (
    id INTEGER,
    product_id INTEGER,
    sku VARCHAR,
    name TEXT,
    type VARCHAR,
    status VARCHAR,
    stock_status VARCHAR,
    stock_quantity INTEGER,
    manage_stock BOOLEAN,
    price DECIMAL,
    synced_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pc.id,
        pc.product_id,
        pc.sku,
        pc.name,
        pc.type,
        pc.status,
        pc.stock_status,
        pc.stock_quantity,
        pc.manage_stock,
        pc.price,
        pc.synced_at
    FROM wc_products_cache pc
    WHERE pc.site_id = p_site_id
      AND pc.sku = ANY(p_skus);
END;
$$ LANGUAGE plpgsql;

-- Function to get sync status
CREATE OR REPLACE FUNCTION get_products_sync_status(p_site_id UUID)
RETURNS TABLE (
    total_products INTEGER,
    synced_products INTEGER,
    last_sync_at TIMESTAMPTZ,
    sync_status VARCHAR,
    sync_progress DECIMAL,
    cache_age_hours INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pss.total_products,
        pss.synced_products,
        pss.last_sync_at,
        pss.sync_status,
        pss.sync_progress,
        CASE
            WHEN pss.last_sync_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (NOW() - pss.last_sync_at))::INTEGER / 3600
            ELSE NULL
        END AS cache_age_hours
    FROM wc_products_sync_status pss
    WHERE pss.site_id = p_site_id;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON wc_products_cache TO authenticated;
GRANT ALL ON wc_products_sync_status TO authenticated;
GRANT USAGE ON SEQUENCE wc_products_cache_id_seq TO authenticated;