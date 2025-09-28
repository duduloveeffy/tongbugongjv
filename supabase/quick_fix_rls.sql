-- ========================================
-- 快速修复 RLS 策略问题
-- ========================================

-- 1. 临时禁用RLS（先让系统能运行）
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wc_sites DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;

-- 2. 确保用户角色设置正确
UPDATE public.users
SET role = 'admin'
WHERE email = 'rex@vapsolo.com';

-- 3. 查看结果
SELECT
    'RLS已禁用，系统现在应该可以正常工作' as message,
    email,
    role
FROM public.users
WHERE email = 'rex@vapsolo.com';

-- ========================================
-- 稍后可以重新启用RLS（使用正确的策略）
-- ========================================
-- 以下命令用于以后重新启用RLS：
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.wc_sites ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;