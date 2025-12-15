# Supabase 完整设置指南

## 概述

本指南将帮助你在新的 Supabase 项目中完整复制原有数据库结构。

---

## 第一步：注册 Supabase 并创建项目

1. 访问 https://supabase.com
2. 使用 GitHub 或邮箱注册
3. 点击 "New Project"
4. 填写项目信息：
   - **Project Name**: `vapsolo-erp` (或你喜欢的名字)
   - **Database Password**: 设置一个强密码（记住它！）
   - **Region**: 选择离你最近的区域
5. 等待项目创建完成（约 2 分钟）

---

## 第二步：获取 API 凭据

1. 进入项目 Dashboard
2. 点击左侧 **Settings** (齿轮图标)
3. 点击 **API**
4. 复制以下信息：

```
Project URL:        https://xxxxxx.supabase.co
anon public key:    eyJhbGciOiJIUzI1NiIs...
service_role key:   eyJhbGciOiJIUzI1NiIs...  (点击 Reveal 查看)
```

---

## 第三步：更新本地 .env.local 文件

将 `.env.local` 中的以下内容替换为你的新凭据：

```bash
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://你的项目ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon_key
SUPABASE_SERVICE_ROLE_KEY=你的service_role_key
```

---

## 第四步：创建数据库表结构

### 4.1 进入 SQL 编辑器

1. 在 Supabase Dashboard 左侧菜单点击 **SQL Editor**
2. 点击 **New query**

### 4.2 执行 SQL 脚本（按顺序执行）

请按以下顺序依次执行 SQL 文件。每个文件复制全部内容到 SQL Editor，点击 **Run** 执行。

---

### 脚本 1：基础表结构 (schema.sql)

执行 `supabase/schema.sql` - 创建核心表：
- `wc_sites` - WooCommerce 站点配置
- `sales_cache` - 销量缓存
- `sync_tasks` - 同步任务队列
- `sync_checkpoints` - 同步检查点
- `sync_metrics` - 同步指标
- `products_cache` - 产品缓存
- `stock_history` - 库存历史

---

### 脚本 2：扩展表结构 (schema-v2.sql)

执行 `supabase/schema-v2.sql` - 创建订单和产品完整数据表：
- `orders` - 完整订单数据
- `order_items` - 订单行项目
- `products` - 完整产品目录
- `product_variations` - 产品变体
- `sync_checkpoints_v2` - 增量同步跟踪
- `sync_logs` - 同步日志
- `webhook_endpoints` - Webhook 配置
- `webhook_events` - Webhook 事件日志
- `webhook_queue` - Webhook 重试队列

---

### 脚本 3：用户权限系统 (setup_auth_system.sql)

执行 `supabase/setup_auth_system.sql` - 创建：
- `users` - 用户角色管理
- `audit_logs` - 审计日志
- 自动同步触发器
- RLS 安全策略

---

### 脚本 4：增强功能 (combined_migration_20251225.sql)

执行 `supabase/migrations/combined_migration_20251225.sql` - 添加：
- 订单支付信息字段
- 订单归因字段（营销来源追踪）
- 客户历史字段
- `wc_order_notes` - 订单备注
- `wc_customer_history` - 客户历史
- `wc_order_attribution_summary` - 订单归因汇总
- 销售分析函数

---

## 第五步：创建管理员用户

### 5.1 在 Supabase 创建用户

1. 左侧菜单点击 **Authentication**
2. 点击 **Users** 标签
3. 点击 **Add user** → **Create new user**
4. 填写邮箱和密码
5. 点击 **Create user**

### 5.2 设置管理员角色

在 SQL Editor 执行（将邮箱替换为你的）：

```sql
UPDATE public.users
SET role = 'admin'
WHERE email = '你的邮箱@example.com';
```

---

## 第六步：验证设置

在 SQL Editor 执行以下查询验证表是否创建成功：

```sql
-- 查看所有表
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 预期结果应包含以下表：
-- audit_logs
-- order_items
-- orders
-- product_variations
-- products
-- products_cache
-- sales_cache
-- stock_history
-- sync_checkpoints
-- sync_checkpoints_v2
-- sync_logs
-- sync_metrics
-- sync_tasks
-- users
-- wc_customer_history
-- wc_order_attribution_summary
-- wc_order_notes
-- wc_sites
-- webhook_endpoints
-- webhook_events
-- webhook_queue
```

---

## 第七步：添加 WooCommerce 站点

在应用中登录后，通过 UI 添加 WooCommerce 站点，或在 SQL Editor 手动添加：

```sql
INSERT INTO wc_sites (name, url, api_key, api_secret, enabled)
VALUES (
  '站点名称',
  'https://your-woocommerce-site.com',
  'ck_your_consumer_key',
  'cs_your_consumer_secret',
  true
);
```

---

## 常见问题

### Q1: 执行 SQL 时报错 "relation already exists"
这是正常的，说明表已经存在。脚本使用了 `IF NOT EXISTS`，可以安全地重复执行。

### Q2: 执行 schema-v2.sql 时报错 "relation wc_sites does not exist"
请确保先执行 schema.sql 创建基础表。

### Q3: RLS 策略导致无法访问数据
如果遇到权限问题，可以临时禁用 RLS（仅用于调试）：

```sql
ALTER TABLE wc_sites DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
```

### Q4: 如何查看表结构？
在 Supabase Dashboard 左侧点击 **Table Editor**，可以图形化查看所有表和数据。

---

## 文件清单

| 文件路径 | 用途 | 执行顺序 |
|---------|------|---------|
| `supabase/schema.sql` | 基础表结构 | 1 |
| `supabase/schema-v2.sql` | 订单和产品扩展表 | 2 |
| `supabase/setup_auth_system.sql` | 用户权限系统 | 3 |
| `supabase/migrations/combined_migration_20251225.sql` | 增强功能 | 4 |

---

## 完成！

完成以上步骤后，你的新 Supabase 项目将拥有与原项目完全相同的数据库结构。

重启应用 (`npm run dev`) 后即可使用新的 Supabase 项目。
