-- 为 wc_sites 表添加站点级 SKU 过滤字段
-- 每个站点可以配置独立的 SKU 筛选规则

-- SKU 筛选（包含匹配）
ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS sku_filter text DEFAULT '';

-- SKU 前缀排除
ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS exclude_sku_prefixes text DEFAULT '';

-- 品类筛选（数组）
ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS category_filters text[] DEFAULT '{}';

-- 排除仓库
ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS exclude_warehouses text DEFAULT '';

-- 添加注释
COMMENT ON COLUMN wc_sites.sku_filter IS 'SKU筛选关键词，多个用逗号分隔';
COMMENT ON COLUMN wc_sites.exclude_sku_prefixes IS '排除的SKU前缀，多个用逗号分隔';
COMMENT ON COLUMN wc_sites.category_filters IS '品类筛选数组';
COMMENT ON COLUMN wc_sites.exclude_warehouses IS '排除的仓库名称，多个用逗号分隔';
