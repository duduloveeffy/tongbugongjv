-- Create orders table if it doesn't exist
-- This is needed for the sales page functionality

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  line_items JSONB, -- Store line items as JSONB for simplicity

  -- Site name for easier queries
  site_name TEXT,

  -- Sync Information
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  UNIQUE(site_id, order_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_site_id ON orders(site_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date_created ON orders(date_created);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_site_date_status ON orders(site_id, date_created, status);

-- Create order items table if needed
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  item_type TEXT DEFAULT 'line_item',

  -- Product Information
  product_id INTEGER,
  variation_id INTEGER,
  sku TEXT,
  name TEXT,

  -- Quantities and Pricing
  quantity INTEGER DEFAULT 1,
  price DECIMAL(10,2),
  subtotal DECIMAL(10,2),
  subtotal_tax DECIMAL(10,2),
  total DECIMAL(10,2),
  total_tax DECIMAL(10,2),

  -- Metadata
  meta_data JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  UNIQUE(order_id, item_id)
);

-- Create indexes for order items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Add update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_items_updated_at ON order_items;
CREATE TRIGGER update_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();