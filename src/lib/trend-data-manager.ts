/**
 * 趋势数据管理器
 * 用于批量获取和缓存SKU趋势数据
 */

interface TrendData {
  trends: Array<{
    date: string;
    value: number;
    orders: number;
  }>;
  trend: 'up' | 'down' | 'stable';
  totalSales: number;
  totalOrders: number;
  timestamp: number;
}

class TrendDataManager {
  private cache: Map<string, TrendData> = new Map();
  private pendingRequests: Map<string, Promise<TrendData | null>> = new Map();
  private batchQueue: Set<string> = new Set();
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly CACHE_TTL = 60000; // 1分钟缓存
  private readonly BATCH_DELAY = 200; // 200ms 批量延迟
  private readonly BATCH_SIZE = 20; // 每批最多20个SKU

  /**
   * 获取单个SKU的趋势数据
   */
  async getTrendData(sku: string): Promise<TrendData | null> {
    if (!sku || sku.trim() === '') return null;

    // 检查缓存
    const cached = this.cache.get(sku);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached;
    }

    // 检查是否有正在进行的请求
    const pending = this.pendingRequests.get(sku);
    if (pending) {
      return pending;
    }

    // 添加到批量队列
    this.batchQueue.add(sku);
    
    // 创建 Promise 并存储
    const promise = new Promise<TrendData | null>((resolve) => {
      // 设置批量处理定时器
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.processBatch();
        }, this.BATCH_DELAY);
      }

      // 存储 resolve 函数
      const originalResolve = this.pendingRequests.get(sku);
      if (!originalResolve) {
        this.pendingRequests.set(sku, promise);
      }
    });

    return promise;
  }

  /**
   * 批量处理队列中的SKU
   */
  private async processBatch() {
    if (this.batchQueue.size === 0) {
      this.batchTimer = null;
      return;
    }

    // 获取待处理的SKU列表
    const skus = Array.from(this.batchQueue).slice(0, this.BATCH_SIZE);
    this.batchQueue.clear();
    this.batchTimer = null;

    try {
      // 批量请求
      const response = await fetch('/api/sales/trends/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skus,
          period: 'day',
          daysBack: 7,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // 处理每个SKU的结果
          for (const sku of skus) {
            const skuData = result.data[sku];
            if (skuData && skuData.success) {
              const trendData: TrendData = {
                ...skuData.data,
                timestamp: Date.now(),
              };
              
              // 更新缓存
              this.cache.set(sku, trendData);
              
              // 解决 Promise
              const pending = this.pendingRequests.get(sku);
              if (pending) {
                (pending as any).resolve?.(trendData);
                this.pendingRequests.delete(sku);
              }
            } else {
              // 处理失败的SKU
              this.resolvePending(sku, null);
            }
          }
        } else {
          // 批量请求失败，所有SKU返回null
          skus.forEach(sku => this.resolvePending(sku, null));
        }
      } else {
        // 请求失败，所有SKU返回null
        skus.forEach(sku => this.resolvePending(sku, null));
      }
    } catch (error) {
      // 错误处理，所有SKU返回null
      skus.forEach(sku => this.resolvePending(sku, null));
    }

    // 如果还有待处理的SKU，继续处理
    if (this.batchQueue.size > 0) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.BATCH_DELAY);
    }
  }

  /**
   * 解决等待的Promise
   */
  private resolvePending(sku: string, data: TrendData | null) {
    const pending = this.pendingRequests.get(sku);
    if (pending) {
      (pending as any).resolve?.(data);
      this.pendingRequests.delete(sku);
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 预加载多个SKU的数据
   */
  async preloadTrends(skus: string[]) {
    const validSkus = skus.filter(sku => sku && sku.trim() !== '');
    if (validSkus.length === 0) return;

    // 分批处理
    for (let i = 0; i < validSkus.length; i += this.BATCH_SIZE) {
      const batch = validSkus.slice(i, i + this.BATCH_SIZE);
      batch.forEach(sku => this.batchQueue.add(sku));
    }

    // 触发批处理
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.BATCH_DELAY);
    }
  }
}

// 导出单例
export const trendDataManager = new TrendDataManager();