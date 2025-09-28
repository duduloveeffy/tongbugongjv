-- ========================================
-- 强制禁用所有RLS（分步执行）
-- ========================================

-- 1. 首先删除所有策略（这是RLS启用的根本原因）
-- 删除users表的所有策略
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Only admins can update users" ON public.users;
DROP POLICY IF EXISTS "View audit logs based on role" ON public.users;

-- 删除wc_sites表的所有策略
DROP POLICY IF EXISTS "Sites viewable by authenticated users" ON public.wc_sites;
DROP POLICY IF EXISTS "Sites modifiable by admins and managers" ON public.wc_sites;
DROP POLICY IF EXISTS "Sites insert by admins and managers" ON public.wc_sites;
DROP POLICY IF EXISTS "Sites update by admins and managers" ON public.wc_sites;
DROP POLICY IF EXISTS "Sites delete by admins and managers" ON public.wc_sites;

-- 删除audit_logs表的所有策略
DROP POLICY IF EXISTS "View audit logs based on role" ON public.audit_logs;

-- 删除api_keys表的所有策略（如果有）
DROP POLICY IF EXISTS "API keys access control" ON public.api_keys;

-- 2. 现在禁用RLS（一个一个执行确保成功）
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wc_sites DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys DISABLE ROW LEVEL SECURITY;

-- 3. 验证结果
SELECT
    tablename,
    CASE rowsecurity
        WHEN false THEN '✅ RLS 已成功禁用'
        WHEN true THEN '❌ RLS 仍然启用（需要进一步处理）'
    END as status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('users', 'wc_sites', 'audit_logs', 'api_keys')
ORDER BY tablename;

-- 4. 确认没有任何策略存在
SELECT
    '检查策略' as check_type,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'wc_sites', 'audit_logs', 'api_keys');

-- 5. 检查站点数据
SELECT
    '站点数据' as data_type,
    COUNT(*) as count
FROM public.wc_sites;

-- 6. 如果还有问题，显示详细的策略信息
SELECT
    tablename,
    policyname,
    cmd,
    permissive
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'wc_sites', 'audit_logs', 'api_keys')
LIMIT 10;

-- 最终消息
SELECT '✅ 请刷新页面，现在应该可以看到站点了' as message;