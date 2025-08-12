'use client';

import { useEffect, useState } from 'react';
import { useMultiSiteStore } from '@/store/multisite';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Globe, 
  Plus, 
  Trash2, 
  Edit, 
  CheckCircle, 
  XCircle, 
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  TestTube,
  Clock,
  Package,
  Database
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { SyncVerification } from './SyncVerification';
import { SyncProgress } from './SyncProgress';
import { TaskQueueMonitor } from '@/components/sync/TaskQueueMonitor';

export function SiteManager() {
  const {
    sites,
    isLoadingSites,
    fetchSites,
    addSite,
    updateSite,
    deleteSite,
    testSiteConnection,
  } = useMultiSiteStore();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [syncingSiteId, setSyncingSiteId] = useState<string | null>(null);
  const [selectedVerifySite, setSelectedVerifySite] = useState<any>(null);
  const [activeSyncTask, setActiveSyncTask] = useState<{ siteId: string; taskId: string } | null>(null);
  const [showQueueMonitor, setShowQueueMonitor] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    apiKey: '',
    apiSecret: '',
  });

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const handleAdd = async () => {
    if (!formData.name || !formData.url || !formData.apiKey || !formData.apiSecret) {
      toast.error('请填写所有必填字段');
      return;
    }

    const site = await addSite({
      name: formData.name,
      url: formData.url,
      api_key: formData.apiKey,
      api_secret: formData.apiSecret,
      enabled: true,
      last_sync_at: null,
    });

    if (site) {
      setIsAddDialogOpen(false);
      resetForm();
    }
  };

  const handleEdit = async () => {
    if (!selectedSite) return;

    const success = await updateSite(selectedSite.id, {
      name: formData.name,
      url: formData.url,
      api_key: formData.apiKey,
      api_secret: formData.apiSecret,
    });

    if (success) {
      setIsEditDialogOpen(false);
      resetForm();
      setSelectedSite(null);
    }
  };

  const handleDelete = async (site: any) => {
    if (!confirm(`确定要删除站点 "${site.name}" 吗？此操作不可恢复。`)) {
      return;
    }

    setIsDeleting(true);
    const success = await deleteSite(site.id);
    setIsDeleting(false);

    if (success) {
      toast.success('站点已删除');
    }
  };

  const handleTest = async () => {
    if (!formData.url || !formData.apiKey || !formData.apiSecret) {
      toast.error('请填写URL和API密钥');
      return;
    }

    setIsTesting(true);
    const success = await testSiteConnection(formData.url, formData.apiKey, formData.apiSecret);
    setIsTesting(false);
  };

  const handleToggleEnabled = async (site: any) => {
    const success = await updateSite(site.id, {
      enabled: !site.enabled,
    });

    if (success) {
      toast.success(site.enabled ? '站点已禁用' : '站点已启用');
    }
  };

  const openEditDialog = (site: any) => {
    setSelectedSite(site);
    setFormData({
      name: site.name,
      url: site.url,
      apiKey: site.api_key,
      apiSecret: site.api_secret,
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      apiKey: '',
      apiSecret: '',
    });
    setShowSecrets(false);
  };

  const handleInitialSync = async (site: any, forceSync = false) => {
    setSyncingSiteId(site.id);
    
    try {
      toast.info('检查同步状态...');
      
      // 添加到任务队列
      const response = await fetch('/api/sync/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site.id,
          taskType: 'full',
          priority: 5, // 高优先级
          metadata: {
            source: 'manual',
            description: '全量同步订单和产品',
            forceSync
          }
        }),
      });

      const data = await response.json();
      
      // 如果任务已存在
      if (response.status === 409) {
        toast.warning('已有相同的同步任务在队列中', { duration: 3000 });
        setShowQueueMonitor(true); // 显示队列监控
        setSyncingSiteId(null);
        return;
      }

      if (data.success) {
        toast.success(
          `全量同步任务已加入队列！`,
          { duration: 3000 }
        );
        setShowQueueMonitor(true); // 显示队列监控
        setSyncingSiteId(null);
        
      } else {
        toast.error(data.error || '添加同步任务失败');
        setSyncingSiteId(null);
      }
    } catch (error) {
      console.error('Initial sync failed:', error);
      toast.error('添加同步任务失败');
      setSyncingSiteId(null);
    }
  };

  const handleIncrementalSync = async (site: any, type: 'orders' | 'products' | 'both') => {
    setSyncingSiteId(site.id);
    
    try {
      // 对于增量同步，如果选择both则添加到队列
      if (type === 'both') {
        const response = await fetch('/api/sync/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: site.id,
            taskType: 'incremental',
            priority: 3, // 中等优先级
            metadata: {
              source: 'manual',
              description: '增量同步订单和产品'
            }
          }),
        });

        const data = await response.json();

        if (response.status === 409) {
          toast.warning('已有相同的同步任务在队列中', { duration: 3000 });
          setShowQueueMonitor(true);
          setSyncingSiteId(null);
          return;
        }

        if (data.success) {
          toast.success('增量同步任务已加入队列！');
          setShowQueueMonitor(true);
        } else {
          toast.error(data.error || '添加同步任务失败');
        }
      } else {
        // 单独同步订单或产品（直接执行）
        const response = await fetch(`/api/sync/${type}/incremental`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: site.id,
            mode: 'incremental',
          }),
        });

        const data = await response.json();

        if (data.success) {
          const itemType = type === 'orders' ? '订单' : '产品';
          const count = type === 'orders' 
            ? data.results.syncedOrders 
            : data.results.syncedProducts;
          
          toast.success(`${itemType}增量同步完成！更新了 ${count || 0} 条记录`);
          fetchSites();
        } else {
          toast.error(data.error || `${type}同步失败`);
        }
      }
    } catch (error) {
      console.error(`${type} sync failed:`, error);
      toast.error(`${type}同步失败`);
    } finally {
      setSyncingSiteId(null);
    }
  };

  if (isLoadingSites) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const handleSyncComplete = () => {
    setActiveSyncTask(null);
    setSyncingSiteId(null);
    fetchSites();
    toast.success('同步任务已完成！');
  };

  return (
    <>
      {/* 任务队列监控 */}
      {showQueueMonitor && (
        <div className="mb-4">
          <TaskQueueMonitor onClose={() => setShowQueueMonitor(false)} />
        </div>
      )}
      
      {/* Sync Progress Display */}
      {activeSyncTask && (
        <SyncProgress 
          taskId={activeSyncTask.taskId} 
          onComplete={handleSyncComplete}
        />
      )}
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                WooCommerce 站点管理
              </CardTitle>
              <CardDescription>
                管理多个WooCommerce站点的API配置
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowQueueMonitor(!showQueueMonitor)} 
                size="sm" 
                variant={showQueueMonitor ? "default" : "outline"}
              >
                <Database className="h-4 w-4 mr-1" />
                任务队列
              </Button>
              <Button onClick={() => fetchSites()} size="sm" variant="outline">
                <RefreshCw className="h-4 w-4 mr-1" />
                刷新
              </Button>
              <Button onClick={() => setIsAddDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                添加站点
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>还没有配置任何站点</p>
              <p className="text-sm mt-2">点击"添加站点"开始配置</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {site.enabled ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-gray-400" />
                      )}
                      <Switch
                        checked={site.enabled}
                        onCheckedChange={() => handleToggleEnabled(site)}
                      />
                    </div>
                    <div>
                      <div className="font-medium">{site.name}</div>
                      <div className="text-sm text-muted-foreground">{site.url}</div>
                      {site.last_sync_at && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          最后同步: {format(new Date(site.last_sync_at), 'yyyy-MM-dd HH:mm')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={site.enabled ? 'default' : 'secondary'}>
                      {site.enabled ? '启用' : '禁用'}
                    </Badge>
                    
                    {/* Sync Buttons */}
                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => handleInitialSync(site)}
                        size="sm"
                        variant="outline"
                        disabled={syncingSiteId === site.id || !site.enabled}
                        title="全量数据同步（所有订单+产品）"
                      >
                        {syncingSiteId === site.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Database className="h-4 w-4" />
                        )}
                      </Button>
                      
                      <Button
                        onClick={() => handleIncrementalSync(site, 'orders')}
                        size="sm"
                        variant="ghost"
                        disabled={syncingSiteId === site.id || !site.enabled}
                        title="增量同步订单"
                        className="px-2"
                      >
                        📦
                      </Button>
                      
                      <Button
                        onClick={() => handleIncrementalSync(site, 'products')}
                        size="sm"
                        variant="ghost"
                        disabled={syncingSiteId === site.id || !site.enabled}
                        title="增量同步产品"
                        className="px-2"
                      >
                        <Package className="h-3 w-3" />
                      </Button>
                      
                      <Button
                        onClick={() => handleIncrementalSync(site, 'both')}
                        size="sm"
                        variant="ghost"
                        disabled={syncingSiteId === site.id || !site.enabled}
                        title="增量同步全部（加入队列）"
                        className="px-2"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                      
                      <Button
                        onClick={() => setSelectedVerifySite(site)}
                        size="sm"
                        variant="ghost"
                        disabled={!site.enabled}
                        title="验证数据完整性"
                        className="px-2"
                      >
                        <CheckCircle className="h-3 w-3" />
                      </Button>
                    </div>

                    <Button
                      onClick={() => openEditDialog(site)}
                      size="sm"
                      variant="ghost"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => handleDelete(site)}
                      size="sm"
                      variant="ghost"
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Site Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>添加WooCommerce站点</DialogTitle>
            <DialogDescription>
              配置新的WooCommerce站点API连接
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">站点名称</Label>
              <Input
                id="name"
                placeholder="例如: US站、UK站"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">网站URL</Label>
              <Input
                id="url"
                placeholder="https://your-site.com"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">Consumer Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showSecrets ? 'text' : 'password'}
                  placeholder="ck_..."
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiSecret">Consumer Secret</Label>
              <div className="relative">
                <Input
                  id="apiSecret"
                  type={showSecrets ? 'text' : 'password'}
                  placeholder="cs_..."
                  value={formData.apiSecret}
                  onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleTest}
              variant="outline"
              disabled={isTesting}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              测试连接
            </Button>
            <Button onClick={handleAdd}>添加站点</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Site Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>编辑站点配置</DialogTitle>
            <DialogDescription>
              修改WooCommerce站点API连接配置
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">站点名称</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-url">网站URL</Label>
              <Input
                id="edit-url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-apiKey">Consumer Key</Label>
              <div className="relative">
                <Input
                  id="edit-apiKey"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-apiSecret">Consumer Secret</Label>
              <div className="relative">
                <Input
                  id="edit-apiSecret"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.apiSecret}
                  onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleTest}
              variant="outline"
              disabled={isTesting}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              测试连接
            </Button>
            <Button onClick={handleEdit}>保存更改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Dialog */}
      <Dialog open={!!selectedVerifySite} onOpenChange={(open) => !open && setSelectedVerifySite(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>数据完整性验证</DialogTitle>
            <DialogDescription>
              验证 {selectedVerifySite?.name} 的同步数据完整性
            </DialogDescription>
          </DialogHeader>
          {selectedVerifySite && (
            <SyncVerification 
              siteId={selectedVerifySite.id} 
              siteName={selectedVerifySite.name} 
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}