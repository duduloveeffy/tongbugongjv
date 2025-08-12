-- ============================================
-- sync_tasks 表完整更新脚本
-- ============================================

-- 1. 添加 priority 列（优先级，1-5，5为最高）
ALTER TABLE sync_tasks 
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5);

-- 2. 添加 metadata 列（存储任务相关的元数据）
ALTER TABLE sync_tasks 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 3. 添加 progress 列（存储任务进度信息）
ALTER TABLE sync_tasks 
ADD COLUMN IF NOT EXISTS progress JSONB DEFAULT '{"percentage": 0, "current": 0, "total": 0, "message": ""}';

-- 4. 更新 status 列的约束，添加 'cancelled' 状态
ALTER TABLE sync_tasks 
DROP CONSTRAINT IF EXISTS sync_tasks_status_check;

ALTER TABLE sync_tasks 
ADD CONSTRAINT sync_tasks_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- 5. 创建索引以优化查询性能
-- 优先级队列索引（用于获取下一个待处理任务）
CREATE INDEX IF NOT EXISTS idx_sync_tasks_queue 
ON sync_tasks(status, priority DESC, created_at ASC) 
WHERE status = 'pending';

-- 处理中任务索引（用于检查并发数）
CREATE INDEX IF NOT EXISTS idx_sync_tasks_processing 
ON sync_tasks(status) 
WHERE status = 'processing';

-- 站点ID索引（用于查询特定站点的任务）
CREATE INDEX IF NOT EXISTS idx_sync_tasks_site_id 
ON sync_tasks(site_id);

-- 6. 添加字段注释
COMMENT ON COLUMN sync_tasks.priority IS '任务优先级（1-5），5为最高优先级';
COMMENT ON COLUMN sync_tasks.metadata IS '任务元数据，存储额外的任务相关信息';
COMMENT ON COLUMN sync_tasks.progress IS '任务进度信息，包含百分比、当前数、总数和消息';

-- ============================================
-- 验证修改结果
-- ============================================

-- 查看表结构
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'sync_tasks'
ORDER BY ordinal_position;

-- 查看约束
SELECT 
    constraint_name,
    constraint_type,
    check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'sync_tasks';

-- 查看索引
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'sync_tasks';

-- ============================================
-- 示例：如何使用新字段
-- ============================================

/*
-- 创建一个新任务
INSERT INTO sync_tasks (
    site_id,
    task_type,
    priority,
    status,
    metadata,
    progress
) VALUES (
    'your-site-id',
    'full',
    5, -- 高优先级
    'pending',
    '{"source": "manual", "description": "全量同步订单和产品"}',
    '{"percentage": 0, "current": 0, "total": 0, "message": "等待开始..."}'
);

-- 更新任务进度
UPDATE sync_tasks 
SET 
    progress = '{"percentage": 50, "current": 500, "total": 1000, "message": "正在同步订单..."}',
    status = 'processing'
WHERE id = 'task-id';

-- 获取下一个待处理任务（按优先级和创建时间）
SELECT * FROM sync_tasks
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 1;
*/