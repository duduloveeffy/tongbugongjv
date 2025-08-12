# 系统错误排查和修复指南

## 🐛 **当前错误分析**

根据错误日志，系统遇到了以下问题：

### **1. 数据库字段溢出错误**
```
Error: Failed to insert orders: numeric field overflow
```

**原因**: WooCommerce的价格数据超出了数据库字段的精度范围
**影响**: 导致订单同步失败

### **2. API请求超时错误**  
```
Headers Timeout Error
```

**原因**: 大批量数据同步超过了默认的HTTP超时限制
**影响**: 长时间运行的同步操作被中断

### **3. Webhook Events API错误**
```
GET /api/webhook/events?limit=50 500
```

**原因**: webhook_events表可能不存在或关联查询失败
**影响**: 无法查看Webhook事件日志

## 🔧 **修复步骤**

### **步骤1: 执行数据库补丁**

运行以下SQL脚本修复数据库字段精度问题：

```bash
# 在Supabase控制台或通过psql执行
psql -h your-supabase-host -U postgres -d your-database -f supabase/patches/001-fix-numeric-overflow.sql
```

**或者在Supabase Dashboard的SQL Editor中执行:**

```sql
-- 修复数值字段溢出问题
-- 将价格字段的精度从 DECIMAL(10,2) 改为 DECIMAL(15,4)
-- 将订单ID字段改为 BIGINT 以支持更大的数值

-- 修复 orders 表的数值字段
ALTER TABLE orders 
  ALTER COLUMN total TYPE DECIMAL(15,4),
  ALTER COLUMN subtotal TYPE DECIMAL(15,4),
  ALTER COLUMN total_tax TYPE DECIMAL(15,4),
  ALTER COLUMN shipping_total TYPE DECIMAL(15,4),
  ALTER COLUMN shipping_tax TYPE DECIMAL(15,4),
  ALTER COLUMN discount_total TYPE DECIMAL(15,4),
  ALTER COLUMN discount_tax TYPE DECIMAL(15,4),
  ALTER COLUMN order_id TYPE BIGINT,
  ALTER COLUMN customer_id TYPE BIGINT;

-- 修复 order_items 表的数值字段
ALTER TABLE order_items 
  ALTER COLUMN product_id TYPE BIGINT,
  ALTER COLUMN variation_id TYPE BIGINT,
  ALTER COLUMN quantity TYPE INTEGER,
  ALTER COLUMN price TYPE DECIMAL(15,4),
  ALTER COLUMN subtotal TYPE DECIMAL(15,4),
  ALTER COLUMN subtotal_tax TYPE DECIMAL(15,4),
  ALTER COLUMN total TYPE DECIMAL(15,4),
  ALTER COLUMN total_tax TYPE DECIMAL(15,4),
  ALTER COLUMN item_id TYPE BIGINT;
```

### **步骤2: 重启Next.js应用**

更新了next.config.js配置后需要重启：

```bash
# 开发环境
npm run dev

# 或生产环境
npm run build
npm run start
```

### **步骤3: 验证修复结果**

**1. 测试数据库修复:**
```sql
-- 验证字段类型是否正确
SELECT column_name, data_type, numeric_precision, numeric_scale 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('total', 'order_id');
```

**2. 测试API超时修复:**
```bash
# 重新运行同步任务，观察是否超时
curl -X POST "http://localhost:3000/api/sync/initial" \
  -H "Content-Type: application/json" \
  -d '{"siteId": "your-site-id", "syncOrders": true}'
```

**3. 测试Webhook Events API:**
```bash
# 测试事件日志API
curl -X GET "http://localhost:3000/api/webhook/events?limit=10"
```

## 📊 **监控和预防**

### **1. 设置数据监控**

创建监控脚本检查数据质量：

```sql
-- 监控异常价格数据
SELECT site_id, order_id, total, subtotal 
FROM orders 
WHERE total > 999999 OR total < -999999
ORDER BY date_created DESC 
LIMIT 10;

-- 监控API性能
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as sync_count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
FROM sync_logs 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour 
ORDER BY hour DESC;
```

### **2. 设置告警阈值**

在应用中添加监控告警：

```typescript
// 监控同步性能
if (syncDurationMs > 300000) { // 5分钟
  console.warn('Slow sync detected:', { 
    duration: syncDurationMs,
    recordCount: processedCount 
  });
}

// 监控错误率
const errorRate = failedCount / totalCount;
if (errorRate > 0.1) { // 10%以上错误率
  console.error('High error rate detected:', { 
    errorRate,
    errors: errorMessages 
  });
}
```

### **3. 优化同步策略**

```typescript
// 动态调整批次大小
const getBatchSize = (errorRate: number, avgProcessingTime: number) => {
  if (errorRate > 0.05) return Math.max(10, currentBatchSize * 0.8);
  if (avgProcessingTime > 5000) return Math.max(25, currentBatchSize * 0.9);
  if (errorRate < 0.01) return Math.min(100, currentBatchSize * 1.1);
  return currentBatchSize;
};
```

## 🚨 **应急处理**

### **如果同步完全失败:**

1. **停止所有同步任务**
   ```sql
   UPDATE sync_tasks SET status = 'failed' WHERE status = 'processing';
   ```

2. **清理损坏的数据**
   ```sql
   -- 删除不完整的订单记录
   DELETE FROM order_items WHERE order_id IN (
     SELECT id FROM orders WHERE total IS NULL OR order_id IS NULL
   );
   DELETE FROM orders WHERE total IS NULL OR order_id IS NULL;
   ```

3. **重置同步检查点**
   ```sql
   UPDATE sync_checkpoints_v2 
   SET last_order_modified = NOW() - INTERVAL '1 day'
   WHERE sync_type = 'orders';
   ```

### **如果数据库连接问题:**

```bash
# 检查Supabase连接
curl -X GET "https://your-project.supabase.co/rest/v1/wc_sites" \
  -H "apikey: your-anon-key"

# 检查环境变量
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## 📈 **性能优化建议**

### **1. 数据库优化**

```sql
-- 为高频查询添加索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_site_date 
ON orders(site_id, date_created DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_sku_site 
ON order_items(sku, order_id);

-- 分析查询性能
EXPLAIN ANALYZE 
SELECT * FROM orders 
WHERE site_id = 'your-site-id' 
AND date_created >= NOW() - INTERVAL '7 days'
ORDER BY date_created DESC;
```

### **2. API优化**

```typescript
// 使用连接池
const supabaseConfig = {
  auth: { persistSession: false },
  db: {
    schema: 'public',
  },
  global: {
    headers: { 'x-my-custom-header': 'my-app-name' },
  },
};

// 批量处理优化
const processBatch = async (items: any[], batchSize = 50) => {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const result = await processBatchItems(batch);
    results.push(result);
    
    // 避免过载
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  return results;
};
```

### **3. 内存管理**

```typescript
// 流式处理大数据集
async function* fetchOrdersStream(siteId: string) {
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const { data, hasNextPage } = await fetchOrdersPage(siteId, page);
    yield data;
    
    hasMore = hasNextPage;
    page++;
    
    // 清理内存
    if (global.gc) {
      global.gc();
    }
  }
}
```

## ✅ **验证清单**

修复完成后，请验证以下项目：

- [ ] 数据库字段类型已更新为DECIMAL(15,4)和BIGINT
- [ ] API超时配置已更新（10分钟）
- [ ] Webhook Events API返回200状态码
- [ ] 同步任务可以成功处理大额订单
- [ ] 错误日志中没有"numeric field overflow"错误
- [ ] 应用重启后配置生效
- [ ] 监控脚本正常运行
- [ ] 备份策略已实施

## 📞 **技术支持**

如果问题仍然存在，请收集以下信息：

1. **错误日志** - 完整的错误堆栈信息
2. **数据样本** - 导致错误的具体数据（脱敏后）
3. **系统环境** - Node.js版本、数据库版本等
4. **监控数据** - API响应时间、错误率等

通过系统监控面板或日志系统获取这些信息，以便快速定位和解决问题。