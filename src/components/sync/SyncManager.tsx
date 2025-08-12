'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  RefreshCw, 
  Database, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  Package,
  ShoppingCart,
  TrendingUp,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface SyncStatus {
  siteId: string;
  siteName: string;
  enabled: boolean;
  status: 'not_started' | 'completed' | 'failed' | 'in_progress' | 'partial' | 'completed_no_data';
  lastInitialSync: any;
  dataCounts: {
    orders: number;
    products: number;
    variations: number;
  };
  checkpoints: {
    orders: any;
    products: any;
  };
}

export function SyncManager() {
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingSite, setSyncingSite] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch sync statuses
  const fetchSyncStatuses = async () => {
    try {
      const response = await fetch('/api/sync/initial');
      const data = await response.json();
      
      if (data.success) {
        setSyncStatuses(data.sites || []);
      } else {
        toast.error('获取同步状态失败');
      }
    } catch (error) {
      console.error('Failed to fetch sync statuses:', error);
      toast.error('获取同步状态失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSyncStatuses();
  }, []);

  // Handle initial sync
  const handleInitialSync = async (siteId: string, siteName: string) => {
    setSyncingSite(siteId);
    
    try {
      toast.info(`开始为 ${siteName} 进行初始数据同步...`);
      
      const response = await fetch('/api/sync/initial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          syncOrders: true,
          syncProducts: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(
          `${siteName} 初始同步完成！\n` +
          `订单: ${data.results.orders.count || 0}\n` +
          `产品: ${data.results.products.count || 0}\n` +
          `变体: ${data.results.products.variations || 0}`
        );
        fetchSyncStatuses();
      } else {
        toast.error(`${siteName} 初始同步失败: ${data.message}`);
      }
    } catch (error) {
      console.error('Initial sync failed:', error);
      toast.error(`${siteName} 初始同步失败`);
    } finally {
      setSyncingSite(null);
    }
  };

  // Handle incremental sync
  const handleIncrementalSync = async (siteId: string, siteName: string, type: 'orders' | 'products') => {
    setSyncingSite(siteId);
    
    try {
      const response = await fetch(`/api/sync/${type}/incremental`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          mode: 'incremental',
        }),
      });

      const data = await response.json();

      if (data.success) {
        const itemType = type === 'orders' ? '订单' : '产品';
        const count = type === 'orders' 
          ? data.results.syncedOrders 
          : data.results.syncedProducts;
        
        toast.success(`${siteName} ${itemType}增量同步完成！更新了 ${count || 0} 条记录`);
        fetchSyncStatuses();
      } else {
        toast.error(`${siteName} ${type}同步失败: ${data.error}`);
      }
    } catch (error) {
      console.error(`${type} sync failed:`, error);
      toast.error(`${siteName} ${type}同步失败`);
    } finally {
      setSyncingSite(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />已完成</Badge>;
      case 'completed_no_data':
        return <Badge variant="secondary"><CheckCircle className="w-3 h-3 mr-1" />完成(无数据)</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />失败</Badge>;
      case 'partial':
        return <Badge variant="outline"><AlertTriangle className="w-3 h-3 mr-1" />部分完成</Badge>;
      case 'in_progress':
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />进行中</Badge>;
      case 'not_started':
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />未开始</Badge>;
    }
  };

  const completedSites = syncStatuses.filter(s => s.status === 'completed' || s.status === 'completed_no_data').length;
  const totalSites = syncStatuses.length;
  const enabledSites = syncStatuses.filter(s => s.enabled).length;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center p-6">
            <Database className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-2xl font-bold">{totalSites}</p>
              <p className="text-sm text-muted-foreground">总站点数</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <p className="text-2xl font-bold">{completedSites}</p>
              <p className="text-sm text-muted-foreground">已同步</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <TrendingUp className="h-8 w-8 text-orange-600 mr-3" />
            <div>
              <p className="text-2xl font-bold">{enabledSites}</p>
              <p className="text-sm text-muted-foreground">已启用</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <Progress value={totalSites > 0 ? (completedSites / totalSites) * 100 : 0} className="w-full" />
            <div className="ml-3">
              <p className="text-sm font-medium">{totalSites > 0 ? Math.round((completedSites / totalSites) * 100) : 0}%</p>
              <p className="text-xs text-muted-foreground">完成度</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="detailed">详细状态</TabsTrigger>
          </TabsList>
          
          <Button onClick={fetchSyncStatuses} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>同步概览</CardTitle>
              <CardDescription>所有站点的数据同步状态</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {syncStatuses.map((site) => (
                  <div
                    key={site.siteId}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-medium">{site.siteName}</div>
                        <div className="text-sm text-muted-foreground">
                          订单: {site.dataCounts.orders.toLocaleString()} | 
                          产品: {site.dataCounts.products.toLocaleString()} | 
                          变体: {site.dataCounts.variations.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(site.status)}
                      
                      {site.enabled && (
                        <div className="flex space-x-1">
                          <Button
                            onClick={() => handleInitialSync(site.siteId, site.siteName)}
                            size="sm"
                            variant="outline"
                            disabled={syncingSite === site.siteId}
                            title="完整数据同步"
                          >
                            {syncingSite === site.siteId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Database className="h-4 w-4" />
                            )}
                          </Button>
                          
                          <Button
                            onClick={() => handleIncrementalSync(site.siteId, site.siteName, 'orders')}
                            size="sm"
                            variant="ghost"
                            disabled={syncingSite === site.siteId}
                            title="增量同步订单"
                            className="px-2"
                          >
                            <ShoppingCart className="h-4 w-4" />
                          </Button>
                          
                          <Button
                            onClick={() => handleIncrementalSync(site.siteId, site.siteName, 'products')}
                            size="sm"
                            variant="ghost"
                            disabled={syncingSite === site.siteId}
                            title="增量同步产品"
                            className="px-2"
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detailed" className="space-y-4">
          {syncStatuses.map((site) => (
            <Card key={site.siteId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {site.siteName}
                      {getStatusBadge(site.status)}
                    </CardTitle>
                    <CardDescription>
                      详细的同步状态和数据统计
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Data Counts */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <ShoppingCart className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                    <div className="text-2xl font-bold">{site.dataCounts.orders.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">订单</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <Package className="h-6 w-6 mx-auto mb-2 text-green-600" />
                    <div className="text-2xl font-bold">{site.dataCounts.products.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">产品</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <Database className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                    <div className="text-2xl font-bold">{site.dataCounts.variations.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">变体</div>
                  </div>
                </div>

                {/* Checkpoint Information */}
                {(site.checkpoints.orders || site.checkpoints.products) && (
                  <div className="space-y-3">
                    <h4 className="font-medium">同步检查点</h4>
                    
                    {site.checkpoints.orders && (
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">订单同步</span>
                          <Badge variant={site.checkpoints.orders.status === 'success' ? 'default' : 'destructive'}>
                            {site.checkpoints.orders.status || '未知'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          最后订单ID: {site.checkpoints.orders.lastOrderId || '无'} | 
                          已同步: {site.checkpoints.orders.syncedCount || 0} |
                          最后同步: {site.checkpoints.orders.lastSync ? 
                            format(new Date(site.checkpoints.orders.lastSync), 'yyyy-MM-dd HH:mm', { locale: zhCN }) : 
                            '从未同步'
                          }
                        </div>
                      </div>
                    )}

                    {site.checkpoints.products && (
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">产品同步</span>
                          <Badge variant={site.checkpoints.products.status === 'success' ? 'default' : 'destructive'}>
                            {site.checkpoints.products.status || '未知'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          最后产品ID: {site.checkpoints.products.lastProductId || '无'} | 
                          已同步: {site.checkpoints.products.syncedCount || 0} |
                          最后同步: {site.checkpoints.products.lastSync ? 
                            format(new Date(site.checkpoints.products.lastSync), 'yyyy-MM-dd HH:mm', { locale: zhCN }) : 
                            '从未同步'
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Last Initial Sync */}
                {site.lastInitialSync && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">最后初始同步</span>
                      <Badge variant={site.lastInitialSync.status === 'completed' ? 'default' : 'destructive'}>
                        {site.lastInitialSync.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      开始时间: {format(new Date(site.lastInitialSync.started_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })} |
                      耗时: {site.lastInitialSync.duration_ms ? `${Math.round(site.lastInitialSync.duration_ms / 1000)}秒` : '未知'}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}