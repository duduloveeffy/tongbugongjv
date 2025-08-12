import { Redis } from '@upstash/redis';
import * as LZString from 'lz-string';
import { env } from '@/env';

// 创建 Redis 客户端单例
let redisClient: Redis | null = null;

/**
 * 获取 Redis 客户端实例
 */
export function getRedisClient(): Redis | null {
  if (!redisClient) {
    const url = env.UPSTASH_REDIS_REST_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      console.warn('Redis credentials not configured. Caching will be disabled.');
      return null;
    }

    try {
      redisClient = new Redis({
        url,
        token,
      });
    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      return null;
    }
  }

  return redisClient;
}

/**
 * 缓存键前缀，用于命名空间隔离
 */
export const CACHE_KEYS = {
  INVENTORY: 'inventory',
  SALES: 'sales',
  PRODUCTS: 'products',
  SESSION: 'session',
  SYNC_STATE: 'sync_state',
} as const;

/**
 * 缓存 TTL（秒）
 */
export const CACHE_TTL = {
  INVENTORY: 86400,    // 24 小时
  SALES: 21600,         // 6 小时
  PRODUCTS: 43200,      // 12 小时
  SESSION: 604800,      // 7 天
  SHORT: 300,           // 5 分钟
} as const;

/**
 * 压缩数据
 */
function compress(data: any): string {
  try {
    const jsonString = JSON.stringify(data);
    return LZString.compressToBase64(jsonString);
  } catch (error) {
    console.error('Compression failed:', error);
    throw error;
  }
}

/**
 * 解压数据
 */
function decompress(compressed: string): any {
  try {
    const jsonString = LZString.decompressFromBase64(compressed);
    if (!jsonString) {
      throw new Error('Decompression resulted in null');
    }
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Decompression failed:', error);
    throw error;
  }
}

/**
 * 设置缓存（带压缩）
 */
export async function setCache(
  key: string,
  value: any,
  ttl: number = CACHE_TTL.SHORT
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  try {
    const compressed = compress(value);
    await redis.setex(key, ttl, compressed);
    return true;
  } catch (error) {
    console.error(`Failed to set cache for key ${key}:`, error);
    return false;
  }
}

/**
 * 获取缓存（带解压）
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const compressed = await redis.get<string>(key);
    if (!compressed) return null;
    
    return decompress(compressed) as T;
  } catch (error) {
    console.error(`Failed to get cache for key ${key}:`, error);
    return null;
  }
}

/**
 * 删除缓存
 */
export async function deleteCache(key: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error(`Failed to delete cache for key ${key}:`, error);
    return false;
  }
}

/**
 * 批量删除缓存（通过模式匹配）
 */
export async function deleteCacheByPattern(pattern: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  try {
    // 使用 SCAN 命令查找匹配的键
    const keys: string[] = [];
    let cursor = 0;
    
    do {
      const result = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0);

    // 批量删除找到的键
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to delete cache by pattern ${pattern}:`, error);
    return false;
  }
}

/**
 * 缓存库存数据
 */
export async function cacheInventoryData(
  userId: string,
  data: any,
  ttl: number = CACHE_TTL.INVENTORY
): Promise<boolean> {
  const key = `${CACHE_KEYS.INVENTORY}:${userId}`;
  return setCache(key, data, ttl);
}

/**
 * 获取缓存的库存数据
 */
export async function getCachedInventoryData(userId: string): Promise<any | null> {
  const key = `${CACHE_KEYS.INVENTORY}:${userId}`;
  return getCache(key);
}

/**
 * 缓存销售查询结果
 */
export async function cacheSalesData(
  skuHash: string,
  dateRange: string,
  data: any,
  ttl: number = CACHE_TTL.SALES
): Promise<boolean> {
  const key = `${CACHE_KEYS.SALES}:${skuHash}:${dateRange}`;
  return setCache(key, data, ttl);
}

/**
 * 获取缓存的销售数据
 */
export async function getCachedSalesData(
  skuHash: string,
  dateRange: string
): Promise<any | null> {
  const key = `${CACHE_KEYS.SALES}:${skuHash}:${dateRange}`;
  return getCache(key);
}

/**
 * 缓存产品信息
 */
export async function cacheProductData(
  sku: string,
  siteId: string,
  data: any,
  ttl: number = CACHE_TTL.PRODUCTS
): Promise<boolean> {
  const key = `${CACHE_KEYS.PRODUCTS}:${siteId}:${sku}`;
  return setCache(key, data, ttl);
}

/**
 * 获取缓存的产品信息
 */
export async function getCachedProductData(
  sku: string,
  siteId: string
): Promise<any | null> {
  const key = `${CACHE_KEYS.PRODUCTS}:${siteId}:${sku}`;
  return getCache(key);
}

/**
 * 清理用户相关的所有缓存
 */
export async function clearUserCache(userId: string): Promise<boolean> {
  const patterns = [
    `${CACHE_KEYS.INVENTORY}:${userId}*`,
    `${CACHE_KEYS.SESSION}:${userId}*`,
  ];

  try {
    for (const pattern of patterns) {
      await deleteCacheByPattern(pattern);
    }
    return true;
  } catch (error) {
    console.error('Failed to clear user cache:', error);
    return false;
  }
}

/**
 * 获取缓存统计信息
 */
export async function getCacheStats(): Promise<{
  connected: boolean;
  dbSize?: number;
  info?: string;
} | null> {
  const redis = getRedisClient();
  if (!redis) {
    return { connected: false };
  }

  try {
    const dbSize = await redis.dbsize();
    const info = await redis.info();
    
    return {
      connected: true,
      dbSize,
      info,
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return { connected: false };
  }
}

/**
 * 生成缓存键的哈希值（用于长键名）
 */
export function generateCacheKey(...parts: string[]): string {
  const key = parts.join(':');
  // 如果键太长，使用哈希值
  if (key.length > 200) {
    const hash = Buffer.from(key).toString('base64').slice(0, 32);
    return `${parts[0]}:hash:${hash}`;
  }
  return key;
}

/**
 * Cache-Aside 模式辅助函数
 */
export async function cacheAside<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL.SHORT
): Promise<T> {
  // 尝试从缓存获取
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  // 缓存未命中，从数据源获取
  const data = await fetcher();
  
  // 异步写入缓存（不阻塞返回）
  setCache(key, data, ttl).catch(error => {
    console.error('Failed to cache data:', error);
  });

  return data;
}