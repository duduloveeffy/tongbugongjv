# WooCommerce实时同步插件打包说明

## 插件文件结构

创建以下目录结构用于打包：

```
wc-realtime-sync/
├── wc-realtime-sync.php              # 主插件文件
├── README.md                          # 插件说明
├── includes/                          # 核心功能类
│   ├── class-webhook-manager.php      # Webhook管理器
│   ├── class-data-formatter.php       # 数据格式化工具  
│   ├── class-security.php             # 安全验证工具
│   └── admin/                         # 后台管理功能
│       ├── class-admin-settings.php   # 设置页面
│       └── class-admin-ajax.php       # AJAX处理
├── assets/                            # 静态资源
│   ├── css/
│   │   └── admin.css                  # 后台样式
│   └── js/
│       └── admin.js                   # 后台脚本
└── languages/                         # 多语言文件
    ├── wc-realtime-sync.pot           # 翻译模板
    └── zh_CN/
        ├── wc-realtime-sync-zh_CN.po  # 中文翻译
        └── wc-realtime-sync-zh_CN.mo  # 编译后翻译
```

## 打包步骤

### 1. 创建打包目录

```bash
mkdir -p wp-plugin-package/wc-realtime-sync
cd wp-plugin-package/wc-realtime-sync
```

### 2. 复制插件文件

将以下文件复制到打包目录：

```bash
# 主插件文件
cp /path/to/wc-sync-plugin/wc-realtime-sync.php ./

# 核心类文件
mkdir -p includes/admin
cp /path/to/wc-sync-plugin/includes/*.php includes/
cp /path/to/wc-sync-plugin/includes/admin/*.php includes/admin/
```

### 3. 创建静态资源文件

#### assets/css/admin.css
```css
/* WooCommerce实时同步插件后台样式 */
.wc-realtime-sync-settings {
    max-width: 800px;
}

.wc-realtime-sync-section {
    background: #fff;
    border: 1px solid #ccd0d4;
    border-radius: 4px;
    margin: 20px 0;
    padding: 20px;
}

.wc-realtime-sync-section h3 {
    margin-top: 0;
    color: #23282d;
}

.wc-realtime-sync-test-result {
    padding: 10px;
    border-radius: 4px;
    margin: 10px 0;
}

.wc-realtime-sync-test-result.success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
}

.wc-realtime-sync-test-result.error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
}

.wc-realtime-sync-logs {
    max-height: 300px;
    overflow-y: auto;
    background: #f8f9fa;
    padding: 10px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
}
```

#### assets/js/admin.js
```javascript
/* WooCommerce实时同步插件后台脚本 */
(function($) {
    'use strict';
    
    $(document).ready(function() {
        // 测试连接功能
        $('#wc-realtime-sync-test-connection').on('click', function(e) {
            e.preventDefault();
            
            const $button = $(this);
            const $result = $('#wc-realtime-sync-test-result');
            
            $button.prop('disabled', true).text('测试中...');
            $result.hide();
            
            $.ajax({
                url: wcRealtimeSyncAjax.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'wc_realtime_sync_test',
                    nonce: wcRealtimeSyncAjax.nonce,
                    erp_url: $('#erp_url').val(),
                    webhook_secret: $('#webhook_secret').val()
                },
                success: function(response) {
                    if (response.success) {
                        $result.removeClass('error').addClass('success')
                               .html('<strong>连接成功！</strong><br>' + response.data.message)
                               .show();
                    } else {
                        $result.removeClass('success').addClass('error')
                               .html('<strong>连接失败：</strong>' + response.data.message)
                               .show();
                    }
                },
                error: function() {
                    $result.removeClass('success').addClass('error')
                           .html('<strong>请求失败：</strong>无法连接到服务器')
                           .show();
                },
                complete: function() {
                    $button.prop('disabled', false).text('测试连接');
                }
            });
        });
        
        // 生成密钥功能
        $('#wc-realtime-sync-generate-secret').on('click', function(e) {
            e.preventDefault();
            
            const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let secret = '';
            for (let i = 0; i < 32; i++) {
                secret += charset.charAt(Math.floor(Math.random() * charset.length));
            }
            
            $('#webhook_secret').val(secret);
        });
        
        // 清空日志功能
        $('#wc-realtime-sync-clear-logs').on('click', function(e) {
            e.preventDefault();
            
            if (confirm('确定要清空所有日志记录吗？此操作不可恢复。')) {
                $.ajax({
                    url: wcRealtimeSyncAjax.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'wc_realtime_sync_clear_logs',
                        nonce: wcRealtimeSyncAjax.nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            $('#wc-realtime-sync-logs-content').empty();
                            alert('日志已清空');
                        } else {
                            alert('清空失败：' + response.data.message);
                        }
                    }
                });
            }
        });
    });
})(jQuery);
```

### 4. 创建多语言文件

#### languages/wc-realtime-sync.pot
```po
# Copyright (C) 2024 WooCommerce Realtime Sync
# This file is distributed under the same license as the WooCommerce Realtime Sync package.
msgid ""
msgstr ""
"Project-Id-Version: WooCommerce Realtime Sync 1.0.0\n"
"Language-Team: \n"
"MIME-Version: 1.0\n"
"Content-Type: text/plain; charset=UTF-8\n"

msgid "WooCommerce Realtime Sync"
msgstr ""

msgid "Real-time data synchronization for WooCommerce"
msgstr ""

msgid "Settings"
msgstr ""

msgid "ERP System URL"
msgstr ""

msgid "Webhook Secret Key"
msgstr ""
```

#### languages/zh_CN/wc-realtime-sync-zh_CN.po
```po
msgid ""
msgstr ""
"Project-Id-Version: WooCommerce Realtime Sync 1.0.0\n"
"Language: zh_CN\n"
"MIME-Version: 1.0\n"
"Content-Type: text/plain; charset=UTF-8\n"

msgid "WooCommerce Realtime Sync"
msgstr "WooCommerce实时同步"

msgid "Real-time data synchronization for WooCommerce"
msgstr "WooCommerce实时数据同步插件"

msgid "Settings"
msgstr "设置"

msgid "ERP System URL"
msgstr "ERP系统URL"

msgid "Webhook Secret Key"
msgstr "Webhook密钥"
```

### 5. 创建README.md

```markdown
# WooCommerce Realtime Sync Plugin

WooCommerce实时数据同步插件，支持订单和产品数据的实时推送。

## 功能特性

- ✅ 实时订单数据同步
- ✅ 实时产品库存同步  
- ✅ HMAC签名安全验证
- ✅ 失败重试机制
- ✅ 详细的事件日志
- ✅ 批量数据处理
- ✅ 多语言支持

## 安装说明

1. 下载插件zip文件
2. 在WordPress后台上传并激活插件
3. 进入WooCommerce设置页面配置相关参数
4. 测试连接确保配置正确

## 系统要求

- WordPress 5.0+
- WooCommerce 4.0+
- PHP 7.4+
- MySQL 5.7+

## 技术支持

如需技术支持，请联系系统管理员。
```

### 6. 打包插件

```bash
# 在上级目录执行
cd ..
zip -r wc-realtime-sync-v1.0.0.zip wc-realtime-sync/

# 验证打包内容
unzip -l wc-realtime-sync-v1.0.0.zip
```

## 安装包验证清单

打包前请确保：

- [ ] 主插件文件包含正确的插件头信息
- [ ] 所有PHP文件都有正确的开头注释
- [ ] 没有包含测试文件或临时文件
- [ ] 文件权限设置正确（644 for files, 755 for directories）
- [ ] 多语言文件已编译（.mo文件存在）
- [ ] README.md包含完整的安装和使用说明

## 分发说明

### 内部分发
- 通过内部系统或邮件分发给相关站点管理员
- 提供详细的安装和配置文档
- 提供技术支持联系方式

### 版本管理
建议的版本命名规则：
- 主版本：v1.0.0（重大功能更新）
- 次版本：v1.1.0（新功能添加）
- 补丁版本：v1.0.1（问题修复）

### 更新机制
插件支持WordPress标准更新机制，可通过以下方式提供更新：
1. 手动下载新版本重新安装
2. 实现自定义更新服务器（高级功能）