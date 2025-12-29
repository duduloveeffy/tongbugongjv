async function runMigration() {
  const url = 'https://evcmuhykdcmyvgbyluds.supabase.co';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2Y211aHlrZGNteXZnYnlsdWRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDU2MDY4OCwiZXhwIjoyMDcwMTM2Njg4fQ.KljaPh35GDCtBFBzflnrEfoqsNYodltWN_TzakXdiB4';

  // Execute SQL via RPC
  const sql = `
    ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS sku_filter text DEFAULT '';
    ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS exclude_sku_prefixes text DEFAULT '';
    ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS category_filters text[] DEFAULT '{}';
    ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS exclude_warehouses text DEFAULT '';
  `;

  // Supabase doesn't have direct SQL execution via REST API
  // Need to use the management API or run in Supabase Dashboard

  console.log('需要在 Supabase Dashboard 中执行以下 SQL:');
  console.log('=========================================');
  console.log(sql);
  console.log('=========================================');
  console.log('\n打开 Supabase Dashboard -> SQL Editor -> 粘贴以上SQL -> Run');
  console.log('URL: https://supabase.com/dashboard/project/evcmuhykdcmyvgbyluds/sql/new');
}

runMigration();
