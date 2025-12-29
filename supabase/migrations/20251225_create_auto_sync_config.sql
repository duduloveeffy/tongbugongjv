-- 自动同步配置表
-- 存储自动同步的筛选条件、站点选择、企业微信 Webhook 等配置

CREATE TABLE IF NOT EXISTS auto_sync_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'default',  -- 配置名称，默认 'default'
  enabled BOOLEAN DEFAULT false,  -- 是否启用自动同步

  -- 站点配置（多站点支持）
  site_ids UUID[] DEFAULT '{}',  -- 要同步的站点 ID 列表

  -- 筛选条件（与前端 InventoryFilters 对应）
  filters JSONB DEFAULT '{
    "isMergedMode": true,
    "hideZeroStock": false,
    "hideNormalStatus": false,
    "showNeedSync": false,
    "categoryFilter": "全部",
    "categoryFilters": [],
    "skuFilter": "",
    "excludeSkuPrefixes": "",
    "excludeWarehouses": ""
  }'::jsonb,

  -- 同步选项
  sync_to_instock BOOLEAN DEFAULT true,   -- 是否同步为有货
  sync_to_outofstock BOOLEAN DEFAULT true, -- 是否同步为无货

  -- 企业微信通知配置
  wechat_webhook_url TEXT,  -- 企业微信机器人 Webhook 地址
  notify_on_success BOOLEAN DEFAULT true,  -- 同步成功时通知
  notify_on_failure BOOLEAN DEFAULT true,  -- 同步失败时通知
  notify_on_no_changes BOOLEAN DEFAULT false,  -- 无变化时通知

  -- 定时配置
  cron_expression TEXT DEFAULT '0 * * * *',  -- 默认每小时执行一次

  -- 元数据
  last_run_at TIMESTAMP WITH TIME ZONE,
  last_run_status TEXT,  -- 'success', 'partial', 'failed', 'no_changes'
  last_run_summary JSONB,  -- 上次运行摘要
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(name)
);

-- 自动同步运行日志表
CREATE TABLE IF NOT EXISTS auto_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id UUID REFERENCES auto_sync_config(id) ON DELETE CASCADE,

  -- 运行信息
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'running',  -- 'running', 'success', 'partial', 'failed', 'no_changes'

  -- 统计信息
  total_skus_checked INTEGER DEFAULT 0,
  skus_synced_to_instock INTEGER DEFAULT 0,
  skus_synced_to_outofstock INTEGER DEFAULT 0,
  skus_failed INTEGER DEFAULT 0,

  -- 详细信息
  sites_processed JSONB,  -- 每个站点的处理结果
  error_message TEXT,

  -- 通知状态
  notification_sent BOOLEAN DEFAULT false,
  notification_error TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_auto_sync_config_enabled ON auto_sync_config(enabled);
CREATE INDEX IF NOT EXISTS idx_auto_sync_config_name ON auto_sync_config(name);
CREATE INDEX IF NOT EXISTS idx_auto_sync_logs_config_id ON auto_sync_logs(config_id);
CREATE INDEX IF NOT EXISTS idx_auto_sync_logs_status ON auto_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_auto_sync_logs_started_at ON auto_sync_logs(started_at);

-- 更新触发器
DROP TRIGGER IF EXISTS update_auto_sync_config_updated_at ON auto_sync_config;
CREATE TRIGGER update_auto_sync_config_updated_at BEFORE UPDATE ON auto_sync_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认配置
INSERT INTO auto_sync_config (name, enabled)
VALUES ('default', false)
ON CONFLICT (name) DO NOTHING;