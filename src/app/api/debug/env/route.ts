import { NextResponse } from 'next/server';
import { env } from '@/env';

/**
 * 调试端点：检查环境变量是否正确配置
 * GET /api/debug/env
 *
 * ⚠️ 仅用于调试，生产环境应该禁用或删除此端点
 */
export async function GET() {
  try {
    // 检查所有必需的氚云环境变量
    const envCheck = {
      H3YUN_ENGINE_CODE: {
        exists: !!env.H3YUN_ENGINE_CODE,
        length: env.H3YUN_ENGINE_CODE?.length || 0,
        preview: env.H3YUN_ENGINE_CODE?.substring(0, 4) + '***',
      },
      H3YUN_ENGINE_SECRET: {
        exists: !!env.H3YUN_ENGINE_SECRET,
        length: env.H3YUN_ENGINE_SECRET?.length || 0,
        preview: env.H3YUN_ENGINE_SECRET?.substring(0, 4) + '***',
      },
      H3YUN_INVENTORY_SCHEMA_CODE: {
        exists: !!env.H3YUN_INVENTORY_SCHEMA_CODE,
        length: env.H3YUN_INVENTORY_SCHEMA_CODE?.length || 0,
        preview: env.H3YUN_INVENTORY_SCHEMA_CODE?.substring(0, 4) + '***',
      },
      H3YUN_WAREHOUSE_SCHEMA_CODE: {
        exists: !!env.H3YUN_WAREHOUSE_SCHEMA_CODE,
        length: env.H3YUN_WAREHOUSE_SCHEMA_CODE?.length || 0,
        preview: env.H3YUN_WAREHOUSE_SCHEMA_CODE?.substring(0, 4) + '***',
      },
    };

    // 检查是否所有变量都存在
    const allConfigured = Object.values(envCheck).every((v) => v.exists);

    return NextResponse.json({
      allConfigured,
      environment: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      details: envCheck,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '检查失败',
        allConfigured: false,
      },
      { status: 500 }
    );
  }
}
