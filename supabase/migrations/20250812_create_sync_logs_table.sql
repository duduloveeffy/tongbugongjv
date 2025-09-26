-- 创建同步日志表
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES wc_sites(id) ON DELETE CASCADE,
  sku VARCHAR(255) NOT NULL,
  sync_type VARCHAR(50), -- 'status' | 'quantity' | 'smart'
  before_status VARCHAR(50),
  after_status VARCHAR(50),
  before_quantity INTEGER,
  after_quantity INTEGER,
  rule_applied VARCHAR(255),
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  synced_by UUID,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_sync_logs_site_id ON sync_logs(site_id);
CREATE INDEX idx_sync_logs_sku ON sync_logs(sku);
CREATE INDEX idx_sync_logs_synced_at ON sync_logs(synced_at DESC);
CREATE INDEX idx_sync_logs_success ON sync_logs(success);

-- 添加注释
COMMENT ON TABLE sync_logs IS '库存同步日志表';
COMMENT ON COLUMN sync_logs.sync_type IS '同步类型：status(状态) | quantity(数量) | smart(智能)';
COMMENT ON COLUMN sync_logs.rule_applied IS '应用的同步规则名称';
COMMENT ON COLUMN sync_logs.error_message IS '同步失败时的错误信息';