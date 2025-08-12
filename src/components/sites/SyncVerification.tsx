'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Info,
  Loader2,
  Database,
  ShoppingCart,
  Package,
  Users,
  Calendar,
  RefreshCw,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface VerificationResult {
  site: {
    id: string;
    name: string;
    url: string;
  };
  woocommerce: {
    orders: { total: number; statuses: Record<string, number> };
    products: { total: number; variations: number };
    customers: { total: number };
  };
  database: {
    orders: { 
      total: number; 
      statuses: Record<string, number>;
      dateRange: { earliest: string | null; latest: string | null };
    };
    products: { 
      total: number; 
      variations: number;
      simpleProducts: number;
      variableProducts: number;
    };
    orderItems: { total: number };
  };
  comparison: {
    orders: {
      total_wc: number;
      total_db: number;
      difference: number;
      completeness_percentage: number;
      status: 'complete' | 'incomplete';
    };
    products: {
      total_wc: number;
      total_db: number;
      difference: number;
      completeness_percentage: number;
      status: 'complete' | 'incomplete';
    };
  };
  missing: {
    orders: any[];
    products: any[];
    checkMethod: string;
    sampledRanges: string[];
  };
  lastSync: any;
  recommendations: any[];
  verifiedAt: string;
}

export function SyncVerification({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isHistorical, setIsHistorical] = useState(false);

  // Load cached verification result on mount
  useEffect(() => {
    const cacheKey = `verification_${siteId}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setVerificationResult(parsed);
        setIsHistorical(true);
      } catch (error) {
        console.error('Failed to parse cached verification:', error);
      }
    }
  }, [siteId]);

  const handleVerify = async () => {
    setIsVerifying(true);
    toast.info('开始验证数据完整性...');

    try {
      const response = await fetch('/api/sync/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });

      const data = await response.json();

      if (data.success) {
        setVerificationResult(data.verification);
        setIsHistorical(false); // Mark as fresh result
        
        // Save to localStorage
        const cacheKey = `verification_${siteId}`;
        localStorage.setItem(cacheKey, JSON.stringify(data.verification));
        
        toast.success('验证完成');
      } else {
        toast.error(data.error || '验证失败');
      }
    } catch (error) {
      console.error('Verification failed:', error);
      toast.error('验证失败');
    } finally {
      setIsVerifying(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
      case 'complete':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'warning':
      case 'incomplete':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 100) return 'text-green-600';
    if (percentage >= 95) return 'text-yellow-600';
    if (percentage >= 80) return 'text-orange-600';
    return 'text-red-600';
  };

  const getTimeDiff = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              数据完整性验证
            </CardTitle>
            <CardDescription>
              验证 {siteName} 的同步数据完整性
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {verificationResult && (
              <div className="text-xs text-muted-foreground">
                {isHistorical ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    上次验证: {getTimeDiff(verificationResult.verifiedAt)}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    最新验证结果
                  </span>
                )}
              </div>
            )}
            <Button 
              onClick={handleVerify} 
              disabled={isVerifying}
              size="sm"
              variant={isHistorical ? "default" : "outline"}
            >
              {isVerifying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isVerifying ? '验证中...' : (isHistorical ? '重新验证' : '刷新验证')}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {verificationResult ? (
          <div className="space-y-6">
            {/* Historical Data Alert */}
            {isHistorical && (
              <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-900">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-sm">历史验证结果</AlertTitle>
                <AlertDescription className="text-xs">
                  这是 {getTimeDiff(verificationResult.verifiedAt)} 的验证结果。
                  点击"重新验证"获取最新数据。
                </AlertDescription>
              </Alert>
            )}
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Orders Summary */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">订单同步</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">WC</span>
                      <span className="text-2xl font-bold">{verificationResult.woocommerce.orders.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">数据库</span>
                      <span className="text-2xl font-bold">{verificationResult.database.orders.total.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">完整度</span>
                      <span className={`font-medium ${getStatusColor(verificationResult.comparison.orders.completeness_percentage)}`}>
                        {verificationResult.comparison.orders.completeness_percentage}%
                      </span>
                    </div>
                    <Progress 
                      value={verificationResult.comparison.orders.completeness_percentage} 
                      className="h-2"
                    />
                  </div>

                  {verificationResult.comparison.orders.difference !== 0 && (
                    <div className={`text-sm p-2 rounded-md ${
                      verificationResult.comparison.orders.difference > 0 
                        ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400' 
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                    }`}>
                      {verificationResult.comparison.orders.difference > 0 
                        ? `缺少 ${verificationResult.comparison.orders.difference} 个订单`
                        : `数据库多 ${Math.abs(verificationResult.comparison.orders.difference)} 个订单`
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Products Summary */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">产品同步</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">WC</span>
                      <span className="text-2xl font-bold">{verificationResult.woocommerce.products.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">数据库</span>
                      <span className="text-2xl font-bold">{verificationResult.database.products.total.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">完整度</span>
                      <span className={`font-medium ${getStatusColor(verificationResult.comparison.products.completeness_percentage)}`}>
                        {verificationResult.comparison.products.completeness_percentage}%
                      </span>
                    </div>
                    <Progress 
                      value={verificationResult.comparison.products.completeness_percentage} 
                      className="h-2"
                    />
                  </div>

                  {verificationResult.comparison.products.difference !== 0 && (
                    <div className={`text-sm p-2 rounded-md ${
                      verificationResult.comparison.products.difference > 0 
                        ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400' 
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                    }`}>
                      {verificationResult.comparison.products.difference > 0 
                        ? `缺少 ${verificationResult.comparison.products.difference} 个产品`
                        : `数据库多 ${Math.abs(verificationResult.comparison.products.difference)} 个产品`
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Last Sync Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">最后同步</span>
                </div>
                <div className="space-y-3">
                  {verificationResult.lastSync?.lastTask ? (
                    <>
                      <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">同步时间</div>
                        <div className="text-lg font-medium">
                          {format(new Date(verificationResult.lastSync.lastTask.created_at), 'MM-dd HH:mm')}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={
                            verificationResult.lastSync.lastTask.status === 'completed' ? 'default' : 
                            verificationResult.lastSync.lastTask.status === 'running' ? 'secondary' :
                            'destructive'
                          }
                          className="text-xs"
                        >
                          {verificationResult.lastSync.lastTask.status === 'completed' ? '已完成' :
                           verificationResult.lastSync.lastTask.status === 'running' ? '运行中' :
                           verificationResult.lastSync.lastTask.status === 'failed' ? '失败' :
                           verificationResult.lastSync.lastTask.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {verificationResult.lastSync.lastTask.sync_type === 'full' ? '全量' : '增量'}
                        </Badge>
                      </div>
                      
                      {verificationResult.lastSync.lastTask.results && (
                        <div className="text-xs text-muted-foreground space-y-1">
                          {verificationResult.lastSync.lastTask.results.orders && (
                            <div>订单: {verificationResult.lastSync.lastTask.results.orders.synced || 0}</div>
                          )}
                          {verificationResult.lastSync.lastTask.results.products && (
                            <div>产品: {verificationResult.lastSync.lastTask.results.products.synced || 0}</div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground py-4">暂无同步记录</div>
                  )}
                </div>
              </div>
            </div>

            {/* Order Status Distribution */}
            {Object.keys(verificationResult.database.orders.statuses).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">订单状态分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(verificationResult.database.orders.statuses).map(([status, count]) => (
                      <Badge key={status} variant="outline">
                        {status}: {count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {verificationResult.recommendations.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  建议操作
                </h3>
                <div className="space-y-2">
                  {verificationResult.recommendations.map((rec, index) => (
                    <div 
                      key={index} 
                      className={`p-3 rounded-lg border ${
                        rec.type === 'error' ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900' :
                        rec.type === 'warning' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-900' :
                        rec.type === 'success' ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900' :
                        'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getStatusIcon(rec.type)}
                        <div className="flex-1 space-y-1">
                          <div className={`font-medium text-sm ${
                            rec.type === 'error' ? 'text-red-900 dark:text-red-100' :
                            rec.type === 'warning' ? 'text-yellow-900 dark:text-yellow-100' :
                            rec.type === 'success' ? 'text-green-900 dark:text-green-100' :
                            'text-blue-900 dark:text-blue-100'
                          }`}>
                            {rec.message}
                          </div>
                          <div className={`text-sm ${
                            rec.type === 'error' ? 'text-red-700 dark:text-red-300' :
                            rec.type === 'warning' ? 'text-yellow-700 dark:text-yellow-300' :
                            rec.type === 'success' ? 'text-green-700 dark:text-green-300' :
                            'text-blue-700 dark:text-blue-300'
                          }`}>
                            {rec.action}
                          </div>
                          {rec.details && (
                            <details className="mt-2">
                              <summary className="text-xs cursor-pointer opacity-70 hover:opacity-100">
                                查看详情
                              </summary>
                              <pre className="text-xs mt-2 p-2 bg-black/5 dark:bg-white/5 rounded overflow-x-auto">
                                {JSON.stringify(rec.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Data Sample */}
            {verificationResult.missing.orders.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-red-600">检测到缺失订单（样本）</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {verificationResult.missing.orders.slice(0, 5).map((order) => (
                      <div key={order.id} className="flex justify-between text-sm">
                        <span>订单 #{order.number}</span>
                        <span className="text-muted-foreground">{order.status}</span>
                        <span>${order.total}</span>
                      </div>
                    ))}
                    {verificationResult.missing.orders.length > 5 && (
                      <p className="text-sm text-muted-foreground">
                        还有 {verificationResult.missing.orders.length - 5} 个缺失订单...
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Verification Timestamp */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                {isHistorical ? (
                  <>
                    <Clock className="h-3 w-3" />
                    <span>历史结果 ({getTimeDiff(verificationResult.verifiedAt)})</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span className="text-green-600">最新验证</span>
                  </>
                )}
              </span>
              <span>验证时间: {format(new Date(verificationResult.verifiedAt), 'yyyy-MM-dd HH:mm:ss')}</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>点击"开始验证"检查数据完整性</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}