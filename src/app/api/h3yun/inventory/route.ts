import { type NextRequest, NextResponse } from 'next/server';
import { createH3YunClient } from '@/lib/h3yun/client';
import { transformH3YunBatch, transformH3YunBatchWithMapping, extractUniqueWarehouses } from '@/lib/h3yun/transformer';
import type { WarehouseMapping, H3YunConfig } from '@/lib/h3yun/types';
import { env } from '@/env';
import { h3yunSchemaConfig } from '@/config/h3yun.config';

export async function POST(request: NextRequest) {
  try {
    // 从请求体读取可选参数
    const body = await request.json();
    const { warehouseMappings, pageSize = 500, enableSkuMapping = false } = body;

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
        { error: '氚云 ERP 配置未完成，请检查环境变量和配置文件' },
        { status: 500 }
      );
    }

    console.log('[H3Yun Sync] 开始同步库存数据');
    console.log('[H3Yun Sync] 使用 pageSize:', pageSize);
    console.log('[H3Yun Sync] SKU映射模式:', enableSkuMapping ? '启用' : '关闭');

    // 创建客户端
    const client = createH3YunClient(config);

    // 测试连接
    const testResult = await client.testConnection();
    if (!testResult.success) {
      return NextResponse.json(
        { error: `氚云连接失败: ${testResult.error}` },
        { status: 500 }
      );
    }

    // 步骤1: 获取所有库存数据（使用默认 pageSize=500）
    const h3yunData = await client.fetchAllInventory(pageSize);
    console.log(`[H3Yun Sync] 获取到 ${h3yunData.length} 条氚云库存记录`);

    // 步骤2: 如果启用SKU映射，获取映射表数据
    let skuMappingObjects;
    if (enableSkuMapping) {
      console.log('[H3Yun Sync] 开始获取SKU映射表数据...');
      try {
        skuMappingObjects = await client.fetchSkuMappings(pageSize);
        console.log(`[H3Yun Sync] SKU映射表获取成功: ${skuMappingObjects.length} 条记录`);
      } catch (error) {
        console.error('[H3Yun Sync] SKU映射表获取失败:', error);
        return NextResponse.json(
          { error: `SKU映射表获取失败: ${error instanceof Error ? error.message : '未知错误'}` },
          { status: 500 }
        );
      }
    }

    // 步骤3: 提取所有唯一的仓库ID
    const warehouseIds = extractUniqueWarehouses(h3yunData);
    console.log(`[H3Yun Sync] 发现 ${warehouseIds.length} 个唯一仓库`);

    // 步骤4: 批量查询仓库名称
    const warehouseNameMap = await client.fetchWarehouseNames(warehouseIds);

    // 步骤5: 转换为 WarehouseMapping 格式
    const warehouseMappingsFromApi: WarehouseMapping[] = Array.from(
      warehouseNameMap.entries()
    ).map(([id, name]) => ({ id, name }));

    console.log(`[H3Yun Sync] 仓库映射创建完成: ${warehouseMappingsFromApi.length} 个仓库`);

    // 步骤6: 合并用户提供的映射（如果有）
    const finalMappings = warehouseMappings?.length
      ? [...warehouseMappingsFromApi, ...warehouseMappings]
      : warehouseMappingsFromApi;

    // 步骤7: 转换数据（根据是否启用SKU映射选择不同的转换函数）
    const result = enableSkuMapping && skuMappingObjects
      ? transformH3YunBatchWithMapping(h3yunData, finalMappings, skuMappingObjects)
      : transformH3YunBatch(h3yunData, finalMappings);

    if (!result.success || !result.data) {
      return NextResponse.json({ error: '数据转换失败' }, { status: 500 });
    }

    console.log(
      `[H3Yun Sync] 转换完成: ${result.stats?.validRecords} 有效记录, ${result.stats?.skippedRecords} 跳过`
    );

    // 返回转换后的数据
    return NextResponse.json({
      success: true,
      data: result.data,
      stats: result.stats,
      headers: Object.keys(result.data[0] || {}),
    });
  } catch (error) {
    console.error('[H3Yun Sync] 同步失败:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '未知错误',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
