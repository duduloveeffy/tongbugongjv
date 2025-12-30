/**
 * 运行时日志收集器
 * 在内存中缓存最近的服务器日志，供前端查询
 */

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: any;
}

class RuntimeLogger {
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 200;

  log(level: 'info' | 'warn' | 'error', source: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      data,
    };

    this.logs.unshift(entry);

    // 保持最多 MAX_LOGS 条
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(0, this.MAX_LOGS);
    }

    // 同时输出到 console
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    logFn(`[${source}] ${message}${dataStr}`);
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

  getLogs(limit = 100): LogEntry[] {
    return this.logs.slice(0, Math.min(limit, this.MAX_LOGS));
  }

  clear() {
    const count = this.logs.length;
    this.logs = [];
    return count;
  }
}

// 单例模式
export const runtimeLogger = new RuntimeLogger();
