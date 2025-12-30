/**
 * 氚云 API 连接测试
 * 用于诊断氚云 API 连接和认证问题
 */

import { NextResponse } from 'next/server';
import { h3yunSchemaConfig } from '@/config/h3yun.config';

export async function GET() {
  try {
    const engineCode = process.env.H3YUN_ENGINE_CODE;
    const engineSecret = process.env.H3YUN_ENGINE_SECRET;
    const schemaCode = h3yunSchemaConfig.inventorySchemaCode;

    // 检查环境变量
    if (!engineCode || !engineSecret || !schemaCode) {
      return NextResponse.json({
        success: false,
        error: '氚云环境变量未配置',
        missing: {
          engineCode: !engineCode,
          engineSecret: !engineSecret,
          schemaCode: !schemaCode,
        },
      });
    }

    // 构造最简单的测试请求
    const requestBody = {
      ActionName: 'LoadBizObjects',
      SchemaCode: schemaCode,
      Filter: JSON.stringify({
        FromRowNum: 0,
        ToRowNum: 1,
        RequireCount: false,
        ReturnItems: [],
        SortByCollection: [],
        Matcher: {
          Type: 'And',
          Matchers: [],
        },
      }),
    };

    console.log('[H3Yun Ping] 发送测试请求到氚云 API...');
    console.log('[H3Yun Ping] EngineCode:', engineCode);
    console.log('[H3Yun Ping] SchemaCode:', schemaCode);

    const response = await fetch('https://www.h3yun.com/OpenApi/Invoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        EngineCode: engineCode,
        EngineSecret: engineSecret,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[H3Yun Ping] HTTP Status:', response.status);
    console.log('[H3Yun Ping] Content-Type:', response.headers.get('content-type'));

    // 获取原始响应文本
    const responseText = await response.text();
    console.log('[H3Yun Ping] 原始响应:', responseText.substring(0, 200));

    // 尝试解析 JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: '氚云 API 返回非 JSON 格式',
        httpStatus: response.status,
        contentType: response.headers.get('content-type'),
        rawResponse: responseText.substring(0, 500),
      });
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `氚云 API HTTP 错误: ${response.status}`,
        httpStatus: response.status,
        apiResponse: data,
      });
    }

    if (!data.Successful) {
      return NextResponse.json({
        success: false,
        error: `氚云 API 业务错误: ${data.ErrorMessage || '未知错误'}`,
        apiResponse: data,
      });
    }

    return NextResponse.json({
      success: true,
      message: '氚云 API 连接成功',
      dataCount: data.BizObjectArray?.length || 0,
      apiResponse: {
        Successful: data.Successful,
        ReturnDataCount: data.ReturnDataCount,
      },
    });

  } catch (error) {
    console.error('[H3Yun Ping] 错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
