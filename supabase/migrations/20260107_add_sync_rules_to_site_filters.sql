-- 为 site_filters 表添加 sync_rules 字段
-- 用于存储 SKU 特殊同步规则（仓库过滤、阈值等）

-- 添加 sync_rules JSONB 字段
ALTER TABLE site_filters
ADD COLUMN IF NOT EXISTS sync_rules JSONB DEFAULT '{}';

-- 添加注释
COMMENT ON COLUMN site_filters.sync_rules IS 'SKU同步规则配置，JSON格式：{sku_warehouse_rules: {SKU前缀: [允许仓库]}, instock_threshold: {SKU前缀: 阈值}}';

-- 示例数据结构：
-- {
--   "sku_warehouse_rules": {
--     "JNR1802*": ["德一仓"],
--     "JNR1602*": ["德一仓"]
--   },
--   "instock_threshold": {
--     "JNRP2802*": 25,
--     "JNRR2802*": 30,
--     "JNR1802*": 30,
--     "JNR1602*": 30
--   }
-- }