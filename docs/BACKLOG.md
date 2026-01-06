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

### 2. 动态 Cron 调度器

**优先级**: 低（项目交付最后阶段实现）

**当前问题**:
- 16 个站点的 Cron 任务硬编码在 `vercel.json` 中
- 新增站点需要修改代码并重新部署
- 无法动态调整同步频率

**解决方案**:

将多个固定 Cron 改为单一调度器模式：

```
当前架构:
vercel.json → 16个独立Cron → /api/sync/single-site?site_id=xxx

目标架构:
vercel.json → 1个Cron(每5分钟) → /api/sync/scheduler → 动态选择站点执行
```

**技术实现**:

1. **新建调度器 API**: `/api/sync/scheduler`
   - 查询数据库获取所有启用的站点
   - 根据 `last_sync_at` 找出最需要同步的站点
   - 调用 `/api/sync/single-site` 执行同步

2. **数据库字段**:
   - `sites.sync_interval`: 同步间隔（分钟）
   - `sites.last_sync_at`: 上次同步时间
   - `sites.sync_enabled`: 是否启用自动同步

3. **调度逻辑**:
   ```typescript
   // 伪代码
   const sites = await getSitesNeedingSync();
   // 筛选: sync_enabled = true AND (now - last_sync_at) > sync_interval
   const nextSite = sites.sort(by: last_sync_at ASC)[0];
   if (nextSite) {
     await triggerSingleSiteSync(nextSite.id);
   }
   ```

4. **vercel.json 简化**:
   ```json
   {
     "crons": [
       {
         "path": "/api/sync/scheduler",
         "schedule": "*/5 * * * *"
       }
     ]
   }
   ```

**优势**:
- 新增站点无需修改代码，只需在数据库添加记录
- 可动态调整每个站点的同步频率
- 自动负载均衡，避免同时触发多个同步
- 更易于监控和管理

**预估工作量**: 中等

**依赖**: 无

---

## 已完成功能

### Cron 任务尊重页面勾选配置
- **完成日期**: 2026-01-05
- **描述**: Cron 任务现在检查 `auto_sync_config.site_ids`，未勾选的站点会被跳过
- **相关文件**: `src/app/api/sync/single-site/route.ts`

### Cron 任务每小时错峰运行
- **完成日期**: 2026-01-05
- **描述**: 将 Cron 从每天一次改为每小时一次，每个站点错峰 5 分钟
- **相关文件**: `vercel.json`, `src/app/auto-sync/page.tsx`