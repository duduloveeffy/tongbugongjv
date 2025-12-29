import { NextRequest, NextResponse } from 'next/server';
import { getAutoSyncLogsAsync } from '@/lib/local-config-store';

// 获取自动同步日志（Supabase 版本）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    const logs = await getAutoSyncLogsAsync(limit);

    return NextResponse.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error('[auto-logs] GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取日志失败' },
      { status: 500 }
    );
  }
}