import { NextResponse } from 'next/server';
import { getRedisClient, getCacheStats, setCache, getCache, CACHE_TTL } from '@/lib/redis-cache';

export async function GET() {
  try {
    const redis = getRedisClient();
    
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis not configured',
        message: 'Please configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your environment variables'
      }, { status: 503 });
    }

    // 测试基本连接
    const stats = await getCacheStats();
    
    // 测试写入
    const testKey = 'test:connection';
    const testData = {
      timestamp: new Date().toISOString(),
      message: 'Redis connection successful',
      random: Math.random()
    };
    
    const writeSuccess = await setCache(testKey, testData, CACHE_TTL.SHORT);
    
    // 测试读取
    const readData = await getCache(testKey);
    
    // 验证数据完整性
    const dataMatch = JSON.stringify(readData) === JSON.stringify(testData);
    
    return NextResponse.json({
      success: true,
      connection: {
        status: 'connected',
        stats
      },
      test: {
        write: writeSuccess,
        read: readData !== null,
        dataIntegrity: dataMatch,
        testData,
        readData
      },
      message: 'Redis cache is working properly!'
    });
    
  } catch (error: any) {
    console.error('Redis test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to test Redis connection',
      details: error.toString()
    }, { status: 500 });
  }
}