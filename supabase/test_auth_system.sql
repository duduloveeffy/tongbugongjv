-- ========================================
-- 权限系统测试和验证脚本
-- 用于验证权限系统是否正常工作
-- ========================================

-- =====================================
-- 测试 1：检查表结构
-- =====================================
SELECT '========== 测试 1：表结构检查 ==========' as test_section;

-- 检查必要的表是否存在
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
        THEN '✅ public.users 表存在'
        ELSE '❌ public.users 表不存在'
    END as users_table,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs')
        THEN '✅ public.audit_logs 表存在'
        ELSE '❌ public.audit_logs 表不存在'
    END as audit_logs_table;

-- 检查表字段
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'users'
ORDER BY ordinal_position;

-- =====================================
-- 测试 2：检查触发器
-- =====================================
SELECT '========== 测试 2：触发器检查 ==========' as test_section;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            AND trigger_name = 'on_auth_user_created'
        )
        THEN '✅ 用户自动同步触发器存在'
        ELSE '❌ 用户自动同步触发器不存在'
    END as trigger_status;

-- =====================================
-- 测试 3：RLS 策略检查
-- =====================================
SELECT '========== 测试 3：RLS 策略检查 ==========' as test_section;

-- 检查 RLS 是否启用
SELECT
    tablename,
    CASE rowsecurity
        WHEN true THEN '✅ RLS 已启用'
        ELSE '❌ RLS 未启用'
    END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('users', 'audit_logs');

-- 列出所有策略
SELECT
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'audit_logs')
ORDER BY tablename, policyname;

-- =====================================
-- 测试 4：用户数据一致性
-- =====================================
SELECT '========== 测试 4：数据一致性检查 ==========' as test_section;

-- 检查 auth.users 和 public.users 的同步状态
WITH sync_check AS (
    SELECT
        au.id,
        au.email as auth_email,
        pu.email as public_email,
        pu.role,
        CASE
            WHEN pu.id IS NULL THEN '⚠️ 未同步到 public.users'
            ELSE '✅ 已同步'
        END as sync_status
    FROM auth.users au
    LEFT JOIN public.users pu ON au.id = pu.id
)
SELECT * FROM sync_check;

-- 检查是否有孤立记录（public.users 中存在但 auth.users 中不存在）
SELECT
    CASE
        WHEN COUNT(*) = 0 THEN '✅ 没有孤立记录'
        ELSE '❌ 发现 ' || COUNT(*) || ' 条孤立记录'
    END as orphan_check
FROM public.users pu
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users au WHERE au.id = pu.id
);

-- =====================================
-- 测试 5：角色分配检查
-- =====================================
SELECT '========== 测试 5：角色分配检查 ==========' as test_section;

-- 统计各角色用户数
SELECT
    role,
    COUNT(*) as count,
    STRING_AGG(email, ', ' ORDER BY email) as users
FROM public.users
GROUP BY role
ORDER BY
    CASE role
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'viewer' THEN 3
    END;

-- 检查是否有管理员
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM public.users WHERE role = 'admin')
        THEN '✅ 系统已有管理员账户'
        ELSE '⚠️ 系统还没有管理员账户，请设置至少一个管理员'
    END as admin_check;

-- =====================================
-- 测试 6：权限验证模拟
-- =====================================
SELECT '========== 测试 6：权限说明 ==========' as test_section;

-- 显示各角色的权限说明
SELECT
    'admin' as role,
    '👑 管理员' as role_name,
    '完全访问权限：可以管理用户、站点、查看所有数据、执行所有操作' as permissions
UNION ALL
SELECT
    'manager' as role,
    '👤 经理' as role_name,
    '管理权限：可以管理站点、同步数据、查看审计日志，但不能管理用户' as permissions
UNION ALL
SELECT
    'viewer' as role,
    '👁️ 查看者' as role_name,
    '只读权限：只能查看数据，不能进行任何修改操作' as permissions
ORDER BY
    CASE role
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'viewer' THEN 3
    END;

-- =====================================
-- 测试 7：最近活动
-- =====================================
SELECT '========== 测试 7：最近活动 ==========' as test_section;

-- 显示最近登录的用户
SELECT
    pu.email,
    pu.role,
    pu.last_login,
    CASE
        WHEN pu.last_login IS NULL THEN '从未登录'
        WHEN pu.last_login > NOW() - INTERVAL '1 day' THEN '今天'
        WHEN pu.last_login > NOW() - INTERVAL '7 days' THEN '本周'
        WHEN pu.last_login > NOW() - INTERVAL '30 days' THEN '本月'
        ELSE '超过一个月'
    END as last_login_period
FROM public.users pu
ORDER BY pu.last_login DESC NULLS LAST
LIMIT 10;

-- =====================================
-- 测试总结
-- =====================================
SELECT '========== 测试总结 ==========' as test_section;

WITH summary AS (
    SELECT
        (SELECT COUNT(*) FROM auth.users) as total_auth_users,
        (SELECT COUNT(*) FROM public.users) as total_public_users,
        (SELECT COUNT(*) FROM public.users WHERE role = 'admin') as admin_count,
        (SELECT COUNT(*) FROM public.users WHERE role = 'manager') as manager_count,
        (SELECT COUNT(*) FROM public.users WHERE role = 'viewer') as viewer_count,
        (SELECT COUNT(*) FROM public.audit_logs) as audit_log_count
)
SELECT
    '📊 系统状态摘要' as summary_title,
    total_auth_users || ' 个认证用户' as auth_users,
    total_public_users || ' 个系统用户' as system_users,
    admin_count || ' 个管理员' as admins,
    manager_count || ' 个经理' as managers,
    viewer_count || ' 个查看者' as viewers,
    audit_log_count || ' 条审计日志' as audit_logs,
    CASE
        WHEN total_auth_users = total_public_users THEN '✅ 用户数据同步正常'
        ELSE '⚠️ 用户数据需要同步'
    END as sync_status,
    CASE
        WHEN admin_count > 0 THEN '✅ 管理员已设置'
        ELSE '❌ 需要设置管理员'
    END as admin_status
FROM summary;

-- =====================================
-- 建议的后续操作
-- =====================================
SELECT '========== 建议的后续操作 ==========' as test_section;

SELECT
    CASE
        WHEN NOT EXISTS (SELECT 1 FROM auth.users)
        THEN '1. 在 Supabase Dashboard 中创建第一个用户'
        WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE role = 'admin')
        THEN '2. 执行 create_admin_user.sql 设置管理员'
        ELSE '✅ 系统已准备就绪，可以开始使用'
    END as next_step;