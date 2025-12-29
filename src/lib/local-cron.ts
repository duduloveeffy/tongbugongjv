/**
 * 本地定时任务（开发/调试用）
 *
 * 在 Next.js 开发模式下自动启动，每小时执行一次自动同步
 * 生产环境使用 Vercel Cron 替代
 */

let cronInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let currentIntervalMs: number = 60 * 60 * 1000;
let lastTriggerAt: string | null = null;
let nextTriggerAt: string | null = null;

// 执行自动同步
async function runAutoSync() {
  if (isRunning) {
    console.log('[Local Cron] 上一次同步还在运行中，跳过');
    return;
  }

  isRunning = true;
  lastTriggerAt = new Date().toISOString();
  const startTime = Date.now();

  try {
    console.log('[Local Cron] 开始执行自动同步...');

    // 调用本地 API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/sync/auto`, {
      method: 'POST',
    });

    const result = await response.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      if (result.skipped) {
        console.log(`[Local Cron] 自动同步已禁用，跳过执行`);
      } else {
        const stats = result.stats;
        console.log(`[Local Cron] 自动同步完成 (${duration}s):`);
        console.log(`  - 检测: ${stats.total_checked} SKU`);
        console.log(`  - 同步有货: +${stats.total_synced_to_instock}`);
        console.log(`  - 同步无货: +${stats.total_synced_to_outofstock}`);
        console.log(`  - 失败: ${stats.total_failed}`);
      }
    } else {
      console.error(`[Local Cron] 自动同步失败: ${result.error}`);
    }
  } catch (error) {
    console.error('[Local Cron] 执行出错:', error);
  } finally {
    isRunning = false;
    // 更新下次执行时间
    if (cronInterval) {
      nextTriggerAt = new Date(Date.now() + currentIntervalMs).toISOString();
    }
  }
}

// 启动本地定时任务
export function startLocalCron(intervalMs: number = 60 * 60 * 1000) {
  if (cronInterval) {
    console.log('[Local Cron] 定时任务已在运行');
    return;
  }

  // 只在开发环境启动
  if (process.env.NODE_ENV !== 'development') {
    console.log('[Local Cron] 非开发环境，不启动本地定时任务');
    return;
  }

  currentIntervalMs = intervalMs;
  const intervalMinutes = Math.round(intervalMs / 60000);
  console.log(`[Local Cron] 启动本地定时任务，间隔: ${intervalMinutes} 分钟`);

  // 设置下次执行时间
  nextTriggerAt = new Date(Date.now() + intervalMs).toISOString();

  // 设置定时执行
  cronInterval = setInterval(runAutoSync, intervalMs);

  console.log('[Local Cron] 下次执行时间:', new Date(nextTriggerAt).toLocaleString('zh-CN'));
}

// 停止本地定时任务
export function stopLocalCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    nextTriggerAt = null;
    console.log('[Local Cron] 定时任务已停止');
  }
}

// 手动触发一次（返回 Promise）
export async function triggerNow(): Promise<void> {
  console.log('[Local Cron] 手动触发同步');
  await runAutoSync();
}

// 获取状态
export function getCronStatus() {
  return {
    running: cronInterval !== null,
    syncing: isRunning,
    intervalMs: currentIntervalMs,
    lastTriggerAt,
    nextTriggerAt,
  };
}