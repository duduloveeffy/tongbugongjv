-- ============================================
-- 修复 sync_tasks 表的 ID 列问题
-- ============================================

-- 启用 UUID 扩展（如果还没有启用）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 第一步：检查当前 id 列的状态
-- ============================================
SELECT '========== 检查 ID 列状态 ==========' as info;

SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'sync_tasks' AND column_name = 'id';

-- 第二步：修复 id 列的默认值
-- ============================================
SELECT '========== 修复 ID 列 ==========' as info;

-- 方法1：如果 id 列存在但没有默认值，添加默认值
DO $$
BEGIN
    -- 检查 id 列是否存在
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sync_tasks' AND column_name = 'id'
    ) THEN
        -- 修改 id 列，添加默认值
        ALTER TABLE sync_tasks 
        ALTER COLUMN id SET DEFAULT uuid_generate_v4();
        
        RAISE NOTICE '✅ Updated id column with UUID default value';
    ELSE
        -- 如果 id 列不存在，创建它
        ALTER TABLE sync_tasks 
        ADD COLUMN id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
        
        RAISE NOTICE '✅ Created id column with UUID default value';
    END IF;
END $$;

-- 第三步：确保 id 是主键
-- ============================================
DO $$
BEGIN
    -- 检查是否已有主键
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE table_name = 'sync_tasks' 
        AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE sync_tasks ADD PRIMARY KEY (id);
        RAISE NOTICE '✅ Added PRIMARY KEY constraint to id column';
    ELSE
        RAISE NOTICE '⏭️ PRIMARY KEY already exists';
    END IF;
END $$;

-- 第四步：修复任何现有的 NULL id 值
-- ============================================
UPDATE sync_tasks 
SET id = uuid_generate_v4() 
WHERE id IS NULL;

-- 第五步：确保 id 列不允许 NULL
-- ============================================
ALTER TABLE sync_tasks 
ALTER COLUMN id SET NOT NULL;

-- 第六步：验证修复结果
-- ============================================
SELECT '========== 验证结果 ==========' as info;

-- 显示 id 列的最终状态
SELECT 
    'ID 列状态' as check_type,
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'sync_tasks' AND column_name = 'id';

-- 检查主键约束
SELECT 
    '主键约束' as check_type,
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'sync_tasks' 
AND constraint_type = 'PRIMARY KEY';

-- 显示完整的表结构
SELECT '========== 完整表结构 ==========' as info;

SELECT 
    ordinal_position as pos,
    column_name,
    data_type,
    CASE 
        WHEN column_default LIKE '%uuid_generate_v4%' THEN 'uuid_generate_v4()'
        ELSE column_default
    END as default_value,
    is_nullable,
    CASE 
        WHEN column_name = 'id' THEN '🔑 PRIMARY KEY'
        WHEN column_name IN ('task_type', 'sku_list', 'retry_count', 'priority', 'metadata', 'progress', 'status', 'site_id') THEN '✅ 必需'
        ELSE '✓'
    END as importance
FROM information_schema.columns 
WHERE table_name = 'sync_tasks'
ORDER BY ordinal_position;

-- 测试：尝试插入一条测试记录（不指定 id）
-- ============================================
SELECT '========== 测试插入 ==========' as info;

DO $$
DECLARE
    test_id UUID;
BEGIN
    -- 尝试插入一条测试记录，不指定 id
    INSERT INTO sync_tasks (
        site_id,
        task_type,
        status,
        priority,
        retry_count
    ) VALUES (
        uuid_generate_v4(), -- 使用随机 site_id 作为测试
        'full',
        'pending',
        3,
        0
    ) RETURNING id INTO test_id;
    
    RAISE NOTICE '✅ 测试插入成功！生成的 ID: %', test_id;
    
    -- 删除测试记录
    DELETE FROM sync_tasks WHERE id = test_id;
    RAISE NOTICE '✅ 测试记录已删除';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ 测试插入失败: %', SQLERRM;
END $$;

-- 成功消息
SELECT '🎉 sync_tasks 表的 ID 列已修复！现在可以自动生成 UUID 了。' as result;