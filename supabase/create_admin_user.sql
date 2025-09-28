-- ========================================
-- 创建管理员用户脚本
-- 在 Supabase Dashboard 创建用户后执行
-- ========================================

-- =====================================
-- 步骤 1：检查现有用户
-- =====================================

-- 查看 auth.users 中的所有用户
SELECT
    id,
    email,
    created_at,
    last_sign_in_at,
    email_confirmed_at,
    CASE
        WHEN email_confirmed_at IS NULL THEN '❌ 未验证'
        ELSE '✅ 已验证'
    END as email_status
FROM auth.users
ORDER BY created_at DESC;

-- 查看 public.users 中的用户及角色
SELECT
    pu.id,
    pu.email,
    pu.role,
    pu.is_active,
    pu.created_at,
    pu.last_login,
    CASE pu.role
        WHEN 'admin' THEN '👑 管理员'
        WHEN 'manager' THEN '👤 经理'
        WHEN 'viewer' THEN '👁️ 查看者'
        ELSE pu.role
    END as role_display
FROM public.users pu
ORDER BY pu.created_at DESC;

-- =====================================
-- 步骤 2：设置管理员账户
-- =====================================

-- 方法1：更新现有用户为管理员
-- 请将 'your-email@example.com' 替换为实际的管理员邮箱
DO $$
DECLARE
    admin_email TEXT := 'your-email@example.com';  -- <<<< 修改这里
    user_exists BOOLEAN;
    user_id UUID;
BEGIN
    -- 检查用户是否存在于 auth.users
    SELECT EXISTS(
        SELECT 1 FROM auth.users WHERE email = admin_email
    ) INTO user_exists;

    IF NOT user_exists THEN
        RAISE NOTICE '⚠️ 用户 % 不存在于 auth.users 表中', admin_email;
        RAISE NOTICE '请先在 Supabase Dashboard > Authentication > Users 中创建用户';
        RETURN;
    END IF;

    -- 获取用户ID
    SELECT id INTO user_id FROM auth.users WHERE email = admin_email;

    -- 确保用户存在于 public.users 表
    INSERT INTO public.users (id, email, role, created_at)
    VALUES (user_id, admin_email, 'admin', NOW())
    ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        last_login = CASE
            WHEN public.users.role != 'admin' THEN NOW()
            ELSE public.users.last_login
        END;

    RAISE NOTICE '✅ 用户 % 已成功设置为管理员', admin_email;
END $$;

-- =====================================
-- 步骤 3：批量设置多个管理员（可选）
-- =====================================

-- 如果需要设置多个管理员，使用此方法
/*
WITH admin_emails AS (
    SELECT unnest(ARRAY[
        'admin1@example.com',
        'admin2@example.com',
        'admin3@example.com'
    ]) AS email
)
UPDATE public.users
SET role = 'admin'
WHERE email IN (SELECT email FROM admin_emails)
RETURNING email, role;
*/

-- =====================================
-- 步骤 4：设置其他角色（可选）
-- =====================================

-- 设置经理角色
/*
UPDATE public.users
SET role = 'manager'
WHERE email IN ('manager1@example.com', 'manager2@example.com');
*/

-- 重置为普通查看者
/*
UPDATE public.users
SET role = 'viewer'
WHERE email = 'user@example.com';
*/

-- =====================================
-- 步骤 5：验证设置结果
-- =====================================

-- 查看所有用户的完整信息
SELECT
    au.email,
    pu.role,
    CASE pu.role
        WHEN 'admin' THEN '👑 管理员 - 完全访问权限'
        WHEN 'manager' THEN '👤 经理 - 管理权限'
        WHEN 'viewer' THEN '👁️ 查看者 - 只读权限'
        ELSE '❓ 未设置角色'
    END as permissions,
    au.created_at as registered_at,
    pu.last_login,
    pu.is_active,
    CASE
        WHEN au.email_confirmed_at IS NULL THEN '⚠️ 邮箱未验证'
        ELSE '✅ 邮箱已验证'
    END as status
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
ORDER BY
    CASE pu.role
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'viewer' THEN 3
        ELSE 4
    END,
    au.created_at DESC;

-- =====================================
-- 步骤 6：统计信息
-- =====================================

-- 角色分布统计
SELECT
    role,
    COUNT(*) as user_count,
    CASE role
        WHEN 'admin' THEN '管理员'
        WHEN 'manager' THEN '经理'
        WHEN 'viewer' THEN '查看者'
    END as role_name
FROM public.users
GROUP BY role
ORDER BY
    CASE role
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'viewer' THEN 3
    END;

-- 系统状态摘要
SELECT
    (SELECT COUNT(*) FROM auth.users) as total_auth_users,
    (SELECT COUNT(*) FROM public.users) as total_public_users,
    (SELECT COUNT(*) FROM public.users WHERE role = 'admin') as admin_count,
    (SELECT COUNT(*) FROM public.users WHERE role = 'manager') as manager_count,
    (SELECT COUNT(*) FROM public.users WHERE role = 'viewer') as viewer_count,
    (SELECT COUNT(*) FROM public.users WHERE is_active = true) as active_users;

-- =====================================
-- 输出最终状态
-- =====================================
SELECT '✅ 管理员设置脚本执行完成' as status;
SELECT '📋 请检查上面的输出确认管理员已正确设置' as note;