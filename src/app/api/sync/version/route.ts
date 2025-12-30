/**
 * 版本检查端点 - 验证代码是否已部署
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: '2025-12-30-19:21',
    feature: 'warehouse-filter-with-debug-logs',
    commit: '692e90f',
    timestamp: new Date().toISOString(),
    message: '仓库筛选功能已添加，包含详细调试日志',
  });
}
