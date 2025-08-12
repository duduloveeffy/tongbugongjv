-- Update sync_tasks table for queue management

-- Add metadata field if not exists
ALTER TABLE sync_tasks 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add progress tracking field if not exists
ALTER TABLE sync_tasks 
ADD COLUMN IF NOT EXISTS progress JSONB DEFAULT '{"percentage": 0, "current": 0, "total": 0, "message": ""}';

-- Add new status value 'cancelled' if not exists
ALTER TABLE sync_tasks 
DROP CONSTRAINT IF EXISTS sync_tasks_status_check;

ALTER TABLE sync_tasks 
ADD CONSTRAINT sync_tasks_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- Create index for queue processing
CREATE INDEX IF NOT EXISTS idx_sync_tasks_pending 
ON sync_tasks(status, priority DESC, created_at ASC) 
WHERE status = 'pending';

-- Create index for active tasks
CREATE INDEX IF NOT EXISTS idx_sync_tasks_processing 
ON sync_tasks(status) 
WHERE status = 'processing';

-- Function to clean old completed tasks (keep last 7 days)
CREATE OR REPLACE FUNCTION clean_old_sync_tasks()
RETURNS void AS $$
BEGIN
  DELETE FROM sync_tasks 
  WHERE status IN ('completed', 'cancelled') 
    AND completed_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Comment on new columns
COMMENT ON COLUMN sync_tasks.metadata IS 'Additional metadata for the sync task';
COMMENT ON COLUMN sync_tasks.progress IS 'Progress tracking information';

-- Sample query to get queue status
-- SELECT 
--   status,
--   COUNT(*) as count,
--   MAX(created_at) as latest
-- FROM sync_tasks
-- GROUP BY status;