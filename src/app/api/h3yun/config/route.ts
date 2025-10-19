import { NextResponse } from 'next/server';
import { env } from '@/env';
import { h3yunSchemaConfig } from '@/config/h3yun.config';

/**
 * 获取氚云配置信息（脱敏）
 * GET /api/h3yun/config
 */
export async function GET() {
  try {
    // 检查配置是否完整（只检查敏感信息）
    const isConfigured = !!(
      env.H3YUN_ENGINE_CODE &&
      env.H3YUN_ENGINE_SECRET &&
      h3yunSchemaConfig.inventorySchemaCode
    );

    if (!isConfigured) {
      return NextResponse.json({
        isConfigured: false,
        error: '氚云 ERP 配置未完成，请检查环境变量和配置文件',
      });
    }

    // 脱敏函数：只显示前4位
    const maskString = (str: string, visibleChars = 4): string => {
      if (!str || str.length <= visibleChars) return str;
      return `${str.substring(0, visibleChars)}***`;
    };

    // 返回脱敏的配置信息
    return NextResponse.json({
      isConfigured: true,
      config: {
        engineCode: maskString(env.H3YUN_ENGINE_CODE),
        engineSecret: maskString(env.H3YUN_ENGINE_SECRET),
        inventorySchemaCode: maskString(h3yunSchemaConfig.inventorySchemaCode),
        warehouseSchemaCode: maskString(h3yunSchemaConfig.warehouseSchemaCode),
      },
    });
  } catch (error) {
    console.error('[H3Yun Config] 获取配置失败:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '获取配置失败',
        isConfigured: false,
      },
      { status: 500 }
    );
  }
}
