'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { 
  Webhook, 
  Plus, 
  TestTube, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  Settings,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useMultiSiteStore } from '@/store/multisite';

interface WebhookEndpoint {
  id: string;
  site_id: string;
  site_name: string;
  endpoint_type: string;
  webhook_url: string;
  secret_key?: string;
  enabled: boolean;
  events: string[];
  last_test_at?: string;
  last_test_status?: string;
  last_test_response?: string;
  events_last_24h: number;
  successful_last_24h: number;
  failed_last_24h: number;
  created_at: string;
  updated_at: string;
}

interface WebhookEvent {
  id: string;
  site_id: string;
  site_name: string;
  event_type: string;
  object_id: number | null;
  object_type: string;
  processing_time_ms: number | null;
  status: string;
  error_message: string | null;
  received_at: string;
  metadata: any;
}

export function WebhookManager() {
  const [webhookEndpoints, setWebhookEndpoints] = useState<WebhookEndpoint[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTestingWebhook, setIsTestingWebhook] = useState<string | null>(null);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookEndpoint | null>(null);
  const [activeTab, setActiveTab] = useState('endpoints');

  const { sites } = useMultiSiteStore();

  // Form state
  const [formData, setFormData] = useState({
    site_id: '',
    endpoint_type: 'realtime',
    webhook_url: '',
    secret_key: '',
    enabled: true,
    events: {
      'order.created': true,
      'order.updated': true,
      'order.deleted': false,
      'product.created': true,
      'product.updated': true,
      'product.deleted': false,
    },
  });

  useEffect(() => {
    fetchWebhookData();
  }, []);

  const fetchWebhookData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch webhook endpoints
      const endpointsResponse = await fetch('/api/webhook/endpoints');
      if (endpointsResponse.ok) {
        const endpointsData = await endpointsResponse.json();
        setWebhookEndpoints(endpointsData.endpoints || []);
      }

      // Fetch recent webhook events
      const eventsResponse = await fetch('/api/webhook/events?limit=50');
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        setWebhookEvents(eventsData.events || []);
      }
      
    } catch (error) {
      console.error('Failed to fetch webhook data:', error);
      toast.error('获取Webhook数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWebhook = async () => {
    if (!formData.site_id || !formData.webhook_url) {
      toast.error('请填写必填字段');
      return;
    }

    try {
      const response = await fetch('/api/webhook/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          events: Object.keys(formData.events).filter(key => formData.events[key as keyof typeof formData.events]),
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Webhook端点创建成功');
        setIsDialogOpen(false);
        resetForm();
        fetchWebhookData();
      } else {
        toast.error(result.error || 'Webhook创建失败');
      }
    } catch (error) {
      console.error('Failed to create webhook:', error);
      toast.error('Webhook创建失败');
    }
  };

  const handleUpdateWebhook = async () => {
    if (!editingWebhook || !formData.webhook_url) {
      return;
    }

    try {
      const response = await fetch(`/api/webhook/endpoints/${editingWebhook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          events: Object.keys(formData.events).filter(key => formData.events[key as keyof typeof formData.events]),
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Webhook端点更新成功');
        setIsDialogOpen(false);
        setEditingWebhook(null);
        resetForm();
        fetchWebhookData();
      } else {
        toast.error(result.error || 'Webhook更新失败');
      }
    } catch (error) {
      console.error('Failed to update webhook:', error);
      toast.error('Webhook更新失败');
    }
  };

  const handleDeleteWebhook = async (webhookId: string, siteName: string) => {
    if (!confirm(`确定要删除 ${siteName} 的Webhook配置吗？`)) {
      return;
    }

    try {
      const response = await fetch(`/api/webhook/endpoints/${webhookId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Webhook端点删除成功');
        fetchWebhookData();
      } else {
        toast.error(result.error || 'Webhook删除失败');
      }
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      toast.error('Webhook删除失败');
    }
  };

  const handleTestWebhook = async (webhook: WebhookEndpoint) => {
    setIsTestingWebhook(webhook.id);
    
    try {
      const response = await fetch(`/api/webhook/endpoints/${webhook.id}/test`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Webhook测试成功！响应时间: ${Math.round(result.execution_time * 1000)}ms`);
      } else {
        toast.error(`Webhook测试失败: ${result.error}`);
      }

      // Refresh data to show updated test status
      fetchWebhookData();
      
    } catch (error) {
      console.error('Failed to test webhook:', error);
      toast.error('Webhook测试失败');
    } finally {
      setIsTestingWebhook(null);
    }
  };

  const handleToggleWebhook = async (webhookId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/webhook/endpoints/${webhookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(enabled ? 'Webhook已禁用' : 'Webhook已启用');
        fetchWebhookData();
      } else {
        toast.error(result.error || 'Webhook状态更新失败');
      }
    } catch (error) {
      console.error('Failed to toggle webhook:', error);
      toast.error('Webhook状态更新失败');
    }
  };

  const openCreateDialog = () => {
    resetForm();
    setEditingWebhook(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (webhook: WebhookEndpoint) => {
    setFormData({
      site_id: webhook.site_id,
      endpoint_type: webhook.endpoint_type,
      webhook_url: webhook.webhook_url,
      secret_key: webhook.secret_key || '',
      enabled: webhook.enabled,
      events: {
        'order.created': webhook.events.includes('order.created'),
        'order.updated': webhook.events.includes('order.updated'),
        'order.deleted': webhook.events.includes('order.deleted'),
        'product.created': webhook.events.includes('product.created'),
        'product.updated': webhook.events.includes('product.updated'),
        'product.deleted': webhook.events.includes('product.deleted'),
      },
    });
    setEditingWebhook(webhook);
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      site_id: '',
      endpoint_type: 'realtime',
      webhook_url: '',
      secret_key: '',
      enabled: true,
      events: {
        'order.created': true,
        'order.updated': true,
        'order.deleted': false,
        'product.created': true,
        'product.updated': true,
        'product.deleted': false,
      },
    });
    setShowSecretKey(false);
  };

  const generateSecretKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, secret_key: result });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  const getStatusBadge = (webhook: WebhookEndpoint) => {
    if (!webhook.enabled) {
      return <Badge variant="secondary">已禁用</Badge>;
    }

    if (webhook.last_test_status === 'success') {
      return <Badge variant="default" className="bg-green-600">运行中</Badge>;
    } else if (webhook.last_test_status === 'failed') {
      return <Badge variant="destructive">错误</Badge>;
    } else {
      return <Badge variant="outline">未测试</Badge>;
    }
  };

  const getEventStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-600">成功</Badge>;
      case 'error':
        return <Badge variant="destructive">失败</Badge>;
      case 'partial':
        return <Badge variant="outline">部分成功</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Webhook 管理
              </CardTitle>
              <CardDescription>
                配置和管理WooCommerce实时数据同步Webhook
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={fetchWebhookData} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                刷新
              </Button>
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                添加Webhook
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="endpoints">Webhook端点</TabsTrigger>
          <TabsTrigger value="events">事件日志</TabsTrigger>
          <TabsTrigger value="setup">安装指南</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="space-y-4">
          {webhookEndpoints.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>还没有配置任何Webhook端点</p>
                <p className="text-sm mt-2">点击"添加Webhook"开始配置</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {webhookEndpoints.map((webhook) => (
                <Card key={webhook.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{webhook.site_name}</h3>
                          {getStatusBadge(webhook)}
                          <Switch 
                            checked={webhook.enabled}
                            onCheckedChange={() => handleToggleWebhook(webhook.id, webhook.enabled)}
                            size="sm"
                          />
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            <span className="break-all">{webhook.webhook_url}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0"
                              onClick={() => copyToClipboard(webhook.webhook_url)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span>事件: {webhook.events.join(', ')}</span>
                          <span>类型: {webhook.endpoint_type}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>24h: {webhook.events_last_24h} 事件</span>
                          <span className="text-green-600">✓ {webhook.successful_last_24h}</span>
                          <span className="text-red-600">✗ {webhook.failed_last_24h}</span>
                          {webhook.last_test_at && (
                            <span>
                              最后测试: {format(new Date(webhook.last_test_at), 'MM-dd HH:mm', { locale: zhCN })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleTestWebhook(webhook)}
                          size="sm"
                          variant="outline"
                          disabled={isTestingWebhook === webhook.id}
                        >
                          {isTestingWebhook === webhook.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          onClick={() => openEditDialog(webhook)}
                          size="sm"
                          variant="ghost"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>最近的Webhook事件</CardTitle>
              <CardDescription>显示最近50个Webhook事件的处理状态</CardDescription>
            </CardHeader>
            <CardContent>
              {webhookEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无Webhook事件记录</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {webhookEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getEventStatusBadge(event.status)}
                        <div>
                          <div className="font-medium text-sm">
                            {event.event_type} - {event.site_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {event.object_type} #{event.object_id} 
                            {event.processing_time_ms && ` • ${event.processing_time_ms}ms`}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(event.received_at), 'MM-dd HH:mm:ss', { locale: zhCN })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>WooCommerce插件安装指南</CardTitle>
              <CardDescription>如何在WooCommerce站点上配置实时同步插件</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium">1. 下载并安装插件</h4>
                <p className="text-sm text-muted-foreground">
                  下载 WooCommerce Realtime Sync 插件并上传到你的WordPress站点
                </p>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  下载插件
                </Button>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">2. 配置Webhook端点</h4>
                <div className="bg-muted p-3 rounded text-sm font-mono">
                  {window.location.origin}/api/webhook/orders
                </div>
                <div className="bg-muted p-3 rounded text-sm font-mono">
                  {window.location.origin}/api/webhook/products
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">3. 获取密钥</h4>
                <p className="text-sm text-muted-foreground">
                  在上面的Webhook配置中创建端点后，复制生成的密钥到插件设置中
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">4. 启用事件</h4>
                <p className="text-sm text-muted-foreground">
                  在插件设置中选择要同步的事件类型（订单创建、订单更新、产品更新等）
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingWebhook ? '编辑Webhook端点' : '创建Webhook端点'}
            </DialogTitle>
            <DialogDescription>
              配置WooCommerce站点的Webhook实时同步设置
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="site">站点</Label>
              <select
                id="site"
                className="w-full p-2 border border-input bg-background rounded-md"
                value={formData.site_id}
                onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
                disabled={!!editingWebhook}
              >
                <option value="">选择站点</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.url})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook_url">Webhook URL</Label>
              <Input
                id="webhook_url"
                placeholder={`${window.location.origin}/api/webhook/orders`}
                value={formData.webhook_url}
                onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                推荐使用: {window.location.origin}/api/webhook/orders (订单) 或 {window.location.origin}/api/webhook/products (产品)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret_key">密钥 (可选)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="secret_key"
                    type={showSecretKey ? 'text' : 'password'}
                    placeholder="用于验证Webhook请求的密钥"
                    value={formData.secret_key}
                    onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                  >
                    {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateSecretKey}
                >
                  生成
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>事件类型</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(formData.events).map(([event, enabled]) => (
                  <label key={event} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setFormData({
                        ...formData,
                        events: { ...formData.events, [event]: e.target.checked }
                      })}
                    />
                    <span className="text-sm">{event}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
              />
              <Label htmlFor="enabled">启用Webhook</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={editingWebhook ? handleUpdateWebhook : handleCreateWebhook}>
              {editingWebhook ? '更新' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}