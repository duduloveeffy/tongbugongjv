import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: batch } = await supabase
    .from('sync_batches')
    .select('*')
    .in('status', ['syncing', 'fetching'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!batch) {
    console.log('没有进行中的批次');
    return;
  }

  console.log('=== 当前批次 ===');
  console.log('ID:', batch.id);
  console.log('状态:', batch.status);
  console.log('当前步骤:', batch.current_step, '/', batch.total_sites);
  console.log('创建时间:', new Date(batch.created_at).toLocaleString('zh-CN'));

  const now = new Date();
  const created = new Date(batch.created_at);
  const durationSec = (now - created) / 1000;
  console.log('已运行:', durationSec.toFixed(0), '秒');

  const { data: siteResults } = await supabase
    .from('sync_site_results')
    .select('*')
    .eq('batch_id', batch.id);

  console.log('\n站点结果:');
  for (const r of siteResults || []) {
    console.log('  站点:', r.site_name);
    console.log('    状态:', r.status);
    console.log('    检测SKU:', r.total_checked || 0);
    console.log('    开始:', r.started_at ? new Date(r.started_at).toLocaleString('zh-CN') : '未开始');
    console.log('    完成:', r.completed_at ? new Date(r.completed_at).toLocaleString('zh-CN') : '进行中');
  }
}

check().catch(console.error);
