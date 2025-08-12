-- Add missing columns to sync_tasks table if they don't exist
DO $$ 
BEGIN
  -- Add progress column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sync_tasks' AND column_name = 'progress'
  ) THEN
    ALTER TABLE sync_tasks ADD COLUMN progress JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add results column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sync_tasks' AND column_name = 'results'
  ) THEN
    ALTER TABLE sync_tasks ADD COLUMN results JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add site_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sync_tasks' AND column_name = 'site_name'
  ) THEN
    ALTER TABLE sync_tasks ADD COLUMN site_name TEXT;
  END IF;

  -- Add sync_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sync_tasks' AND column_name = 'sync_type'
  ) THEN
    ALTER TABLE sync_tasks ADD COLUMN sync_type TEXT CHECK (sync_type IN ('full', 'incremental', 'orders', 'products'));
  END IF;

  -- Add sync_orders column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sync_tasks' AND column_name = 'sync_orders'
  ) THEN
    ALTER TABLE sync_tasks ADD COLUMN sync_orders BOOLEAN DEFAULT true;
  END IF;

  -- Add sync_products column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sync_tasks' AND column_name = 'sync_products'
  ) THEN
    ALTER TABLE sync_tasks ADD COLUMN sync_products BOOLEAN DEFAULT true;
  END IF;

  -- Add started_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sync_tasks' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE sync_tasks ADD COLUMN started_at TIMESTAMPTZ;
  END IF;

  -- Add completed_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sync_tasks' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE sync_tasks ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;

  -- Add error_message column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sync_tasks' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE sync_tasks ADD COLUMN error_message TEXT;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_sync_tasks_site_id ON sync_tasks(site_id);
CREATE INDEX IF NOT EXISTS idx_sync_tasks_status ON sync_tasks(status);
CREATE INDEX IF NOT EXISTS idx_sync_tasks_created_at ON sync_tasks(created_at DESC);

-- Comment on columns
COMMENT ON COLUMN sync_tasks.progress IS 'JSON object containing progress information';
COMMENT ON COLUMN sync_tasks.results IS 'JSON object containing final results';
COMMENT ON COLUMN sync_tasks.site_name IS 'Name of the WooCommerce site';
COMMENT ON COLUMN sync_tasks.sync_type IS 'Type of sync operation';
COMMENT ON COLUMN sync_tasks.error_message IS 'Error message if task failed';