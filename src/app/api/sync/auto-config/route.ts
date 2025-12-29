import { NextRequest, NextResponse } from 'next/server';
import { getAutoSyncConfigAsync, saveAutoSyncConfigAsync } from '@/lib/local-config-store';

// 获取自动同步配置（Supabase 版本）
export async function GET(_request: NextRequest) {
  try {
    const config = await getAutoSyncConfigAsync();

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('[auto-config] GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取配置失败' },
      { status: 500 }
    );
  }
}

// 更新自动同步配置（Supabase 版本）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 保存配置
    const updatedConfig = await saveAutoSyncConfigAsync(body);

    return NextResponse.json({
      success: true,
      config: updatedConfig,
    });
  } catch (error) {
    console.error('[auto-config] POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '保存配置失败' },
      { status: 500 }
    );
  }
}