#!/usr/bin/env node
/**
 * 清理 Redis 缓存
 */

import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

async function clearCache() {
  console.log('🧹 清理 Redis 缓存\n');
  
  try {
    // 列出所有键
    const keys = await redis.keys('*');
    console.log(`找到 ${keys.length} 个缓存键`);
    
    if (keys.length > 0) {
      // 显示前10个键
      console.log('\n缓存键示例:');
      keys.slice(0, 10).forEach(key => {
        console.log(`  - ${key}`);
      });
      
      // 删除所有品类相关的缓存
      const categoryKeys = keys.filter(key => 
        key.includes('category') || key.includes('JNR18-02')
      );
      
      if (categoryKeys.length > 0) {
        console.log(`\n删除 ${categoryKeys.length} 个品类相关缓存键...`);
        
        for (const key of categoryKeys) {
          await redis.del(key);
        }
        
        console.log('✅ 品类缓存已清理');
      }
      
      // 可选：清理所有缓存
      console.log('\n是否要清理所有缓存？这将删除所有缓存数据。');
      console.log('如需清理所有缓存，请运行: node clear-redis-cache.js --all');
      
      if (process.argv.includes('--all')) {
        console.log('\n清理所有缓存...');
        await redis.flushdb();
        console.log('✅ 所有缓存已清理');
      }
    } else {
      console.log('缓存为空');
    }
    
  } catch (error) {
    console.error('清理缓存失败:', error.message);
    console.log('\n提示: 如果没有配置 Redis，缓存功能会自动降级到内存缓存');
  }
}

clearCache().catch(console.error);