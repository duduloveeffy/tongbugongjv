-- ========================================
-- 完整修复 RLS 和站点数据问题
-- ========================================

-- 步骤1: 查看当前所有启用了RLS的表
SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = true;

-- 步骤2: 禁用所有相关表的RLS
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wc_sites DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;

-- 检查是否有api_keys表并禁用其RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
        ALTER TABLE public.api_keys DISABLE ROW LEVEL SECURITY;
        RAISE NOTICE '✅ 已禁用 api_keys 表的 RLS';
    END IF;
END $$;

-- 步骤3: 确保用户角色设置正确
UPDATE public.users
SET role = 'admin'
WHERE email = 'rex@vapsolo.com';

-- 显示用户信息
SELECT
    '用户权限设置' as info_type,
    email,
    role,
    is_active,
    last_login
FROM public.users
WHERE email = 'rex@vapsolo.com';

-- 步骤4: 检查wc_sites表中的数据
SELECT
    '站点数据检查' as info_type,
    COUNT(*) as site_count
FROM public.wc_sites;

-- 显示所有站点（如果有）
SELECT
    id,
    name,
    url,
    enabled,
    created_at,
    last_sync_at
FROM public.wc_sites
ORDER BY created_at DESC;

-- 步骤5: 如果没有站点数据，插入示例数据（可选）
-- 取消注释以下代码来添加示例站点
/*
INSERT INTO public.wc_sites (name, url, api_key, api_secret, enabled, created_at)
VALUES
    ('示例商店', 'https://example-store.com', 'ck_example', 'cs_example', true, NOW())
ON CONFLICT (name) DO NOTHING;
*/

-- 步骤6: 验证所有表的RLS状态
SELECT
    '最终RLS状态' as check_type,
    tablename,
    CASE rowsecurity
        WHEN true THEN '⚠️ RLS 启用'
        WHEN false THEN '✅ RLS 已禁用'
    END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('users', 'wc_sites', 'audit_logs', 'api_keys')
ORDER BY tablename;

-- 步骤7: 显示最终结果摘要
SELECT
    '========== 修复完成摘要 ==========' as summary;

SELECT
    (SELECT COUNT(*) FROM public.users WHERE role = 'admin') as admin_users,
    (SELECT COUNT(*) FROM public.wc_sites) as total_sites,
    (SELECT COUNT(*) FROM public.wc_sites WHERE enabled = true) as enabled_sites,
    (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) as tables_with_rls;

-- 最终提示
SELECT
    '✅ RLS已禁用，请刷新页面查看站点数据' as final_message
UNION ALL
SELECT
    '📝 如果还是没有站点，请使用"添加站点"功能添加新站点' as hint;