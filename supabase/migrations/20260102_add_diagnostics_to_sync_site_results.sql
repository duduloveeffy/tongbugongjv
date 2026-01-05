-- 添加诊断信息字段到站点同步结果表
-- 用于记录产品检测的缓存命中情况和需要同步的 SKU 列表

ALTER TABLE sync_site_results
ADD COLUMN IF NOT EXISTS diagnostics JSONB DEFAULT NULL;

COMMENT ON COLUMN sync_site_results.diagnostics IS '诊断信息：包含缓存命中率、需同步SKU列表等调试数据';
