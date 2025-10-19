import { type NextRequest, NextResponse } from 'next/server';
import { createH3YunClient } from '@/lib/h3yun/client';
import type { H3YunConfig } from '@/lib/h3yun/types';
import { env } from '@/env';
import { h3yunSchemaConfig } from '@/config/h3yun.config';

/**
 * 测试SKU映射表访问
 * GET /api/h3yun/test-sku-mapping
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[H3Yun SKU Mapping Test] 开始测试SKU映射表访问');

    // 合并配置：敏感信息从环境变量读取，SchemaCode从配置文件读取
    const config: H3YunConfig = {
      engineCode: env.H3YUN_ENGINE_CODE,
      engineSecret: env.H3YUN_ENGINE_SECRET,
      schemaCode: h3yunSchemaConfig.inventorySchemaCode,
      warehouseSchemaCode: h3yunSchemaConfig.warehouseSchemaCode,
      skuMappingSchemaCode: h3yunSchemaConfig.skuMappingSchemaCode,
    };

    // 验证配置
    if (!config.engineCode || !config.engineSecret || !config.schemaCode) {
      return NextResponse.json(
        { error: '氚云 ERP 配置不完整' },
        { status: 500 }
      );
    }

    console.log('[H3Yun SKU Mapping Test] 配置验证通过');
    console.log(`[H3Yun SKU Mapping Test] SKU映射表编码: ${config.skuMappingSchemaCode}`);

    // 创建客户端
    const client = createH3YunClient(config);

    // 测试SKU映射表访问
    try {
      const mappings = await client.fetchSkuMappings(100); // 只获取前100条测试

      console.log(`[H3Yun SKU Mapping Test] 成功获取 ${mappings.length} 条SKU映射记录`);

      // 分析映射数据
      const stats = {
        total: mappings.length,
        valid: 0,
        invalid: 0,
        samples: [] as Array<{
          woocommerceSku: string;
          h3yunSkuId: string;
          quantity: number;
        }>,
      };

      for (const mapping of mappings) {
        const wooSku = mapping.F0000001?.trim();
        const h3yunSku = mapping.F0000002?.trim();
        const quantity = mapping.F0000003 || 1;

        if (wooSku && h3yunSku) {
          stats.valid++;
          // 收集前5个有效样本
          if (stats.samples.length < 5) {
            stats.samples.push({
              woocommerceSku: wooSku,
              h3yunSkuId: h3yunSku,
              quantity: quantity,
            });
          }
        } else {
          stats.invalid++;
        }
      }

      console.log(`[H3Yun SKU Mapping Test] 统计: 有效=${stats.valid}, 无效=${stats.invalid}`);

      // 【诊断】返回前3条原始记录供检查
      const rawSamples = mappings.slice(0, 3).map(m => ({
        ObjectId: m.ObjectId,
        allFields: Object.keys(m),
        F0000001: m.F0000001,
        F0000002: m.F0000002,
        F0000003: m.F0000003,
        fullData: m,
      }));

      return NextResponse.json({
        success: true,
        message: 'SKU映射表访问成功',
        schemaCode: config.skuMappingSchemaCode,
        stats,
        rawSamples, // 【新增】原始数据样本
      });
    } catch (error) {
      console.error('[H3Yun SKU Mapping Test] 访问失败:', error);

      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : '访问失败',
          schemaCode: config.skuMappingSchemaCode,
          troubleshooting: [
            '1. 检查表单编码是否正确',
            '2. 确认当前账号是否有访问该表单的权限',
            '3. 验证表单中是否包含必需字段: F0000001, F0000002, F0000003',
            '4. 如果表单不存在或无法访问，请在前端关闭"启用SKU映射"开关',
          ],
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[H3Yun SKU Mapping Test] 测试失败:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '测试失败',
      },
      { status: 500 }
    );
  }
}
