-- ============================================
-- 最终完整修复 sync_tasks 表 - 包含所有必需列
-- ============================================

-- 显示开始信息
SELECT '🔧 开始修复 sync_tasks 表...' as info;

-- 第一步：添加所有缺失的列
-- ============================================

-- 1. 添加 sku_list 列（SKU批量同步时使用）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'sku_list'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN sku_list TEXT[];
        RAISE NOTICE '✅ Added sku_list column';
    ELSE
        RAISE NOTICE '⏭️ sku_list column already exists';
    END IF;
END $$;

-- 2. 添加 retry_count 列
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'retry_count'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN retry_count INTEGER DEFAULT 0;
        RAISE NOTICE '✅ Added retry_count column';
    ELSE
        RAISE NOTICE '⏭️ retry_count column already exists';
    END IF;
END $$;

-- 3. 添加 priority 列
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'priority'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN priority INTEGER DEFAULT 3;
        RAISE NOTICE '✅ Added priority column';
    ELSE
        RAISE NOTICE '⏭️ priority column already exists';
    END IF;
END $$;

-- 4. 添加 metadata 列
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN metadata JSONB DEFAULT '{}';
        RAISE NOTICE '✅ Added metadata column';
    ELSE
        RAISE NOTICE '⏭️ metadata column already exists';
    END IF;
END $$;

-- 5. 添加 progress 列
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'progress'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN progress JSONB DEFAULT '{"percentage": 0, "current": 0, "total": 0, "message": ""}';
        RAISE NOTICE '✅ Added progress column';
    ELSE
        RAISE NOTICE '⏭️ progress column already exists';
    END IF;
END $$;

-- 6. 添加 error_message 列（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'error_message'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN error_message TEXT;
        RAISE NOTICE '✅ Added error_message column';
    ELSE
        RAISE NOTICE '⏭️ error_message column already exists';
    END IF;
END $$;

-- 7. 添加 started_at 列（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'started_at'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN started_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE '✅ Added started_at column';
    ELSE
        RAISE NOTICE '⏭️ started_at column already exists';
    END IF;
END $$;

-- 8. 添加 completed_at 列（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE '✅ Added completed_at column';
    ELSE
        RAISE NOTICE '⏭️ completed_at column already exists';
    END IF;
END $$;

-- 第二步：修复现有数据
-- ============================================
SELECT '📊 修复现有数据...' as info;

-- 修复 NULL 值
UPDATE sync_tasks SET retry_count = 0 WHERE retry_count IS NULL;
UPDATE sync_tasks SET priority = 3 WHERE priority IS NULL;
UPDATE sync_tasks SET metadata = '{}' WHERE metadata IS NULL;
UPDATE sync_tasks SET progress = '{"percentage": 0, "current": 0, "total": 0, "message": ""}' WHERE progress IS NULL;

-- 修复超范围的 priority
UPDATE sync_tasks SET priority = 3 WHERE priority < 1 OR priority > 5;

-- 修复不合规的 status 值
UPDATE sync_tasks 
SET status = 'failed'
WHERE status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- 第三步：更新约束
-- ============================================
SELECT '🔒 更新约束...' as info;

-- 1. 更新 task_type 约束
ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_task_type_check;
ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_task_type_check 
CHECK (task_type IN ('full', 'incremental', 'sku_batch'));

-- 2. 更新 status 约束
ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_status_check;
ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- 3. 添加 priority 约束
ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_priority_check;
ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_priority_check 
CHECK (priority BETWEEN 1 AND 5);

-- 4. 添加 retry_count 约束
ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_retry_count_check;
ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_retry_count_check 
CHECK (retry_count >= 0);

-- 第四步：创建索引
-- ============================================
SELECT '📍 创建索引...' as info;

CREATE INDEX IF NOT EXISTS idx_sync_tasks_queue 
ON sync_tasks(status, priority DESC, created_at ASC) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_tasks_processing 
ON sync_tasks(status) 
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_sync_tasks_site_id 
ON sync_tasks(site_id);

CREATE INDEX IF NOT EXISTS idx_sync_tasks_created_at 
ON sync_tasks(created_at DESC);

-- 第五步：添加注释
-- ============================================
SELECT '📝 添加字段注释...' as info;

COMMENT ON TABLE sync_tasks IS '同步任务队列表';
COMMENT ON COLUMN sync_tasks.id IS '任务唯一标识';
COMMENT ON COLUMN sync_tasks.site_id IS '站点ID';
COMMENT ON COLUMN sync_tasks.task_type IS '任务类型：full(全量), incremental(增量), sku_batch(SKU批量)';
COMMENT ON COLUMN sync_tasks.sku_list IS 'SKU列表，用于批量同步特定SKU';
COMMENT ON COLUMN sync_tasks.priority IS '任务优先级（1-5），5为最高优先级';
COMMENT ON COLUMN sync_tasks.status IS '任务状态';
COMMENT ON COLUMN sync_tasks.retry_count IS '重试次数';
COMMENT ON COLUMN sync_tasks.error_message IS '错误信息';
COMMENT ON COLUMN sync_tasks.metadata IS '任务元数据';
COMMENT ON COLUMN sync_tasks.progress IS '任务进度信息';
COMMENT ON COLUMN sync_tasks.created_at IS '创建时间';
COMMENT ON COLUMN sync_tasks.started_at IS '开始执行时间';
COMMENT ON COLUMN sync_tasks.completed_at IS '完成时间';

-- 第六步：最终验证
-- ============================================
SELECT '✅ 验证结果...' as info;

-- 显示表结构
SELECT 
    '📋 表结构' as check_type,
    column_name,
    data_type,
    column_default,
    is_nullable,
    CASE 
        WHEN column_name IN ('sku_list', 'retry_count', 'priority', 'metadata', 'progress') 
        THEN '✅ 已添加' 
        ELSE '✓' 
    END as status
FROM information_schema.columns 
WHERE table_name = 'sync_tasks'
ORDER BY ordinal_position;

-- 检查所有必需列
SELECT 
    '🔍 必需列检查' as check_type,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'id') as has_id,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'site_id') as has_site_id,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'task_type') as has_task_type,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'sku_list') as has_sku_list,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'priority') as has_priority,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'status') as has_status,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'retry_count') as has_retry_count,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'metadata') as has_metadata,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'progress') as has_progress;

-- 显示约束
SELECT 
    '🔒 约束' as info,
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'sync_tasks'::regclass
ORDER BY conname;

-- 显示索引
SELECT 
    '📍 索引' as info,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'sync_tasks'
ORDER BY indexname;

-- 数据统计
SELECT 
    '📊 数据统计' as info,
    COUNT(*) as total_tasks,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
FROM sync_tasks;

-- 成功消息
SELECT '🎉 sync_tasks 表已完全修复！所有必需列都已添加，可以正常使用了！' as result;