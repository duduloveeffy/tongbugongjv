-- ============================================
-- 完整修复 sync_tasks 表 - 全面分析和修复
-- ============================================

-- 第一步：诊断当前表结构
-- ============================================
SELECT '========== 1. 当前表结构诊断 ==========' as step;

-- 显示所有列
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable,
    CASE 
        WHEN column_name IN ('priority', 'metadata', 'progress', 'retry_count') 
        THEN '⚠️ 需要检查' 
        ELSE '✅' 
    END as status
FROM information_schema.columns 
WHERE table_name = 'sync_tasks'
ORDER BY ordinal_position;

-- 检查缺失的必需列
SELECT '缺失的列:' as info,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'retry_count') 
         THEN '❌ retry_count' ELSE '✅ retry_count exists' END as retry_count_status,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'priority') 
         THEN '❌ priority' ELSE '✅ priority exists' END as priority_status,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'metadata') 
         THEN '❌ metadata' ELSE '✅ metadata exists' END as metadata_status,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'progress') 
         THEN '❌ progress' ELSE '✅ progress exists' END as progress_status;

-- 第二步：修复数据问题
-- ============================================
SELECT '========== 2. 修复数据问题 ==========' as step;

-- 修复不合规的 status 值
UPDATE sync_tasks 
SET status = 'failed'
WHERE status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- 第三步：添加所有缺失的列
-- ============================================
SELECT '========== 3. 添加缺失的列 ==========' as step;

-- 1. 添加 retry_count 列（最重要，解决当前错误）
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

-- 2. 添加 priority 列
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

-- 3. 添加 metadata 列
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

-- 4. 添加 progress 列
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

-- 第四步：修复现有数据
-- ============================================
SELECT '========== 4. 修复现有数据 ==========' as step;

-- 修复 NULL 值
UPDATE sync_tasks SET retry_count = 0 WHERE retry_count IS NULL;
UPDATE sync_tasks SET priority = 3 WHERE priority IS NULL;
UPDATE sync_tasks SET metadata = '{}' WHERE metadata IS NULL;
UPDATE sync_tasks SET progress = '{"percentage": 0, "current": 0, "total": 0, "message": ""}' WHERE progress IS NULL;

-- 修复超范围的 priority
UPDATE sync_tasks SET priority = 3 WHERE priority < 1 OR priority > 5;

-- 第五步：更新约束
-- ============================================
SELECT '========== 5. 更新约束 ==========' as step;

-- 1. 更新 status 约束
ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_status_check;
ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- 2. 添加 priority 约束
ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_priority_check;
ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_priority_check 
CHECK (priority BETWEEN 1 AND 5);

-- 3. 添加 retry_count 约束（确保非负）
ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_retry_count_check;
ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_retry_count_check 
CHECK (retry_count >= 0);

-- 第六步：创建索引
-- ============================================
SELECT '========== 6. 创建索引 ==========' as step;

CREATE INDEX IF NOT EXISTS idx_sync_tasks_queue 
ON sync_tasks(status, priority DESC, created_at ASC) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_tasks_processing 
ON sync_tasks(status) 
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_sync_tasks_site_id 
ON sync_tasks(site_id);

-- 第七步：添加注释
-- ============================================
SELECT '========== 7. 添加字段注释 ==========' as step;

COMMENT ON COLUMN sync_tasks.retry_count IS '重试次数，初始为0';
COMMENT ON COLUMN sync_tasks.priority IS '任务优先级（1-5），5为最高优先级';
COMMENT ON COLUMN sync_tasks.metadata IS '任务元数据，存储额外的任务相关信息';
COMMENT ON COLUMN sync_tasks.progress IS '任务进度信息，包含百分比、当前数、总数和消息';

-- 第八步：最终验证
-- ============================================
SELECT '========== 8. 最终验证 ==========' as step;

-- 验证所有必需列都存在
SELECT 
    '✅ 所有必需列检查' as check_type,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'retry_count') as has_retry_count,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'priority') as has_priority,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'metadata') as has_metadata,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'progress') as has_progress;

-- 显示最终表结构
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'sync_tasks'
ORDER BY ordinal_position;

-- 显示所有约束
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'sync_tasks'::regclass;

-- 显示数据统计
SELECT 
    '📊 数据统计' as info,
    COUNT(*) as total_tasks,
    COUNT(DISTINCT site_id) as sites_count,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks,
    SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_tasks,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks
FROM sync_tasks;

-- 成功消息
SELECT '🎉 sync_tasks 表已完全修复！所有必需列都已添加。' as result;