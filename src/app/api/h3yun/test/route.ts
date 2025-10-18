import { NextResponse } from 'next/server';
import { createH3YunClient } from '@/lib/h3yun/client';
import type { H3YunConfig } from '@/lib/h3yun/types';
import { env } from '@/env';

/**
 * 测试氚云 ERP 连接
 * POST /api/h3yun/test
 */
export async function POST() {
  try {
    // 从环境变量读取配置
    const config: H3YunConfig = {
      engineCode: env.H3YUN_ENGINE_CODE,
      engineSecret: env.H3YUN_ENGINE_SECRET,
      schemaCode: env.H3YUN_INVENTORY_SCHEMA_CODE,
      warehouseSchemaCode: env.H3YUN_WAREHOUSE_SCHEMA_CODE,
    };

    if (!config.engineCode || !config.engineSecret || !config.schemaCode) {
      return NextResponse.json(
        { success: false, error: '氚云 ERP 配置未完成，请在环境变量中配置' },
        { status: 500 }
      );
    }

    const client = createH3YunClient(config);
    const result = await client.testConnection();

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '测试失败',
      },
      { status: 500 }
    );
  }
}
