import { NextResponse } from 'next/server';
import { env } from '@/env';

/**
 * 获取氚云配置信息（脱敏）
 * GET /api/h3yun/config
 */
export async function GET() {
  try {
    // 检查配置是否完整
    const isConfigured = !!(
      env.H3YUN_ENGINE_CODE &&
      env.H3YUN_ENGINE_SECRET &&
      env.H3YUN_INVENTORY_SCHEMA_CODE
    );

    if (!isConfigured) {
      return NextResponse.json({
        isConfigured: false,
        error: '氚云 ERP 配置未完成，请在环境变量中配置',
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
        inventorySchemaCode: maskString(env.H3YUN_INVENTORY_SCHEMA_CODE),
        warehouseSchemaCode: maskString(env.H3YUN_WAREHOUSE_SCHEMA_CODE),
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
