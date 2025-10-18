# 氚云 ERP 环境变量配置指南

## 概述

从版本 2.0 开始，氚云 ERP 集成已迁移为使用服务器端环境变量配置，不再需要在前端界面手动输入 API 凭证。

### 优势

- ✅ **安全性**：API 密钥不暴露在前端代码或浏览器中
- ✅ **便捷性**：配置一次，永久生效
- ✅ **易维护**：集中管理所有配置

## 配置步骤

### 1. 获取氚云 API 凭证

登录您的氚云账户，获取以下信息：

#### Engine Code (引擎代码)
- 位置：氚云管理后台 → 系统设置 → 开放接口
- 格式示例：`t4yq7mzi2zpe1rnn6etflbvm0`

#### Engine Secret (引擎密钥)
- 位置：氚云管理后台 → 系统设置 → 开放接口
- 格式示例：`dbdrlWeVK9U1WkIJ***`（保密）

#### Inventory Schema Code (库存表单编码)
- 位置：氚云管理后台 → 表单设计 → 库存表 → 表单设置 → 表单编码
- 格式示例：`sirxt5xvsfeuamv3c2kdg`

#### Warehouse Schema Code (仓库表单编码)
- 位置：氚云管理后台 → 表单设计 → 仓库表 → 表单设置 → 表单编码
- 默认值：`svsphqmtteooobudbgy`
- 如果您的仓库表使用不同的编码，请替换此值

### 2. 配置环境变量

#### 方法一：使用 `.env.local` 文件（推荐）

1. 在项目根目录创建 `.env.local` 文件（如果不存在）：

```bash
cp .env.example .env.local
```

2. 编辑 `.env.local`，添加以下配置：

```bash
# 氚云 ERP 配置
H3YUN_ENGINE_CODE=your_actual_engine_code
H3YUN_ENGINE_SECRET=your_actual_engine_secret
H3YUN_INVENTORY_SCHEMA_CODE=your_actual_inventory_schema_code
H3YUN_WAREHOUSE_SCHEMA_CODE=svsphqmtteooobudbgy
```

3. 替换上面的 `your_actual_*` 为您的实际值

#### 方法二：使用系统环境变量

如果您使用 Docker 或云服务器部署，可以直接设置系统环境变量：

```bash
export H3YUN_ENGINE_CODE=your_actual_engine_code
export H3YUN_ENGINE_SECRET=your_actual_engine_secret
export H3YUN_INVENTORY_SCHEMA_CODE=your_actual_inventory_schema_code
export H3YUN_WAREHOUSE_SCHEMA_CODE=svsphqmtteooobudbgy
```

### 3. 验证配置

#### 方法一：启动开发服务器

```bash
npm run dev
```

如果配置正确，应用应该正常启动。如果缺少必需的环境变量，会看到类似错误：

```
❌ Invalid environment variables:
  H3YUN_ENGINE_CODE: Required
  H3YUN_ENGINE_SECRET: Required
```

#### 方法二：在前端查看配置状态

1. 访问 `http://localhost:3000/inventory`
2. 查看"氚云 ERP 同步"卡片
3. 应该看到配置信息（脱敏显示）：
   - ✅ Engine Code: t4yq***
   - ✅ Engine Secret: dbdr***
   - ✅ 库存表: sirx***
   - ✅ 仓库表: svsp***
   - ✅ 氚云 ERP 已配置

## 使用方法

配置完成后，使用非常简单：

1. 打开应用的"库存管理"页面
2. 点击"氚云 ERP 同步"卡片中的 **"同步库存"** 按钮
3. 等待同步完成

无需手动输入任何配置！

## 常见问题

### Q1: 配置信息会暴露给用户吗？

**A**: 不会。前端只能看到脱敏后的配置（只显示前 4 位），完整的 API 密钥仅存在于服务器端。

### Q2: 如何更新配置？

**A**: 修改 `.env.local` 文件后，重启开发服务器即可：

```bash
# 停止服务器 (Ctrl+C)
# 重新启动
npm run dev
```

### Q3: 生产环境如何配置？

**A**: 在您的部署平台（Vercel、Railway、Docker等）的环境变量设置中添加这 4 个环境变量。

例如在 Vercel：
1. 进入项目设置 → Environment Variables
2. 添加 `H3YUN_ENGINE_CODE`、`H3YUN_ENGINE_SECRET` 等
3. 重新部署

### Q4: 为什么配置显示"配置未完成"？

**A**: 可能的原因：
1. `.env.local` 文件不存在或格式错误
2. 环境变量名称拼写错误（区分大小写）
3. 忘记重启开发服务器
4. 环境变量值中包含特殊字符，需要用引号包裹：
   ```bash
   H3YUN_ENGINE_SECRET="your_secret_with_special_chars"
   ```

### Q5: 可以在前端手动输入配置吗？

**A**: 不可以。为了安全考虑，配置已完全迁移到环境变量。如需修改，请更新 `.env.local` 文件。

### Q6: 仓库名称显示为 ID 怎么办？

**A**: 系统会自动从氚云仓库表查询仓库名称。如果仍然显示 ID：
1. 检查 `H3YUN_WAREHOUSE_SCHEMA_CODE` 是否正确
2. 确认该仓库 ID 在氚云仓库表中存在
3. 查看后端日志，确认仓库名称查询是否成功

## 技术细节

### 环境变量验证

应用使用 `@t3-oss/env-nextjs` 和 Zod 进行环境变量验证：

```typescript
// src/env.js
server: {
  H3YUN_ENGINE_CODE: z.string(),
  H3YUN_ENGINE_SECRET: z.string(),
  H3YUN_INVENTORY_SCHEMA_CODE: z.string(),
  H3YUN_WAREHOUSE_SCHEMA_CODE: z.string().default('svsphqmtteooobudbgy'),
}
```

### 配置API端点

- `GET /api/h3yun/config` - 返回脱敏的配置信息供前端显示
- `POST /api/h3yun/test` - 测试氚云连接
- `POST /api/h3yun/inventory` - 同步库存数据

### 数据流

```
环境变量 (.env.local)
    ↓
服务器端 (env.js 验证)
    ↓
API Routes (读取配置)
    ↓
氚云 API (调用)
    ↓
前端 (显示脱敏配置 + 同步结果)
```

## 安全建议

1. **永远不要提交 `.env.local` 到 Git**
   - 已在 `.gitignore` 中配置忽略

2. **定期更换 Engine Secret**
   - 在氚云后台重新生成密钥
   - 更新 `.env.local`
   - 重启服务器

3. **限制 API 权限**
   - 在氚云后台只授予必要的权限
   - 建议只读权限（如果只需要同步数据）

4. **监控 API 使用**
   - 在氚云后台查看 API 调用日志
   - 发现异常及时更换密钥

## 迁移指南

如果您从旧版本（前端配置）升级：

1. **备份现有配置**
   - 从浏览器 localStorage 或界面记录配置值

2. **创建 `.env.local`**
   - 使用上面的步骤 2 配置

3. **清除浏览器缓存**
   - 旧的 localStorage 配置已不再使用
   - 按 F12 → Application → Local Storage → 清除 `h3yun-storage`

4. **重启服务器**
   ```bash
   npm run dev
   ```

5. **测试同步**
   - 点击"同步库存"确认工作正常

## 获取帮助

如遇问题，请查看：
- 后端日志（Terminal 输出）
- 浏览器控制台（F12）
- 氚云 API 调用日志（氚云后台）

或联系技术支持。
