# 🔐 用户权限系统设置指南

## 📋 概述

本系统使用 Supabase Auth 进行身份验证，配合自定义的角色权限系统实现细粒度的访问控制。

## 🏗️ 系统架构

### 双表结构
- **`auth.users`** - Supabase 内置表，管理认证信息
- **`public.users`** - 自定义表，管理角色和业务信息

### 角色类型
- **👑 admin（管理员）** - 完全访问权限
- **👤 manager（经理）** - 管理站点和数据，不能管理用户
- **👁️ viewer（查看者）** - 只读权限（默认角色）

## 🚀 快速设置步骤

### 第 1 步：执行数据库迁移
在 Supabase SQL 编辑器中执行：

```bash
# 文件位置
supabase/setup_auth_system.sql
```

这个脚本会：
- ✅ 创建 `public.users` 表
- ✅ 创建审计日志表
- ✅ 设置触发器自动同步用户
- ✅ 配置行级安全策略（RLS）

### 第 2 步：创建第一个用户

#### 方法 A：通过 Supabase Dashboard（推荐）
1. 进入 **Supabase Dashboard**
2. 导航到 **Authentication → Users**
3. 点击 **"Invite User"** 或 **"Add User"**
4. 输入邮箱和密码
5. 点击创建

#### 方法 B：通过应用注册
1. 访问 `http://localhost:3000/register`
2. 填写注册表单
3. 确认邮箱（如果启用了邮箱验证）

### 第 3 步：设置管理员权限

在 SQL 编辑器中执行：

```bash
# 文件位置
supabase/create_admin_user.sql
```

**重要**：修改脚本中的邮箱地址：
```sql
-- 将这行的邮箱改为您的实际邮箱
admin_email TEXT := 'your-email@example.com';
```

### 第 4 步：验证设置

执行测试脚本：

```bash
# 文件位置
supabase/test_auth_system.sql
```

这会检查：
- 表结构是否正确
- 触发器是否工作
- RLS 策略是否启用
- 用户同步状态
- 管理员是否已设置

## 📁 SQL 脚本文件说明

| 文件名 | 用途 | 执行顺序 |
|--------|------|----------|
| `setup_auth_system.sql` | 创建完整的权限系统 | 1️⃣ |
| `create_admin_user.sql` | 设置管理员账户 | 2️⃣ |
| `test_auth_system.sql` | 测试和验证系统 | 3️⃣ |

## 🔧 常用 SQL 命令

### 查看所有用户及权限
```sql
SELECT
    au.email,
    pu.role,
    pu.is_active,
    au.created_at
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
ORDER BY au.created_at DESC;
```

### 修改用户角色
```sql
-- 设为管理员
UPDATE public.users
SET role = 'admin'
WHERE email = 'user@example.com';

-- 设为经理
UPDATE public.users
SET role = 'manager'
WHERE email = 'user@example.com';

-- 设为查看者
UPDATE public.users
SET role = 'viewer'
WHERE email = 'user@example.com';
```

### 查看角色分布
```sql
SELECT role, COUNT(*) as count
FROM public.users
GROUP BY role;
```

## 🛠️ 故障排除

### 问题 1：`public.users` 表不存在
**解决**：执行 `setup_auth_system.sql`

### 问题 2：用户登录后显示 "viewer" 角色
**解决**：执行 `create_admin_user.sql` 设置正确的角色

### 问题 3：新注册用户没有同步到 `public.users`
**解决**：检查触发器是否正确创建
```sql
SELECT * FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

### 问题 4：忘记管理员密码
**解决**：在 Supabase Dashboard 中重置密码

## 📊 权限矩阵

| 功能 | Admin | Manager | Viewer |
|------|-------|---------|--------|
| 查看库存数据 | ✅ | ✅ | ✅ |
| 查看销量数据 | ✅ | ✅ | ✅ |
| 管理站点配置 | ✅ | ✅ | ❌ |
| 同步数据 | ✅ | ✅ | ❌ |
| 管理用户 | ✅ | ❌ | ❌ |
| 查看审计日志 | ✅ | ✅ | ❌ |
| 修改系统设置 | ✅ | ❌ | ❌ |

## 🔒 安全注意事项

1. **生产环境**：
   - 启用邮箱验证
   - 使用强密码策略
   - 定期审查用户权限
   - 监控审计日志

2. **API 密钥**：
   - 永远不要在前端暴露 Service Role Key
   - 使用环境变量存储敏感信息
   - 定期轮换密钥

3. **权限最小化**：
   - 新用户默认为 viewer 角色
   - 只授予必要的权限
   - 定期审核管理员账户

## 📝 环境变量配置

在 `.env.local` 中配置：

```env
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 加密密钥（32字符）
ENCRYPTION_KEY=your-32-character-encryption-key

# Redis 配置（用于速率限制）
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

## 🚦 测试登录

1. 启动开发服务器：
```bash
npm run dev
```

2. 访问登录页面：
```
http://localhost:3000/login
```

3. 使用管理员账户登录

4. 验证功能访问权限

## 📚 相关文档

- [Supabase Auth 文档](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)

## ✅ 设置完成检查清单

- [ ] 执行 `setup_auth_system.sql`
- [ ] 在 Supabase 创建用户
- [ ] 执行 `create_admin_user.sql` 设置管理员
- [ ] 执行 `test_auth_system.sql` 验证
- [ ] 配置环境变量
- [ ] 测试登录功能
- [ ] 验证权限控制

---

💡 **提示**：完成设置后，建议立即更改默认管理员密码并启用双因素认证。