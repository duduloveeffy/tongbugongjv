# Webhook系统部署测试指南

本指南详细说明如何部署和测试WooCommerce实时同步Webhook系统。

## 部署前准备

### 环境要求

#### ERP系统端
- Next.js 15+ 
- Node.js 18+
- Supabase PostgreSQL数据库
- HTTPS域名（生产环境必需）

#### WooCommerce站点端  
- WordPress 5.0+
- WooCommerce 4.0+
- PHP 7.4+
- 能够访问ERP系统的网络环境

### 数据库准备

确保已执行数据库迁移脚本：

```bash
# 在ERP系统中执行
psql -h your-supabase-host -U postgres -d your-database -f supabase/schema-v2.sql
```

验证数据库表是否创建成功：
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'webhook_%';

-- 应该返回：
-- webhook_endpoints
-- webhook_events  
-- webhook_queue
```

## ERP系统部署

### 1. 代码部署

```bash
# 确保所有新文件都已提交
git add .
git commit -m "feat: 完成Webhook实时同步系统"
git push origin main

# 部署到生产环境（根据实际部署方式）
npm run build
npm run start
```

### 2. 环境变量配置

确保以下环境变量已正确配置：

```bash
# .env.local 或生产环境配置
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://...
```

### 3. API端点测试

测试所有Webhook相关API端点：

```bash
# 测试Webhook端点管理API
curl -X GET "https://your-erp.com/api/webhook/endpoints"

# 测试Webhook验证端点
curl -X GET "https://your-erp.com/api/webhook/verify?challenge=test123"

# 测试订单Webhook接收
curl -X POST "https://your-erp.com/api/webhook/orders" \
  -H "Content-Type: application/json" \
  -H "X-WC-Event: order.created" \
  -H "X-WC-Source: https://test-shop.com" \
  -d '{"id": 999, "status": "processing", "test": true}'
```

预期响应应该包含适当的成功或错误信息。

## WooCommerce插件部署

### 1. 插件打包

按照 `PLUGIN_PACKAGE.md` 指南创建插件包：

```bash
# 创建插件包
mkdir -p wp-plugin-dist
cp -r wc-sync-plugin wp-plugin-dist/wc-realtime-sync
cd wp-plugin-dist
zip -r wc-realtime-sync-v1.0.0.zip wc-realtime-sync/
```

### 2. 插件安装

在每个WooCommerce站点上：

1. **上传插件**
   - 进入 WordPress后台 → 插件 → 添加插件 → 上传插件
   - 选择 `wc-realtime-sync-v1.0.0.zip` 上传
   - 点击"现在安装"，然后"激活"

2. **验证安装**
   - 检查插件是否在已激活插件列表中
   - 进入 WooCommerce → 设置，查看是否有"实时同步"标签页

### 3. 插件配置

在 WooCommerce → 设置 → 实时同步 中配置：

```
ERP系统URL: https://your-erp.com
订单Webhook URL: https://your-erp.com/api/webhook/orders  
产品Webhook URL: https://your-erp.com/api/webhook/products
密钥: [从ERP系统生成的32位密钥]

启用的事件:
☑ 订单创建
☑ 订单更新  
☑ 产品更新
☑ 库存变化

发送模式: 实时发送
重试次数: 3
超时时间: 30秒
```

## 系统集成测试

### 测试计划

#### 1. 连接性测试

**目标**: 验证ERP系统和WooCommerce之间的网络连接

**步骤**:
1. 在ERP系统中创建Webhook端点配置
2. 在WooCommerce插件设置中点击"测试连接"
3. 在ERP系统事件日志中查看测试事件

**预期结果**:
- WooCommerce显示"连接成功"
- ERP系统收到 `test.webhook` 事件
- 事件状态为"成功"

#### 2. 订单同步测试

**目标**: 验证订单数据能够实时同步

**测试用例**:

**用例2.1: 新订单创建**
1. 在WooCommerce前端下一个测试订单
2. 检查ERP系统是否收到 `order.created` 事件
3. 验证订单数据是否正确存储在数据库中

**用例2.2: 订单状态更新**  
1. 在WooCommerce后台将订单状态改为"处理中"
2. 检查ERP系统是否收到 `order.updated` 事件
3. 验证订单状态是否正确更新

**用例2.3: 订单取消**
1. 取消一个已存在的订单
2. 检查ERP系统是否收到相应的更新事件
3. 验证订单状态变更

#### 3. 产品同步测试

**目标**: 验证产品数据能够实时同步

**测试用例**:

**用例3.1: 产品信息更新**
1. 修改产品名称、价格等基本信息
2. 检查ERP系统是否收到 `product.updated` 事件
3. 验证产品信息是否正确更新

**用例3.2: 库存数量变更**
1. 修改产品库存数量
2. 检查ERP系统是否收到库存更新事件
3. 验证库存数量是否正确同步

**用例3.3: 变体产品处理**
1. 更新可变产品的某个变体
2. 检查是否正确处理变体数据
3. 验证父产品和变体的关系

#### 4. 错误处理测试

**目标**: 验证系统的错误处理和重试机制

**测试用例**:

**用例4.1: 网络中断模拟**
1. 临时阻断WooCommerce到ERP的网络连接
2. 创建订单或更新产品
3. 恢复网络连接
4. 验证事件是否通过重试机制成功发送

**用例4.2: 签名验证**
1. 故意配置错误的密钥
2. 尝试发送Webhook
3. 验证ERP系统是否拒绝请求
4. 检查是否记录了签名错误

**用例4.3: 大批量数据处理**
1. 批量导入100个产品
2. 批量更新50个订单状态
3. 验证系统是否能正常处理大批量事件
4. 检查性能和错误率

### 测试数据准备

#### 测试产品数据
```json
{
  "name": "测试产品-001",
  "sku": "TEST-SKU-001", 
  "type": "simple",
  "regular_price": "99.99",
  "stock_quantity": 100,
  "manage_stock": true,
  "stock_status": "instock"
}
```

#### 测试订单数据
```json
{
  "billing": {
    "first_name": "测试",
    "last_name": "用户", 
    "email": "test@example.com",
    "phone": "13800138000"
  },
  "line_items": [
    {
      "product_id": 123,
      "quantity": 2,
      "sku": "TEST-SKU-001"
    }
  ]
}
```

## 性能测试

### 负载测试

使用工具如 Artillery 或 k6 进行负载测试：

#### 测试脚本示例 (Artillery)

```yaml
# webhook-load-test.yml
config:
  target: 'https://your-erp.com'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Order Webhook Test"
    requests:
      - post:
          url: "/api/webhook/orders"
          headers:
            Content-Type: "application/json"
            X-WC-Event: "order.created"
            X-WC-Source: "https://test-shop.com"
          json:
            id: "{{ $randomInt(1000, 9999) }}"
            status: "processing"
            total: "{{ $randomInt(10, 500) }}.99"
```

执行负载测试：
```bash
artillery run webhook-load-test.yml
```

### 性能指标监控

在测试期间监控以下指标：

#### ERP系统指标
- API响应时间 (<1s为优秀，<3s为可接受)
- 内存使用率 (<80%)
- CPU使用率 (<70%)
- 数据库连接数 (<50个并发)

#### WooCommerce指标  
- Webhook发送成功率 (>95%)
- 平均重试次数 (<1.5次)
- 队列积压数量 (<100条)

### 监控脚本

```bash
#!/bin/bash
# monitor-webhook-performance.sh

echo "=== Webhook性能监控 ==="
echo "时间: $(date)"
echo

# 检查ERP系统响应时间
echo "=== API响应时间测试 ==="
curl -w "@curl-format.txt" -s -o /dev/null https://your-erp.com/api/webhook/verify

# 检查数据库状态
echo -e "\n=== 数据库状态 ==="
psql $DATABASE_URL -c "
SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  COUNT(*) FILTER (WHERE status = 'error') as failed,
  AVG(processing_time_ms) as avg_processing_time
FROM webhook_events 
WHERE received_at >= NOW() - INTERVAL '1 hour';
"

# 检查Webhook队列状态
echo -e "\n=== Webhook队列状态 ==="  
psql $DATABASE_URL -c "
SELECT status, COUNT(*) as count 
FROM webhook_queue 
GROUP BY status;
"
```

## 问题排查指南

### 常见问题及解决方案

#### 1. Webhook连接失败

**症状**: 测试连接时显示"连接失败"

**排查步骤**:
```bash
# 检查ERP系统是否可访问
curl -I https://your-erp.com/api/webhook/verify

# 检查防火墙设置
telnet your-erp-domain.com 443

# 检查SSL证书
openssl s_client -connect your-erp-domain.com:443 -servername your-erp-domain.com
```

#### 2. 事件发送成功但未处理

**症状**: WooCommerce显示发送成功，但ERP系统未收到数据

**排查步骤**:
```bash
# 检查ERP系统日志
tail -f /var/log/your-app.log

# 检查数据库事件记录
psql $DATABASE_URL -c "
SELECT * FROM webhook_events 
WHERE received_at >= NOW() - INTERVAL '10 minutes' 
ORDER BY received_at DESC;
"
```

#### 3. 高错误率

**症状**: 事件日志显示大量失败事件

**排查步骤**:
1. 检查错误信息模式
2. 验证密钥配置
3. 检查数据库连接
4. 分析网络延迟

### 日志分析脚本

```bash
#!/bin/bash
# analyze-webhook-logs.sh

echo "=== Webhook错误分析 ==="

# 统计最近1小时的错误类型
psql $DATABASE_URL -c "
SELECT 
  error_message,
  COUNT(*) as occurrence_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM webhook_events 
WHERE status = 'error' 
  AND received_at >= NOW() - INTERVAL '1 hour'
  AND error_message IS NOT NULL
GROUP BY error_message 
ORDER BY occurrence_count DESC 
LIMIT 10;
"

# 统计成功率趋势
echo -e "\n=== 成功率趋势（每5分钟） ==="
psql $DATABASE_URL -c "
SELECT 
  DATE_TRUNC('minute', received_at) - 
  INTERVAL '1 minute' * (EXTRACT('minute' FROM received_at)::integer % 5) as time_bucket,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE status = 'success') as successful_events,
  ROUND(COUNT(*) FILTER (WHERE status = 'success') * 100.0 / COUNT(*), 2) as success_rate
FROM webhook_events 
WHERE received_at >= NOW() - INTERVAL '1 hour'
GROUP BY time_bucket 
ORDER BY time_bucket DESC;
"
```

## 上线发布清单

### 发布前检查

- [ ] 所有测试用例都已通过
- [ ] 性能指标符合要求  
- [ ] 错误处理机制正常工作
- [ ] 监控和告警系统已配置
- [ ] 文档已完成并审核
- [ ] 回滚计划已准备

### 发布步骤

1. **通知相关人员**
   - 提前通知运维团队发布计划
   - 通知业务用户可能的短暂影响

2. **分阶段发布**
   - 先在测试站点部署验证
   - 逐步推广到生产站点
   - 监控每个阶段的运行情况

3. **发布后验证**
   - 执行关键功能测试
   - 检查监控指标
   - 确认日志记录正常

### 应急预案

如果发现严重问题：

1. **立即停止Webhook**
   ```bash
   # 在WooCommerce插件中临时禁用
   # 或在ERP系统中返回503状态码
   ```

2. **回滚到稳定版本**
   ```bash
   git revert [commit-hash]
   npm run build && npm run start
   ```

3. **数据修复**
   - 检查是否有数据不一致
   - 执行必要的数据修复脚本
   - 重新同步关键数据

## 维护和监控

### 定期维护任务

#### 每日
- [ ] 检查错误率和响应时间
- [ ] 清理过期的队列记录
- [ ] 检查磁盘空间使用

#### 每周  
- [ ] 分析性能趋势
- [ ] 检查数据库表大小
- [ ] 更新监控阈值

#### 每月
- [ ] 清理历史日志数据
- [ ] 审查安全设置
- [ ] 更新文档

### 自动化脚本

```bash
#!/bin/bash
# daily-maintenance.sh

# 清理30天前的事件日志
psql $DATABASE_URL -c "
DELETE FROM webhook_events 
WHERE received_at < NOW() - INTERVAL '30 days';
"

# 清理已完成的队列项目
psql $DATABASE_URL -c "
DELETE FROM webhook_queue 
WHERE status IN ('completed', 'failed') 
  AND created_at < NOW() - INTERVAL '7 days';
"

# 生成日报
echo "=== $(date +%Y-%m-%d) Webhook系统日报 ===" > /tmp/webhook-report.txt
echo "" >> /tmp/webhook-report.txt

# 发送日报邮件（如果配置了邮件系统）
# mail -s "Webhook系统日报 $(date +%Y-%m-%d)" admin@company.com < /tmp/webhook-report.txt

echo "维护任务完成: $(date)"
```

通过以上全面的部署测试指南，您可以确保Webhook系统的稳定运行和持续优化。