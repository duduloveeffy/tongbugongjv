import { NextRequest, NextResponse } from 'next/server';
import { startLocalCron, stopLocalCron, triggerNow, getCronStatus } from '@/lib/local-cron';

// 获取本地 cron 状态
export async function GET() {
  const status = getCronStatus();
  return NextResponse.json({
    success: true,
    ...status,
    mode: process.env.NODE_ENV === 'development' ? 'local' : 'vercel',
  });
}

// 控制本地 cron
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, intervalMinutes } = body;

    switch (action) {
      case 'start':
        const interval = (intervalMinutes || 60) * 60 * 1000; // 默认 60 分钟
        startLocalCron(interval);
        return NextResponse.json({ success: true, message: '本地定时任务已启动' });

      case 'stop':
        stopLocalCron();
        return NextResponse.json({ success: true, message: '本地定时任务已停止' });

      case 'trigger':
        triggerNow();
        return NextResponse.json({ success: true, message: '已触发手动同步' });

      default:
        return NextResponse.json({ success: false, error: '未知操作' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '操作失败' },
      { status: 500 }
    );
  }
}