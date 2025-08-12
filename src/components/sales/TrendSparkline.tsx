'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendSparklineProps {
  sku: string;
  category?: string;
  onClick?: () => void;
  className?: string;
}

interface TrendPoint {
  date: string;
  value: number;
  orders: number;
}

export function TrendSparkline({ sku, category, onClick, className }: TrendSparklineProps) {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false); // 默认不加载
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  const [isHovered, setIsHovered] = useState(false);
  const [hasError, setHasError] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const isMountedRef = useRef(true);
  const hasFetchedRef = useRef(false);

  const fetchTrendData = async () => {
    // 检查 SKU 是否有效
    if (!sku || sku.trim() === '') {
      setLoading(false);
      return;
    }
    
    // 检查组件是否还挂载
    if (!isMountedRef.current) {
      return;
    }
    
    // 避免重复获取
    if (hasFetchedRef.current) {
      return;
    }
    hasFetchedRef.current = true;
    
    try {
      setLoading(true);
      setHasError(false);
      // 使用缓存键，避免重复请求
      const cacheKey = `sparkline_${sku}_7d`;
      const cached = sessionStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          if (Date.now() - cachedData.timestamp < 60000) { // 1分钟缓存
            setData(cachedData.data || []);
            setTrend(cachedData.trend || 'stable');
            setLoading(false);
            return;
          }
        } catch (e) {
          // 缓存数据解析失败，继续请求新数据
          sessionStorage.removeItem(cacheKey);
        }
      }
      const response = await fetch('/api/sales/trends/sku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          period: 'day',
          daysBack: 7, // 只获取7天数据用于缩略图
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data?.trends) {
          const trendData = result.data.trends.map((point: any) => ({
            date: point.period_label,
            value: point.sales_quantity || 0,
            orders: point.order_count || 0,
          }));
          
          // 只在组件仍然挂载时更新状态
          if (!isMountedRef.current) return;
          
          setData(trendData);
          
          // 计算趋势
          if (trendData.length >= 2) {
            const firstHalf = trendData.slice(0, Math.floor(trendData.length / 2));
            const secondHalf = trendData.slice(Math.floor(trendData.length / 2));
            const firstAvg = firstHalf.reduce((sum, p) => sum + p.value, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((sum, p) => sum + p.value, 0) / secondHalf.length;
            
            let calculatedTrend: 'up' | 'down' | 'stable' = 'stable';
            if (secondAvg > firstAvg * 1.1) {
              calculatedTrend = 'up';
            } else if (secondAvg < firstAvg * 0.9) {
              calculatedTrend = 'down';
            }
            
            if (isMountedRef.current) {
              setTrend(calculatedTrend);
            }
            
            // 缓存数据
            const cacheKey = `sparkline_${sku}_7d`;
            sessionStorage.setItem(cacheKey, JSON.stringify({
              data: trendData,
              trend: calculatedTrend,
              timestamp: Date.now()
            }));
          }
        } else {
          // API 返回错误，设置空数据
          if (isMountedRef.current) {
            setData([]);
            setTrend('stable');
          }
        }
      }
    } catch (error) {
      // 静默处理错误，避免控制台污染
      // 设置错误状态
      if (isMountedRef.current) {
        setHasError(true);
        setData([]);
        setTrend('stable');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    hasFetchedRef.current = false; // 重置获取标记
    
    return () => {
      isMountedRef.current = false;
    };
  }, [sku]);
  
  // 延迟加载数据 - 只在组件可见时加载
  useEffect(() => {
    // 使用 IntersectionObserver 来检测组件是否可见
    if (typeof window === 'undefined' || !window.IntersectionObserver) {
      return;
    }
    
    const timer = setTimeout(() => {
      // 延迟2秒后才开始获取数据，避免初始渲染时的大量请求
      if (isMountedRef.current && !hasFetchedRef.current) {
        fetchTrendData();
      }
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [sku]);

  const handleMouseEnter = () => {
    // 延迟显示，避免快速移动时频繁触发
    timeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsHovered(false);
  };

  const renderTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-3 w-3 text-red-500" />;
      default:
        return <Minus className="h-3 w-3 text-gray-400" />;
    }
  };

  // 如果有错误，显示简单的占位符
  if (hasError) {
    return (
      <div className={cn("flex items-center justify-center p-2 text-xs text-muted-foreground", className)}>
        <span onClick={onClick} className="cursor-pointer hover:text-foreground">
          点击查看
        </span>
      </div>
    );
  }

  // 如果还没有加载数据，显示简单的占位符
  if (!loading && !hasFetchedRef.current && data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-2", className)}>
        <div className="h-8 w-20 bg-muted/30 rounded animate-pulse" />
      </div>
    );
  }

  const hasData = data.length > 0 && data.some(d => d.value > 0);

  return (
    <Popover open={isHovered} onOpenChange={setIsHovered}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "cursor-pointer transition-all hover:bg-muted/50 rounded p-1",
            "flex items-center gap-1",
            className
          )}
          onClick={onClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {hasData ? (
            <>
              {renderTrendIcon()}
              <ResponsiveContainer width={60} height={30}>
                <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#6b7280'}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">无数据</div>
          )}
        </div>
      </PopoverTrigger>
      
      {hasData && (
        <PopoverContent className="w-80 p-0" align="end">
          <Card className="border-0">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm">SKU: {sku}</div>
                  {renderTrendIcon()}
                </div>
                
                {category && (
                  <div className="text-xs text-muted-foreground">品类: {category}</div>
                )}
                
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={data} margin={{ top: 5, right: 5, bottom: 20, left: 35 }}>
                    <YAxis 
                      tick={{ fontSize: 10 }}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: any, name: string) => {
                        if (name === 'value') return [`销量: ${value}`, ''];
                        if (name === 'orders') return [`订单: ${value}`, ''];
                        return [value, name];
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#8884d8"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="销量"
                    />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="#82ca9d"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      dot={false}
                      name="订单"
                    />
                  </LineChart>
                </ResponsiveContainer>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">总销量: </span>
                    <span className="font-medium">
                      {data.reduce((sum, d) => sum + d.value, 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">总订单: </span>
                    <span className="font-medium">
                      {data.reduce((sum, d) => sum + d.orders, 0)}
                    </span>
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                  点击查看完整趋势图
                </div>
              </div>
            </CardContent>
          </Card>
        </PopoverContent>
      )}
    </Popover>
  );
}