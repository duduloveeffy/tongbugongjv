-- 同步批次调度表
-- 用于跟踪一轮完整同步任务的状态（包含多个站点的同步）

-- 同步批次表：记录每一轮同步任务
CREATE TABLE IF NOT EXISTS sync_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 批次状态：pending(等待开始), fetching(拉取ERP), syncing(同步中), completed(完成), failed(失败)
  status TEXT NOT NULL DEFAULT 'pending',

  -- 当前处理的站点索引（0 表示拉取 ERP 阶段，1-N 表示同步站点）
  current_step INTEGER NOT NULL DEFAULT 0,

  -- 总站点数
  total_sites INTEGER NOT NULL DEFAULT 0,

  -- 关联的站点 ID 列表（按顺序）
  site_ids TEXT[] NOT NULL DEFAULT '{}',

  -- 库存缓存 ID（拉取 ERP 后生成）
  inventory_cache_id UUID,

  -- 统计信息
  stats JSONB DEFAULT '{}'::jsonb,

  -- 错误信息
  error_message TEXT,

  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- 过期时间（用于清理过期批次）
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')
);

-- 库存缓存表：缓存从 ERP 拉取的数据
CREATE TABLE IF NOT EXISTS inventory_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 关联的批次
  batch_id UUID NOT NULL REFERENCES sync_batches(id) ON DELETE CASCADE,

  -- 库存数据（JSONB 格式存储）
  inventory_data JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- SKU 映射数据
  sku_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 全局过滤配置（从 auto_sync_config 读取）
  filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 过期时间
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')
);

-- 站点同步结果表：记录每个站点的同步结果
CREATE TABLE IF NOT EXISTS sync_site_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 关联的批次
  batch_id UUID NOT NULL REFERENCES sync_batches(id) ON DELETE CASCADE,

  -- 站点信息
  site_id UUID NOT NULL,
  site_name TEXT NOT NULL,

  -- 在批次中的顺序（1-N）
  step_index INTEGER NOT NULL,

  -- 状态：pending, running, completed, failed
  status TEXT NOT NULL DEFAULT 'pending',

  -- 同步结果统计
  total_checked INTEGER DEFAULT 0,
  synced_to_instock INTEGER DEFAULT 0,
  synced_to_outofstock INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,

  -- 详细信息（可选，用于调试）
  details JSONB DEFAULT '[]'::jsonb,

  -- 错误信息
  error_message TEXT,

  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sync_batches_status ON sync_batches(status);
CREATE INDEX IF NOT EXISTS idx_sync_batches_created_at ON sync_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_batches_expires_at ON sync_batches(expires_at);

CREATE INDEX IF NOT EXISTS idx_inventory_cache_batch_id ON inventory_cache(batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_cache_expires_at ON inventory_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_sync_site_results_batch_id ON sync_site_results(batch_id);
CREATE INDEX IF NOT EXISTS idx_sync_site_results_status ON sync_site_results(status);

-- 添加注释
COMMENT ON TABLE sync_batches IS '同步批次表：跟踪一轮完整同步任务的状态';
COMMENT ON TABLE inventory_cache IS '库存缓存表：缓存从 ERP 拉取的数据供后续站点同步使用';
COMMENT ON TABLE sync_site_results IS '站点同步结果表：记录每个站点的同步结果';

COMMENT ON COLUMN sync_batches.current_step IS '0=拉取ERP阶段，1-N=同步站点阶段';
COMMENT ON COLUMN sync_batches.status IS 'pending/fetching/syncing/completed/failed';
