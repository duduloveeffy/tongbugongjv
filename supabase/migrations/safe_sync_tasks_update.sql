-- ============================================
-- 安全更新 sync_tasks 表（处理所有边界情况）
-- ============================================

-- 1. 首先查看现有的 status 值分布
SELECT 'Current status distribution:' as info;
SELECT status, COUNT(*) as count 
FROM sync_tasks 
GROUP BY status
ORDER BY count DESC;

-- 2. 修复不符合新约束的 status 值
UPDATE sync_tasks 
SET status = 'failed'
WHERE status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- 3. 安全添加 priority 列
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'priority'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN priority INTEGER DEFAULT 3;
    END IF;
END $$;

-- 4. 安全添加 metadata 列
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
END $$;

-- 5. 安全添加 progress 列
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'progress'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN progress JSONB DEFAULT '{"percentage": 0, "current": 0, "total": 0, "message": ""}';
    END IF;
END $$;

-- 6. 更新所有 NULL 的 priority 值
UPDATE sync_tasks 
SET priority = 3 
WHERE priority IS NULL;

-- 7. 确保 priority 值在合法范围内
UPDATE sync_tasks 
SET priority = 3 
WHERE priority < 1 OR priority > 5;

-- 8. 安全地删除和重建 status 约束
ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_status_check;
ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- 9. 安全地删除和重建 priority 约束
ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_priority_check;
ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_priority_check 
CHECK (priority BETWEEN 1 AND 5);

-- 10. 安全创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_sync_tasks_queue 
ON sync_tasks(status, priority DESC, created_at ASC) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_tasks_processing 
ON sync_tasks(status) 
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_sync_tasks_site_id 
ON sync_tasks(site_id);

-- 11. 添加字段注释（安全操作，总是可以执行）
COMMENT ON COLUMN sync_tasks.priority IS '任务优先级（1-5），5为最高优先级';
COMMENT ON COLUMN sync_tasks.metadata IS '任务元数据，存储额外的任务相关信息';
COMMENT ON COLUMN sync_tasks.progress IS '任务进度信息，包含百分比、当前数、总数和消息';

-- ============================================
-- 验证结果
-- ============================================

SELECT '=== Table Structure ===' as info;
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'sync_tasks'
ORDER BY ordinal_position;

SELECT '=== Constraints ===' as info;
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'sync_tasks'::regclass;

SELECT '=== Indexes ===' as info;
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'sync_tasks';

SELECT '=== Data Status Summary ===' as info;
SELECT 
    status,
    COUNT(*) as task_count,
    MIN(priority) as min_priority,
    MAX(priority) as max_priority,
    AVG(priority)::numeric(3,1) as avg_priority
FROM sync_tasks
GROUP BY status
ORDER BY task_count DESC;

-- 成功消息
SELECT '✅ sync_tasks table updated successfully!' as result;