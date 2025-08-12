-- ============================================
-- 检查并修复 sync_tasks 表结构
-- ============================================

-- 第一步：先检查表的当前结构
-- ============================================
SELECT '========== 当前 sync_tasks 表结构 ==========' as info;

SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'sync_tasks'
ORDER BY ordinal_position;

-- 第二步：逐个添加缺失的列（基础列）
-- ============================================
SELECT '========== 添加基础列 ==========' as info;

-- 1. 添加 task_type 列（任务类型）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'task_type'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN task_type TEXT DEFAULT 'full';
        RAISE NOTICE '✅ Added task_type column';
    ELSE
        RAISE NOTICE '⏭️ task_type column already exists';
    END IF;
END $$;

-- 2. 添加 status 列（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'status'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN status TEXT DEFAULT 'pending';
        RAISE NOTICE '✅ Added status column';
    ELSE
        RAISE NOTICE '⏭️ status column already exists';
    END IF;
END $$;

-- 3. 添加 site_id 列（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'site_id'
    ) THEN
        -- 首先检查 wc_sites 表是否存在
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wc_sites') THEN
            ALTER TABLE sync_tasks ADD COLUMN site_id UUID REFERENCES wc_sites(id) ON DELETE CASCADE;
        ELSE
            ALTER TABLE sync_tasks ADD COLUMN site_id UUID;
        END IF;
        RAISE NOTICE '✅ Added site_id column';
    ELSE
        RAISE NOTICE '⏭️ site_id column already exists';
    END IF;
END $$;

-- 4. 添加 created_at 列（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE sync_tasks ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE '✅ Added created_at column';
    ELSE
        RAISE NOTICE '⏭️ created_at column already exists';
    END IF;
END $$;

-- 第三步：添加任务队列所需的其他列
-- ============================================
SELECT '========== 添加任务队列必需列 ==========' as info;

-- 5. 添加 sku_list 列
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

-- 6. 添加 retry_count 列
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

-- 7. 添加 priority 列
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

-- 8. 添加 metadata 列
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

-- 9. 添加 progress 列
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

-- 10. 添加 error_message 列
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

-- 11. 添加 started_at 列
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

-- 12. 添加 completed_at 列
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

-- 第四步：修复数据并添加约束（只在列存在时）
-- ============================================
SELECT '========== 修复数据并添加约束 ==========' as info;

-- 修复 task_type 的值
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'task_type') THEN
        UPDATE sync_tasks 
        SET task_type = 'full' 
        WHERE task_type IS NULL OR task_type NOT IN ('full', 'incremental', 'sku_batch');
        
        -- 添加 task_type 约束
        ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_task_type_check;
        ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_task_type_check 
        CHECK (task_type IN ('full', 'incremental', 'sku_batch'));
    END IF;
END $$;

-- 修复 status 的值
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'status') THEN
        UPDATE sync_tasks 
        SET status = 'failed' 
        WHERE status IS NULL OR status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled');
        
        -- 添加 status 约束
        ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_status_check;
        ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_status_check 
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));
    END IF;
END $$;

-- 修复 priority 的值
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'priority') THEN
        UPDATE sync_tasks SET priority = 3 WHERE priority IS NULL OR priority < 1 OR priority > 5;
        
        -- 添加 priority 约束
        ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_priority_check;
        ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_priority_check 
        CHECK (priority BETWEEN 1 AND 5);
    END IF;
END $$;

-- 修复 retry_count 的值
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'retry_count') THEN
        UPDATE sync_tasks SET retry_count = 0 WHERE retry_count IS NULL OR retry_count < 0;
        
        -- 添加 retry_count 约束
        ALTER TABLE sync_tasks DROP CONSTRAINT IF EXISTS sync_tasks_retry_count_check;
        ALTER TABLE sync_tasks ADD CONSTRAINT sync_tasks_retry_count_check 
        CHECK (retry_count >= 0);
    END IF;
END $$;

-- 第五步：创建索引
-- ============================================
SELECT '========== 创建索引 ==========' as info;

-- 只在必要的列存在时创建索引
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'status') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'priority')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'created_at') THEN
        
        CREATE INDEX IF NOT EXISTS idx_sync_tasks_queue 
        ON sync_tasks(status, priority DESC, created_at ASC) 
        WHERE status = 'pending';
        
        CREATE INDEX IF NOT EXISTS idx_sync_tasks_processing 
        ON sync_tasks(status) 
        WHERE status = 'processing';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'site_id') THEN
        CREATE INDEX IF NOT EXISTS idx_sync_tasks_site_id ON sync_tasks(site_id);
    END IF;
END $$;

-- 第六步：最终验证
-- ============================================
SELECT '========== 最终表结构 ==========' as info;

SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable,
    CASE 
        WHEN column_name IN ('task_type', 'sku_list', 'retry_count', 'priority', 'metadata', 'progress') 
        THEN '✅ 必需列' 
        ELSE '✓' 
    END as importance
FROM information_schema.columns 
WHERE table_name = 'sync_tasks'
ORDER BY ordinal_position;

-- 检查所有必需列是否存在
SELECT 
    '🔍 必需列检查结果' as check_result,
    CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'task_type') THEN '✅' ELSE '❌' END as task_type,
    CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'sku_list') THEN '✅' ELSE '❌' END as sku_list,
    CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'priority') THEN '✅' ELSE '❌' END as priority,
    CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'status') THEN '✅' ELSE '❌' END as status,
    CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'retry_count') THEN '✅' ELSE '❌' END as retry_count,
    CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'metadata') THEN '✅' ELSE '❌' END as metadata,
    CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_tasks' AND column_name = 'progress') THEN '✅' ELSE '❌' END as progress;

-- 成功消息
SELECT '🎉 sync_tasks 表修复完成！' as result;