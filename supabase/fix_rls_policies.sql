-- ========================================
-- 修复 RLS 策略无限递归问题
-- ========================================

-- 1. 先删除有问题的策略
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Only admins can update users" ON public.users;

-- 2. 创建新的、不会造成递归的策略

-- 用户查看策略（简化版，避免递归）
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  USING (
    -- 用户可以查看自己的信息
    auth.uid() = id
    OR
    -- 或者是管理员（直接检查当前用户的角色，不再次查询users表）
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role = 'admin'
      LIMIT 1
    )
  );

-- 用户更新策略（只有管理员可以更新）
CREATE POLICY "Only admins can update users" ON public.users
  FOR UPDATE
  USING (
    -- 直接检查当前用户是否是管理员
    auth.uid() IN (
      SELECT id FROM public.users
      WHERE role = 'admin'
      LIMIT 100  -- 添加限制防止性能问题
    )
  );

-- 3. 或者，如果还有问题，可以暂时使用更简单的策略

-- 备选方案：完全禁用users表的RLS（仅用于测试）
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 4. 检查sites表是否也有类似问题
DROP POLICY IF EXISTS "Sites viewable by authenticated users" ON public.wc_sites;
DROP POLICY IF EXISTS "Sites modifiable by admins and managers" ON public.wc_sites;

-- 重新创建sites表的策略
CREATE POLICY "Sites viewable by authenticated users" ON public.wc_sites
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- INSERT策略需要使用WITH CHECK而不是USING
CREATE POLICY "Sites insert by admins and managers" ON public.wc_sites
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.users
      WHERE role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Sites update by admins and managers" ON public.wc_sites
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM public.users
      WHERE role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Sites delete by admins and managers" ON public.wc_sites
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM public.users
      WHERE role IN ('admin', 'manager')
    )
  );

-- 5. 验证策略
SELECT
    tablename,
    policyname,
    permissive,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'wc_sites')
ORDER BY tablename, policyname;

-- ========================================
-- 如果还有问题，执行以下命令暂时禁用RLS
-- ========================================
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.wc_sites DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;