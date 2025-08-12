# WooCommerce实时同步Webhook配置指南

本指南将帮助您在WooCommerce站点上配置实时数据同步，实现订单和产品数据的即时同步。

## 概述

通过配置Webhook，您的WooCommerce站点可以在发生订单或产品变更时，自动将数据推送到ERP系统，实现真正的实时数据同步。

### 主要优势

- **实时性**: 数据变更即时同步，告别定时轮询延迟
- **可靠性**: 失败重试机制，确保数据不丢失
- **安全性**: HMAC签名验证，防止恶意请求
- **监控**: 完整的事件日志和统计信息

## 第一步：安装WooCommerce插件

### 1.1 下载插件文件

从系统中下载以下插件文件：
```
wc-sync-plugin/
├── wc-realtime-sync.php          # 主插件文件
├── includes/
│   ├── class-webhook-manager.php  # Webhook管理器
│   ├── class-data-formatter.php   # 数据格式化
│   ├── class-security.php         # 安全验证
│   └── admin/
│       └── class-admin-settings.php # 管理界面
└── README.md
```

### 1.2 安装插件

1. **方式一：通过WordPress后台上传**
   - 将整个 `wc-sync-plugin` 文件夹压缩为 `wc-realtime-sync.zip`
   - 登录WordPress后台 → 插件 → 添加插件 → 上传插件
   - 选择zip文件上传并激活

2. **方式二：FTP上传**
   - 将 `wc-sync-plugin` 文件夹上传到 `/wp-content/plugins/` 目录
   - 在WordPress后台激活插件

### 1.3 验证安装

激活后，您应该能在 **WooCommerce → 设置 → 实时同步** 中找到配置页面。

## 第二步：配置Webhook端点

### 2.1 在ERP系统中创建Webhook配置

1. 登录ERP系统，进入 **实时同步** 标签页
2. 点击 **添加Webhook** 按钮
3. 填写配置信息：

```
站点: 选择您的WooCommerce站点
Webhook URL: https://您的ERP域名.com/api/webhook/orders
密钥: 点击"生成"按钮创建安全密钥
事件类型: 勾选所需的事件
  ☑ order.created   (订单创建)
  ☑ order.updated   (订单更新) 
  ☑ product.updated (产品更新)
启用Webhook: 开启
```

### 2.2 复制配置信息

创建成功后，记录以下信息：
- **Webhook URL**: 如 `https://erp.example.com/api/webhook/orders`
- **密钥**: 如 `a8f3k2n9s7m4j1q6w8e5r2t9y7u3i0p2`

## 第三步：配置WooCommerce插件

### 3.1 进入插件设置

在WooCommerce后台，进入：**WooCommerce → 设置 → 实时同步**

### 3.2 填写基本配置

```
ERP系统URL: https://erp.example.com
订单Webhook URL: https://erp.example.com/api/webhook/orders
产品Webhook URL: https://erp.example.com/api/webhook/products
密钥: a8f3k2n9s7m4j1q6w8e5r2t9y7u3i0p2
```

### 3.3 配置事件类型

选择要同步的事件：

**订单事件:**
- ☑ 订单创建时同步
- ☑ 订单更新时同步
- ☐ 订单删除时同步（可选）

**产品事件:**
- ☑ 产品更新时同步
- ☑ 库存变化时同步
- ☐ 产品删除时同步（可选）

### 3.4 高级设置

```
发送方式: 实时发送 (推荐)
重试次数: 3次
超时时间: 30秒
批量大小: 100个事件/批次
```

## 第四步：测试连接

### 4.1 在ERP系统中测试

1. 进入 **实时同步** 标签页
2. 找到刚创建的Webhook配置
3. 点击 **测试** 按钮
4. 查看测试结果，确保连接成功

### 4.2 在WooCommerce中测试

1. 在插件设置页面，点击 **测试连接** 按钮
2. 查看连接状态和响应信息
3. 确保显示"连接成功"

## 第五步：验证同步功能

### 5.1 创建测试订单

1. 在WooCommerce前端下一个测试订单
2. 在ERP系统的 **实时同步** → **事件日志** 中查看
3. 确认看到 `order.created` 事件，且状态为"成功"

### 5.2 更新产品库存

1. 在WooCommerce后台修改某个产品的库存
2. 在ERP事件日志中查看 `product.updated` 事件
3. 确认同步状态为"成功"

## 常见问题解决

### Q1: Webhook测试连接失败

**可能原因:**
- ERP系统URL不正确或无法访问
- 防火墙阻止了请求
- 密钥配置错误

**解决方法:**
1. 检查ERP系统URL是否可以正常访问
2. 确保防火墙允许WooCommerce服务器的IP
3. 重新生成密钥并同步到两边系统

### Q2: 事件发送成功但ERP没收到数据

**可能原因:**
- ERP系统数据库连接问题
- 签名验证失败
- 数据格式不匹配

**解决方法:**
1. 检查ERP系统的Webhook事件日志
2. 验证密钥配置是否一致
3. 检查WooCommerce和ERP的时区设置

### Q3: 大量事件导致性能问题

**解决方法:**
1. 调整批量大小为较小值（如50）
2. 增加发送间隔时间
3. 考虑使用批量模式而非实时模式

### Q4: SSL证书问题

如果遇到SSL错误：

**在WooCommerce插件设置中:**
```php
// 临时解决方案（不推荐生产环境）
add_filter('https_ssl_verify', '__return_false');

// 推荐解决方案：添加CA证书
curl_setopt($ch, CURLOPT_CAINFO, '/path/to/cacert.pem');
```

## 高级配置

### 自定义事件过滤

在 `wc-realtime-sync.php` 中添加过滤器：

```php
// 只同步特定状态的订单
add_filter('wc_realtime_sync_order_statuses', function($statuses) {
    return ['processing', 'completed'];
});

// 只同步特定类型的产品
add_filter('wc_realtime_sync_product_types', function($types) {
    return ['simple', 'variable'];
});
```

### 性能优化

#### 1. 数据库优化
```sql
-- 定期清理旧的Webhook队列记录
DELETE FROM wp_wc_webhook_queue 
WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND status IN ('completed', 'failed');
```

#### 2. 缓存配置
```php
// 在wp-config.php中添加
define('WC_REALTIME_SYNC_CACHE', true);
define('WC_REALTIME_SYNC_CACHE_TTL', 300); // 5分钟
```

### 监控和日志

#### 1. 启用详细日志
在插件设置中启用调试模式，日志文件位置：
```
/wp-content/uploads/wc-logs/wc-realtime-sync-{date}.log
```

#### 2. 监控指标
定期检查以下指标：
- 成功率：应保持在95%以上
- 响应时间：应小于3秒
- 队列积压：应保持在100以下

## API参考

### Webhook端点

#### 订单Webhook
```
POST /api/webhook/orders
Content-Type: application/json
X-WC-Signature: sha256=abc123...
X-WC-Event: order.created
X-WC-Source: https://shop.example.com

{
  "id": 123,
  "status": "processing",
  "total": "99.99",
  "items": [...],
  // ... 其他订单数据
}
```

#### 产品Webhook
```
POST /api/webhook/products  
Content-Type: application/json
X-WC-Signature: sha256=def456...
X-WC-Event: product.updated

{
  "id": 456,
  "sku": "PROD-001",
  "stock_quantity": 50,
  "stock_status": "instock",
  // ... 其他产品数据
}
```

### 响应格式

成功响应：
```json
{
  "success": true,
  "message": "Event processed successfully",
  "processing_time": 0.123,
  "event_id": "uuid-here"
}
```

失败响应：
```json
{
  "success": false,
  "error": "Invalid signature",
  "code": "SIGNATURE_INVALID"
}
```

## 安全最佳实践

1. **使用HTTPS**: 确保所有Webhook URL都使用HTTPS协议
2. **验证签名**: 始终验证请求的HMAC签名
3. **IP白名单**: 考虑限制只允许特定IP访问Webhook端点
4. **定期更换密钥**: 建议每6个月更换一次Webhook密钥
5. **监控异常**: 设置告警监控异常的失败率或响应时间

## 故障排除清单

遇到问题时，请依次检查：

- [ ] ERP系统Webhook端点是否正常响应
- [ ] WooCommerce插件是否正确激活
- [ ] 密钥配置是否在两边系统中一致
- [ ] 防火墙/安全组是否允许相关端口
- [ ] SSL证书是否有效（如使用HTTPS）
- [ ] 服务器时间是否同步（签名验证需要）
- [ ] 数据库连接是否正常
- [ ] 磁盘空间是否充足（日志文件）

如需更多帮助，请查看系统的事件日志或联系技术支持。