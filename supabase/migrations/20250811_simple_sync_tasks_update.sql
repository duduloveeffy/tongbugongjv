-- Simple update for sync_tasks table
-- Run this if the previous migration hasn't been applied

-- Try to add priority column (will be ignored if exists)
DO $$ 
BEGIN
  ALTER TABLE sync_tasks ADD COLUMN priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5);
  EXCEPTION WHEN duplicate_column THEN
    -- Column already exists, ignore
    NULL;
END $$;

-- Check and add status 'cancelled' if needed
DO $$ 
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_status_check;
  
  -- Add new constraint with 'cancelled' status
  ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_status_check 
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));
  
  EXCEPTION WHEN others THEN
    -- If constraint already exists with cancelled, ignore
    NULL;
END $$;

-- Try to add metadata column (will be ignored if exists)
DO $$ 
BEGIN
  ALTER TABLE sync_tasks ADD COLUMN metadata JSONB DEFAULT '{}';
  EXCEPTION WHEN duplicate_column THEN
    -- Column already exists, ignore
    NULL;
END $$;

-- Try to add progress column (will be ignored if exists)
DO $$ 
BEGIN
  ALTER TABLE sync_tasks ADD COLUMN progress JSONB DEFAULT '{"percentage": 0, "current": 0, "total": 0, "message": ""}';
  EXCEPTION WHEN duplicate_column THEN
    -- Column already exists, ignore
    NULL;
END $$;

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sync_tasks' 
AND column_name IN ('priority', 'metadata', 'progress');