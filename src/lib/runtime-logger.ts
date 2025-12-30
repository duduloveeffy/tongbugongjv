/**
 * 运行时日志收集器
 * 简化版：只输出到 console，供 Vercel 日志查看
 */

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: any;
}

class RuntimeLogger {
  log(level: 'info' | 'warn' | 'error', source: string, message: string, data?: any) {
    // 输出到 console（Vercel 会捕获这些日志）
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    logFn(`[${timestamp}][${level.toUpperCase()}][${source}] ${message}${dataStr}`);
  }

  info(source: string, message: string, data?: any) {
    this.log('info', source, message, data);
  }

  warn(source: string, message: string, data?: any) {
    this.log('warn', source, message, data);
  }

  error(source: string, message: string, data?: any) {
    this.log('error', source, message, data);
  }

  async getLogs(limit = 100): Promise<LogEntry[]> {
    // 返回空数组，因为我们不存储日志
    return [];
  }

  async clear() {
    return 0;
  }
}

// 单例模式
export const runtimeLogger = new RuntimeLogger();
