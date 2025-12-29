-- 创建站点筛选配置表（独立于 wc_sites）
-- 一个站点可以有一个筛选配置（一对一关系）

CREATE TABLE IF NOT EXISTS site_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES wc_sites(id) ON DELETE CASCADE,

  -- SKU 筛选配置
  sku_filter TEXT DEFAULT '',              -- SKU包含筛选，多个用逗号分隔
  exclude_sku_prefixes TEXT DEFAULT '',    -- 排除的SKU前缀，多个用逗号分隔

  -- 品类筛选
  category_filters TEXT[] DEFAULT '{}',    -- 品类筛选数组

  -- 仓库筛选
  exclude_warehouses TEXT DEFAULT '',      -- 排除的仓库名称，多个用逗号分隔

  -- 元数据
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 确保每个站点只有一个筛选配置
  CONSTRAINT unique_site_filter UNIQUE (site_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_site_filters_site_id ON site_filters(site_id);

-- 添加注释
COMMENT ON TABLE site_filters IS '站点SKU筛选配置表';
COMMENT ON COLUMN site_filters.site_id IS '关联的站点ID';
COMMENT ON COLUMN site_filters.sku_filter IS 'SKU筛选关键词，多个用逗号分隔，匹配任一即通过';
COMMENT ON COLUMN site_filters.exclude_sku_prefixes IS '排除的SKU前缀，多个用逗号分隔';
COMMENT ON COLUMN site_filters.category_filters IS '品类筛选数组';
COMMENT ON COLUMN site_filters.exclude_warehouses IS '排除的仓库名称，多个用逗号分隔';

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_site_filters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_site_filters_updated_at ON site_filters;
CREATE TRIGGER trigger_site_filters_updated_at
  BEFORE UPDATE ON site_filters
  FOR EACH ROW
  EXECUTE FUNCTION update_site_filters_updated_at();

-- 如果之前已经在 wc_sites 表添加了筛选字段，迁移数据到新表
-- （可选：如果 wc_sites 有这些字段的话）
DO $$
BEGIN
  -- 检查 wc_sites 是否有 sku_filter 列
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wc_sites' AND column_name = 'sku_filter'
  ) THEN
    -- 迁移现有数据
    INSERT INTO site_filters (site_id, sku_filter, exclude_sku_prefixes, category_filters, exclude_warehouses)
    SELECT
      id,
      COALESCE(sku_filter, ''),
      COALESCE(exclude_sku_prefixes, ''),
      COALESCE(category_filters, '{}'),
      COALESCE(exclude_warehouses, '')
    FROM wc_sites
    WHERE sku_filter IS NOT NULL
       OR exclude_sku_prefixes IS NOT NULL
       OR category_filters IS NOT NULL
       OR exclude_warehouses IS NOT NULL
    ON CONFLICT (site_id) DO UPDATE SET
      sku_filter = EXCLUDED.sku_filter,
      exclude_sku_prefixes = EXCLUDED.exclude_sku_prefixes,
      category_filters = EXCLUDED.category_filters,
      exclude_warehouses = EXCLUDED.exclude_warehouses;

    -- 可选：删除 wc_sites 中的旧字段（取消注释以执行）
    -- ALTER TABLE wc_sites DROP COLUMN IF EXISTS sku_filter;
    -- ALTER TABLE wc_sites DROP COLUMN IF EXISTS exclude_sku_prefixes;
    -- ALTER TABLE wc_sites DROP COLUMN IF EXISTS category_filters;
    -- ALTER TABLE wc_sites DROP COLUMN IF EXISTS exclude_warehouses;

    RAISE NOTICE '已从 wc_sites 迁移筛选配置到 site_filters 表';
  END IF;
END $$;
