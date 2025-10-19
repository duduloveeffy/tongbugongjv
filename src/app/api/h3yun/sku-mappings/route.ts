import { type NextRequest, NextResponse } from 'next/server';
import { createH3YunClient } from '@/lib/h3yun/client';
import type { H3YunConfig } from '@/lib/h3yun/types';
import { env } from '@/env';
import { h3yunSchemaConfig } from '@/config/h3yun.config';

/**
 * 获取SKU映射表数据
 * GET /api/h3yun/sku-mappings
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[H3Yun SKU Mappings API] 开始获取SKU映射表');

    // 合并配置
    const config: H3YunConfig = {
      engineCode: env.H3YUN_ENGINE_CODE,
      engineSecret: env.H3YUN_ENGINE_SECRET,
      schemaCode: h3yunSchemaConfig.inventorySchemaCode,
      warehouseSchemaCode: h3yunSchemaConfig.warehouseSchemaCode,
      skuMappingSchemaCode: h3yunSchemaConfig.skuMappingSchemaCode,
    };

    // 验证配置
    if (!config.engineCode || !config.engineSecret) {
      return NextResponse.json(
        { success: false, error: '氚云 ERP 配置不完整' },
        { status: 500 }
      );
    }

    console.log(`[H3Yun SKU Mappings API] 映射表编码: ${config.skuMappingSchemaCode}`);

    // 创建客户端
    const client = createH3YunClient(config);

    // 获取映射表数据（最多500条）
    const mappings = await client.fetchSkuMappings(500);

    console.log(`[H3Yun SKU Mappings API] 成功获取 ${mappings.length} 条映射记录`);

    return NextResponse.json({
      success: true,
      mappings,
      count: mappings.length,
      schemaCode: config.skuMappingSchemaCode,
    });
  } catch (error) {
    console.error('[H3Yun SKU Mappings API] 获取失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取映射表失败',
        mappings: [], // 返回空数组，允许降级到无映射模式
        count: 0,
      },
      { status: 500 }
    );
  }
}
