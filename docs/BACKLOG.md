# 项目交付待办清单

## 待实现功能

### 1. 氚云 API 重试机制

**优先级**: 中

**问题描述**:
调用氚云 API 拉取 ERP 数据时，偶发网络连接被服务器关闭的错误：
```
[TypeError: terminated]
[cause]: [Error [SocketError]: other side closed]
code: 'UND_ERR_SOCKET'
```

**解决方案**:
在 H3Yun client 中添加自动重试机制：

```typescript
// 伪代码
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.log(`[H3Yun] 请求失败，${attempt}/${maxRetries} 次重试...`);
      await sleep(1000 * attempt); // 指数退避
    }
  }
}
```

**相关文件**: `src/lib/h3yun/client.ts`

---

### 2. 批次号按整轮同步生成

**优先级**: 低

**当前问题**:
- 每个站点的批次号是独立的随机 ID（如 `a1b2c3d4`）
- 无法标识哪些站点属于同一轮同步

**解决方案**:
用时间窗口定义批次号，同一小时内的所有站点同步属于同一批次：

```
批次号格式: YYYYMMDD-HH (北京时间)
例如: 20260106-08 表示 2026年1月6日 08:00 这一轮同步
```

**实现**:
```typescript
// 生成批次号（北京时间的小时）
const now = new Date();
const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
const batchId = beijingTime.toISOString().slice(0, 13).replace(/[-T:]/g, '').slice(0, 10);
// 结果: "2026010608"
```

**相关文件**: `src/app/api/sync/single-site/route.ts`

---

### 3. 前端展示版本号

**优先级**: 低

**需求描述**:
在前端页面展示当前部署的版本号，方便确认部署状态和问题排查。

**实现方案**:
1. 在构建时注入 Git commit hash 或版本号到环境变量
2. 在页面底部或设置页面展示版本信息

```typescript
// next.config.js
const { execSync } = require('child_process');
const commitHash = execSync('git rev-parse --short HEAD').toString().trim();

module.exports = {
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};
```

**展示位置**: 页面底部或自动同步配置页

---

---

## 已完成功能

### 动态 Slot 调度器（槽位调度 / 间接寻址模式）
- **完成日期**: 2026-01-06
- **描述**: Cron 任务从硬编码 site_id 改为动态 slot 分配。slot 参数指定槽位序号，系统自动查询启用且在配置列表中的站点，按 `created_at` 排序后分配到对应槽位。新增站点只需在页面勾选，无需修改代码。
- **相关文件**: `src/app/api/sync/single-site/route.ts`, `vercel.json`

**技术原理**：槽位调度（Slot-based Scheduling）/ 间接寻址（Indirect Addressing）

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────┐
│  vercel.json    │      │    代码逻辑       │      │   数据库     │
│  (静态配置)      │      │   (动态解析)      │      │  (实时查询)  │
├─────────────────┤      ├──────────────────┤      ├─────────────┤
│ slot=0 → :00   │ ──→  │ 查库: 第1个站点   │ ──→  │ 站点 A      │
│ slot=1 → :05   │ ──→  │ 查库: 第2个站点   │ ──→  │ 站点 C      │
│ slot=2 → :10   │ ──→  │ 查库: 第3个站点   │ ──→  │ 站点 D      │
│ slot=3 → :15   │ ──→  │ 查库: 超出范围    │ ──→  │ 跳过        │
│ ...            │      │                  │      │             │
└─────────────────┘      └──────────────────┘      └─────────────┘
```

**核心优势**：配置不变，行为可变
- 新增站点：页面勾选即可，无需修改代码
- 删除站点：取消勾选，后续槽位自动前移，不留空位
- 类似设计：DNS 解析、负载均衡、消息队列消费者分配

### Cron 任务尊重页面勾选配置
- **完成日期**: 2026-01-05
- **描述**: Cron 任务现在检查 `auto_sync_config.site_ids`，未勾选的站点会被跳过
- **相关文件**: `src/app/api/sync/single-site/route.ts`

### Cron 任务每小时错峰运行
- **完成日期**: 2026-01-05
- **描述**: 将 Cron 从每天一次改为每小时一次，每个站点错峰 5 分钟
- **相关文件**: `vercel.json`, `src/app/auto-sync/page.tsx`