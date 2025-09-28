-- ========================================
-- 完整的用户权限系统设置脚本
-- 请按顺序在 Supabase SQL 编辑器中执行
-- ========================================

-- =====================================
-- 第1部分：执行迁移脚本创建表结构
-- =====================================
-- 注意：如果表已存在会跳过创建

-- 1.1 创建 public.users 表（存储用户角色和业务信息）
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 1.2 创建审计日志表
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.3 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- =====================================
-- 第2部分：创建自动同步触发器
-- =====================================

-- 2.1 创建函数：新用户注册时自动创建 public.users 记录
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, created_at)
  VALUES (
    new.id,
    new.email,
    'viewer',  -- 默认角色为 viewer
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- 如果已存在则跳过
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2 创建触发器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================
-- 第3部分：启用行级安全策略 (RLS)
-- =====================================

-- 3.1 启用 RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3.2 创建策略：用户可以查看自己的信息，管理员可以查看所有
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- 3.3 创建策略：只有管理员可以更新用户信息
DROP POLICY IF EXISTS "Only admins can update users" ON public.users;
CREATE POLICY "Only admins can update users" ON public.users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- 3.4 创建策略：审计日志只读
DROP POLICY IF EXISTS "View audit logs based on role" ON public.audit_logs;
CREATE POLICY "View audit logs based on role" ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'manager')
    )
  );

-- =====================================
-- 第4部分：同步现有用户（如果有）
-- =====================================

-- 4.1 将 auth.users 中的现有用户同步到 public.users
INSERT INTO public.users (id, email, role, created_at)
SELECT
  id,
  email,
  'viewer',  -- 默认角色
  created_at
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users)
ON CONFLICT (id) DO NOTHING;

-- =====================================
-- 第5部分：查看当前状态
-- =====================================

-- 5.1 查看所有用户及其角色
SELECT
    'Current Users:' as info,
    COUNT(*) as total_users
FROM auth.users;

SELECT
    au.id,
    au.email,
    pu.role,
    pu.is_active,
    au.created_at,
    pu.last_login
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
ORDER BY au.created_at DESC;

-- =====================================
-- 第6部分：设置管理员（需要先创建用户）
-- =====================================

-- 注意：请先在 Supabase Dashboard 中创建用户，然后执行以下命令

-- 6.1 将指定邮箱的用户设为管理员
-- 请将 'admin@example.com' 替换为您的实际邮箱
/*
UPDATE public.users
SET role = 'admin'
WHERE email = 'admin@example.com';
*/

-- 或者使用 UPSERT（如果记录不存在则创建）
/*
INSERT INTO public.users (id, email, role, created_at)
SELECT id, email, 'admin', NOW()
FROM auth.users
WHERE email = 'admin@example.com'
ON CONFLICT (id)
DO UPDATE SET role = 'admin';
*/

-- =====================================
-- 第7部分：验证脚本
-- =====================================

-- 7.1 检查表是否创建成功
SELECT
    schemaname,
    tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('users', 'audit_logs')
ORDER BY tablename;

-- 7.2 检查触发器是否创建成功
SELECT
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name = 'on_auth_user_created';

-- 7.3 检查 RLS 策略
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'audit_logs');

-- =====================================
-- 输出信息
-- =====================================
SELECT '✅ 权限系统表结构创建完成！' as status;
SELECT '⚠️ 下一步：' as next_steps;
SELECT '1. 在 Supabase Dashboard > Authentication > Users 中创建用户' as step1;
SELECT '2. 执行第6部分的命令设置管理员角色' as step2;
SELECT '3. 使用管理员账户登录应用进行测试' as step3;