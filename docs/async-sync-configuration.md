# 异步同步系统配置指南

## 概述

为了处理大数据量的WooCommerce站点同步（如16,000+订单），系统已升级为异步任务处理模式。

## 系统架构

### 1. 异步任务系统

- **启动端点**: `/api/sync/async/start`
- **状态查询**: `/api/sync/async/status`
- **任务存储**: `sync_tasks` 表

### 2. 超时配置

#### 前端请求超时
```javascript
// 启动同步任务 - 立即返回
POST /api/sync/async/start
Timeout: 30秒（仅用于启动任务）
```

#### 后台任务超时
```javascript
// 订单同步
AbortSignal.timeout(600000) // 10分钟
批次大小: 50（可配置）

// 产品同步  
AbortSignal.timeout(600000) // 10分钟
批次大小: 20（可配置）
```

### 3. 批处理策略

#### 订单同步
- **默认批次大小**: 50个订单
- **小站点** (<1000订单): 批次100
- **中型站点** (1000-10000订单): 批次50
- **大型站点** (>10000订单): 批次30

#### 产品同步
- **默认批次大小**: 20个产品
- **变体批次**: 10个变体（502错误时）

### 4. 错误处理

#### 502 Bad Gateway (Cloudflare)
```javascript
// 自动重试策略
- 初次失败: 等待2秒重试
- 重试次数: 3次
- 批次降级: 减小批次大小
```

#### 超时处理
```javascript
// Headers Timeout
- 检查数据库同步状态
- 如果已完成: 返回成功
- 如果进行中: 继续后台运行
- 如果未知: 部分成功处理
```

## 使用指南

### 1. 启动同步任务

```javascript
// 前端代码
const response = await fetch('/api/sync/async/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    siteId: 'site-uuid',
    syncOrders: true,
    syncProducts: true
  })
});

const { success, taskId } = await response.json();
```

### 2. 查询任务状态

```javascript
// 轮询任务状态
const pollInterval = setInterval(async () => {
  const response = await fetch(`/api/sync/async/status?taskId=${taskId}`);
  const { task } = await response.json();
  
  if (task.isCompleted) {
    clearInterval(pollInterval);
    console.log('Sync completed:', task.results);
  }
}, 5000); // 每5秒查询一次
```

### 3. 数据库表结构

```sql
CREATE TABLE sync_tasks (
  id TEXT PRIMARY KEY,
  site_id UUID,
  status TEXT, -- pending, running, completed, failed
  progress JSONB, -- {orders: {total: 100, synced: 50}}
  results JSONB,  -- {orders: {synced: 100}, products: {synced: 50}}
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

## 性能优化建议

### 1. 大型站点（>10,000订单）

- 使用异步同步系统
- 在非高峰时段执行
- 考虑分多次增量同步

### 2. 超大型站点（>50,000订单）

- 分时段同步（按日期范围）
- 使用更小的批次大小
- 考虑直接数据库导入

### 3. 监控建议

```javascript
// 监控关键指标
- 任务执行时间
- 失败率
- 502错误频率
- 内存使用
```

## 故障排除

### 常见问题

1. **任务一直显示"running"**
   - 检查后台日志
   - 查看`sync_logs`表
   - 可能需要手动更新任务状态

2. **频繁502错误**
   - 减小批次大小
   - 增加重试延迟
   - 联系Cloudflare支持

3. **内存不足**
   - 减小批次大小
   - 增加服务器内存
   - 使用流式处理

## 环境变量配置

```env
# 建议配置
SYNC_BATCH_SIZE_ORDERS=50
SYNC_BATCH_SIZE_PRODUCTS=20
SYNC_TIMEOUT_MINUTES=10
SYNC_RETRY_ATTEMPTS=3
SYNC_RETRY_DELAY_MS=2000
```

## 总结

新的异步同步系统专门为处理大数据量设计，具有以下优势：

1. ✅ 不会因超时而中断
2. ✅ 支持后台长时间运行
3. ✅ 实时进度查询
4. ✅ 自动错误恢复
5. ✅ 批次大小可配置

对于16,000+订单的站点，预计同步时间：
- 订单: 5-10分钟
- 产品: 2-5分钟
- 总计: 7-15分钟（后台运行）