-- ============================================
-- 修复 sync_tasks 表（处理现有数据）
-- ============================================

-- 1. 首先查看现有的 status 值
SELECT DISTINCT status, COUNT(*) as count 
FROM sync_tasks 
GROUP BY status;

-- 2. 修复不符合新约束的 status 值
-- 将所有不在允许列表中的状态改为 'failed'
UPDATE sync_tasks 
SET status = 'failed'
WHERE status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- 3. 添加 priority 列（如果不存在）
ALTER TABLE sync_tasks 
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 3;

-- 4. 添加 metadata 列（如果不存在）
ALTER TABLE sync_tasks 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 5. 添加 progress 列（如果不存在）
ALTER TABLE sync_tasks 
ADD COLUMN IF NOT EXISTS progress JSONB DEFAULT '{"percentage": 0, "current": 0, "total": 0, "message": ""}';

-- 6. 现在可以安全地更新约束了
ALTER TABLE sync_tasks 
DROP CONSTRAINT IF EXISTS sync_tasks_status_check;

ALTER TABLE sync_tasks 
ADD CONSTRAINT sync_tasks_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- 7. 添加 priority 的约束
ALTER TABLE sync_tasks 
ADD CONSTRAINT sync_tasks_priority_check 
CHECK (priority BETWEEN 1 AND 5);

-- 8. 更新所有现有记录的 priority（如果为 NULL）
UPDATE sync_tasks 
SET priority = 3 
WHERE priority IS NULL;

-- 9. 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_sync_tasks_queue 
ON sync_tasks(status, priority DESC, created_at ASC) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_tasks_processing 
ON sync_tasks(status) 
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_sync_tasks_site_id 
ON sync_tasks(site_id);

-- 10. 添加字段注释
COMMENT ON COLUMN sync_tasks.priority IS '任务优先级（1-5），5为最高优先级';
COMMENT ON COLUMN sync_tasks.metadata IS '任务元数据，存储额外的任务相关信息';
COMMENT ON COLUMN sync_tasks.progress IS '任务进度信息，包含百分比、当前数、总数和消息';

-- ============================================
-- 验证修改结果
-- ============================================

-- 查看更新后的表结构
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'sync_tasks'
ORDER BY ordinal_position;

-- 查看所有约束
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'sync_tasks'::regclass;

-- 查看索引
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'sync_tasks';

-- 查看当前数据状态分布
SELECT 
    status,
    COUNT(*) as count,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM sync_tasks
GROUP BY status
ORDER BY count DESC;