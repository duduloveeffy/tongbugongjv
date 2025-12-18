-- 创建周备注表
CREATE TABLE IF NOT EXISTS week_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INTEGER NOT NULL,
    week INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(year, week)
);

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_week_notes_year_week ON week_notes(year, week);

-- 创建更新触发器
CREATE OR REPLACE FUNCTION update_week_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_week_notes_updated_at ON week_notes;
CREATE TRIGGER trigger_update_week_notes_updated_at
    BEFORE UPDATE ON week_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_week_notes_updated_at();

-- 禁用 RLS (简化操作，因为这是内部工具)
ALTER TABLE week_notes DISABLE ROW LEVEL SECURITY;
