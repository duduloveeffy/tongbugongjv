/**
 * 运行时日志 API
 * 提供实时的后端执行日志
 */

import { NextRequest, NextResponse } from 'next/server';
import { runtimeLogger } from '@/lib/runtime-logger';

/**
 * 获取日志
 */
export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
  const logs = runtimeLogger.getLogs(limit);

  return NextResponse.json({
    success: true,
    logs,
    total: logs.length,
  });
}

/**
 * 清空日志
 */
export async function DELETE() {
  const count = runtimeLogger.clear();

  return NextResponse.json({
    success: true,
    message: `已清空 ${count} 条日志`,
  });
}
