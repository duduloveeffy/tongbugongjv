-- Create sync_tasks table for async sync job tracking
CREATE TABLE IF NOT EXISTS sync_tasks (
  id TEXT PRIMARY KEY,
  site_id UUID REFERENCES wc_sites(id) ON DELETE CASCADE,
  site_name TEXT,
  sync_type TEXT CHECK (sync_type IN ('full', 'incremental', 'orders', 'products')),
  sync_orders BOOLEAN DEFAULT true,
  sync_products BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  progress JSONB DEFAULT '{}'::jsonb,
  results JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sync_tasks_site_id ON sync_tasks(site_id);
CREATE INDEX IF NOT EXISTS idx_sync_tasks_status ON sync_tasks(status);
CREATE INDEX IF NOT EXISTS idx_sync_tasks_created_at ON sync_tasks(created_at DESC);

-- Add a function to clean up old sync tasks (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_sync_tasks()
RETURNS void AS $$
BEGIN
  DELETE FROM sync_tasks
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND status IN ('completed', 'failed', 'cancelled');
END;
$$ LANGUAGE plpgsql;

-- Comment on table and columns
COMMENT ON TABLE sync_tasks IS 'Tracks async sync jobs for WooCommerce data synchronization';
COMMENT ON COLUMN sync_tasks.id IS 'Unique task identifier';
COMMENT ON COLUMN sync_tasks.site_id IS 'Reference to the WooCommerce site';
COMMENT ON COLUMN sync_tasks.sync_type IS 'Type of sync operation';
COMMENT ON COLUMN sync_tasks.status IS 'Current status of the sync task';
COMMENT ON COLUMN sync_tasks.progress IS 'JSON object containing progress information';
COMMENT ON COLUMN sync_tasks.results IS 'JSON object containing final results';
COMMENT ON COLUMN sync_tasks.error_message IS 'Error message if task failed';

-- Grant permissions (adjust based on your auth setup)
GRANT ALL ON sync_tasks TO authenticated;
GRANT SELECT ON sync_tasks TO anon;