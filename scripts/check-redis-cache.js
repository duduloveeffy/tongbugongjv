/**
 * 检查 Redis 缓存中的数据
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const redis = new Redis(process.env.REDIS_URL);

async function checkCache() {
  try {
    // 1. 获取最近的批次
    const { data: batches } = await supabase
      .from('sync_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!batches || batches.length === 0) {
      console.log('没有批次');
      return;
    }

    const batch = batches[0];
    console.log(`=== 批次 ${batch.id} ===`);
    console.log(`状态: ${batch.status}`);
    console.log(`创建时间: ${new Date(batch.created_at).toLocaleString('zh-CN')}`);

    // 2. 检查缓存
    const cacheKey = `batch:${batch.id}`;
    const cacheData = await redis.get(cacheKey);

    if (!cacheData) {
      console.log('\n❌ Redis 中没有缓存数据');
      return;
    }

    const cache = JSON.parse(cacheData);
    console.log('\n✅ 找到缓存数据:');
    console.log(`- 库存记录数: ${cache.inventory_data?.length || 0}`);
    console.log(`- SKU 映射数: ${Object.keys(cache.sku_mappings || {}).length}`);
    console.log(`- 筛选配置: ${JSON.stringify(cache.filter_config || {}, null, 2)}`);

    // 3. 检查筛选后的数据
    if (cache.inventory_data) {
      const sampleItems = cache.inventory_data.slice(0, 5);
      console.log('\n前5条库存记录:');
      sampleItems.forEach((item, i) => {
        console.log(`${i + 1}. SKU: ${item.产品代码}, 仓库: ${item.仓库}, 可售库存: ${item.可售库存}`);
      });
    }

  } catch (error) {
    console.error('检查缓存失败:', error);
  } finally {
    await redis.quit();
  }
}

checkCache();
