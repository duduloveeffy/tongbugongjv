'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Settings,
  Play,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Bell,
  Filter,
  Globe,
  History,
  Loader2,
  Calendar,
} from 'lucide-react';

interface FilterConfig {
  isMergedMode: boolean;
  hideZeroStock: boolean;
  hideNormalStatus: boolean;
  showNeedSync: boolean;
  categoryFilter: string;
  categoryFilters: string[];
  skuFilter: string;
  excludeSkuPrefixes: string;
  excludeWarehouses: string;
}

interface AutoSyncConfig {
  id?: string;
  name: string;
  enabled: boolean;
  site_ids: string[];
  filters: FilterConfig;
  sync_to_instock: boolean;
  sync_to_outofstock: boolean;
  wechat_webhook_url: string | null;
  notify_on_success: boolean;
  notify_on_failure: boolean;
  notify_on_no_changes: boolean;
  cron_expression: string;
  last_run_at?: string;
  last_run_status?: string;
  last_run_summary?: {
    total_sites: number;
    total_checked: number;
    total_synced_to_instock: number;
    total_synced_to_outofstock: number;
    total_failed: number;
    total_skipped: number;
    duration_ms: number;
  };
}

interface Site {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  last_sync_at: string | null;
  sku_filter: string | null;
  exclude_sku_prefixes: string | null;
  category_filters: string[] | null;
  exclude_warehouses: string | null;
}

interface SyncLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  total_skus_checked: number;
  skus_synced_to_instock: number;
  skus_synced_to_outofstock: number;
  skus_failed: number;
  error_message: string | null;
}

// 站点定时任务配置（从 vercel.json 读取，时间为 UTC）
const SITE_SCHEDULES: Record<string, string> = {
  '7e8da05b-290d-48f2-b5c5-904fe81ad3db': '7:00',
  'bd4589cc-29d7-4483-8aa5-f4b46669908c': '7:05',
  '6cbbbdc3-aa62-4e2b-9b58-dced82de76dc': '7:10',
  'e7f7e121-8c41-40ed-be10-8ae7fddb1caf': '7:15',
  '43e95442-8537-4697-af83-d81a6aa7d238': '7:20',
  '547e7d5c-5b14-42b9-904d-94437e67f820': '7:25',
  '7f73b272-2537-43c7-914d-4564116b76f9': '7:30',
  '57568bb9-4988-4778-adc9-9820c240d669': '7:35',
  'a2b7a045-d389-4f3f-a632-71e0344c4d18': '7:40',
  'b08bc00a-a655-45bb-99d6-a672c7133fb0': '7:45',
  'dd2c8c53-a7e3-4959-88f3-fffdece6e16f': '7:50',
  '3c82945d-ac75-462e-b018-0898fbaa31c3': '7:55',
  '88882566-2e23-4062-ae9e-3a7907cf4f11': '8:00',
  'bad1ba8b-4a06-4977-a398-0798fe376195': '8:05',
  '4fcb9c7d-e546-4ff7-aa10-894b5bd81b42': '8:10',
  'b061f0b2-d2be-47de-8c8b-04bf92d2dcdd': '8:15',
};

export default function AutoSyncPage() {
  const [config, setConfig] = useState<AutoSyncConfig | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [siteFilters, setSiteFilters] = useState<Record<string, {
    skuFilter: string;
    excludeSkuPrefixes: string;
    categoryFilters: string;
    excludeWarehouses: string;
  }>>({});

  // 单站点同步状态
  const [syncingSiteId, setSyncingSiteId] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // 添加调试日志
  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    setDebugLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));
  }, []);

  // 加载配置
  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/sync/auto-config');
      const data = await response.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      toast.error('加载配置失败');
    }
  }, []);

  // 加载站点列表
  const loadSites = useCallback(async () => {
    try {
      const response = await fetch('/api/sites');
      const data = await response.json();
      if (data.success) {
        const loadedSites = data.sites || [];
        setSites(loadedSites);
        const filtersMap: Record<string, {
          skuFilter: string;
          excludeSkuPrefixes: string;
          categoryFilters: string;
          excludeWarehouses: string;
        }> = {};
        loadedSites.forEach((site: Site) => {
          filtersMap[site.id] = {
            skuFilter: site.sku_filter || '',
            excludeSkuPrefixes: site.exclude_sku_prefixes || '',
            categoryFilters: (site.category_filters || []).join(', '),
            excludeWarehouses: site.exclude_warehouses || '',
          };
        });
        setSiteFilters(filtersMap);
      }
    } catch (error) {
      console.error('加载站点失败:', error);
    }
  }, []);

  // 加载同步日志
  const loadLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/sync/auto-logs');
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('加载日志失败:', error);
    }
  }, []);

  // 手动触发单站点同步
  const handleTriggerSingleSite = async (siteId: string, siteName: string) => {
    setSyncingSiteId(siteId);
    addDebugLog(`🚀 手动触发 ${siteName} 同步...`);
    try {
      const response = await fetch(`/api/sync/single-site?site_id=${siteId}`);
      const data = await response.json();
      if (data.success) {
        if (data.skipped) {
          toast.info(data.message || '已跳过');
          addDebugLog(`⏭️ ${siteName}: ${data.message}`);
        } else {
          toast.success(`${siteName} 同步完成`);
          addDebugLog(`✅ ${siteName}: +${data.synced_to_instock} 有货, +${data.synced_to_outofstock} 无货`);
        }
        await loadSites();
      } else {
        toast.error(data.error || '同步失败');
        addDebugLog(`❌ ${siteName} 同步失败: ${data.error}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误';
      addDebugLog(`❌ ${siteName} 网络错误: ${msg}`);
      toast.error('同步失败');
    } finally {
      setSyncingSiteId(null);
    }
  };

  // 触发所有站点同步（串行执行）
  const handleTriggerAllSites = async () => {
    if (!config) return;

    const enabledSites = sites.filter(s => s.enabled && config.site_ids.includes(s.id));
    if (enabledSites.length === 0) {
      toast.warning('没有启用的站点');
      return;
    }

    addDebugLog(`🚀 开始同步 ${enabledSites.length} 个站点...`);

    for (const site of enabledSites) {
      await handleTriggerSingleSite(site.id, site.name);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    addDebugLog(`✅ 所有站点同步完成`);
    toast.success('所有站点同步完成');
  };

  // 初始化加载
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([loadConfig(), loadSites(), loadLogs()]);
      setIsLoading(false);
    };
    init();
  }, [loadConfig, loadSites, loadLogs]);

  // 保存配置
  const handleSave = async () => {
    if (!config) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/sync/auto-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      if (!data.success) {
        toast.error(data.error || '保存失败');
        return;
      }

      const siteFilterPromises = Object.entries(siteFilters).map(async ([siteId, filters]) => {
        const filterResponse = await fetch('/api/sync/site-filters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site_id: siteId,
            sku_filter: filters.skuFilter || null,
            exclude_sku_prefixes: filters.excludeSkuPrefixes || null,
            category_filters: filters.categoryFilters ? filters.categoryFilters.split(',').map(s => s.trim()).filter(Boolean) : null,
            exclude_warehouses: filters.excludeWarehouses || null,
          }),
        });

        if (!filterResponse.ok) {
          const errorData = await filterResponse.json();
          throw new Error(`保存站点 ${siteId} 筛选配置失败: ${errorData.error}`);
        }
      });

      await Promise.all(siteFilterPromises);

      setConfig(data.config);
      toast.success('配置已保存');
    } catch (error) {
      console.error('保存配置失败:', error);
      toast.error(error instanceof Error ? error.message : '保存配置失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 更新配置字段
  const updateConfig = (updates: Partial<AutoSyncConfig>) => {
    if (!config) return;
    setConfig({ ...config, ...updates });
  };

  // 更新筛选条件
  const updateFilters = (updates: Partial<FilterConfig>) => {
    if (!config) return;
    setConfig({
      ...config,
      filters: { ...config.filters, ...updates },
    });
  };

  // 切换站点选择
  const toggleSite = (siteId: string) => {
    if (!config) return;
    const newSiteIds = config.site_ids.includes(siteId)
      ? config.site_ids.filter(id => id !== siteId)
      : [...config.site_ids, siteId];
    updateConfig({ site_ids: newSiteIds });
  };

  // 更新站点过滤配置（本地状态）
  const updateSiteFilter = (siteId: string, field: keyof typeof siteFilters[string], value: string) => {
    setSiteFilters(prev => {
      const current = prev[siteId] || { skuFilter: '', excludeSkuPrefixes: '', categoryFilters: '', excludeWarehouses: '' };
      return {
        ...prev,
        [siteId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  // 保存站点过滤配置到数据库
  const saveSiteFilters = async (siteId: string) => {
    const filters = siteFilters[siteId];
    if (!filters) return;

    try {
      const categoryFiltersArray = filters.categoryFilters
        .split(/[,，\n]/)
        .map((s: string) => s.trim())
        .filter((s: string) => s);

      const response = await fetch(`/api/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_filter: filters.skuFilter || null,
          exclude_sku_prefixes: filters.excludeSkuPrefixes || null,
          category_filters: categoryFiltersArray.length > 0 ? categoryFiltersArray : null,
          exclude_warehouses: filters.excludeWarehouses || null,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(`${sites.find(s => s.id === siteId)?.name || '站点'} 过滤配置已保存`);
        await loadSites();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch (error) {
      console.error('保存站点过滤配置失败:', error);
      toast.error('保存站点过滤配置失败');
    }
  };

  if (isLoading) {
    return (
      <PageLayout title="自动同步配置" description="配置定时自动同步库存">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageLayout>
    );
  }

  if (!config) {
    return (
      <PageLayout title="自动同步配置" description="配置定时自动同步库存">
        <div className="text-center py-12 text-muted-foreground">
          无法加载配置
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="自动同步配置"
      description="配置定时自动同步库存到 WooCommerce"
    >
      <div className="space-y-6">
        {/* 操作栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => updateConfig({ enabled: checked })}
              />
              <Label>启用自动同步</Label>
            </div>
            {config.enabled && (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                已启用
              </Badge>
            )}
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            保存配置
          </Button>
        </div>

        {/* 定时任务状态 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                定时同步任务
                <Badge variant="outline" className="ml-2">Vercel Cron</Badge>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerAllSites}
                disabled={syncingSiteId !== null}
              >
                {syncingSiteId ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-1" />
                )}
                手动同步全部
              </Button>
            </div>
            <CardDescription>
              每天 UTC 7:00-8:15 自动执行，每个站点间隔 5 分钟独立运行
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 站点定时任务列表 */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {sites.map((site) => {
                const schedule = SITE_SCHEDULES[site.id];
                const isCurrentlySyncing = syncingSiteId === site.id;
                const lastSync = site.last_sync_at ? new Date(site.last_sync_at) : null;
                const isToday = lastSync && lastSync.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={site.id}
                    className={`p-3 rounded-lg border text-sm ${
                      isCurrentlySyncing ? 'bg-blue-50 border-blue-200' :
                      isToday ? 'bg-green-50 border-green-200' :
                      !site.enabled ? 'bg-gray-50 border-gray-200 opacity-60' :
                      'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium truncate flex-1">{site.name}</div>
                      {!site.enabled && (
                        <Badge variant="secondary" className="text-xs ml-1">禁用</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Clock className="w-3 h-3" />
                      <span>{schedule ? `每天 ${schedule} UTC` : '未配置'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs">
                        {isCurrentlySyncing ? (
                          <>
                            <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                            <span className="text-blue-600">同步中</span>
                          </>
                        ) : isToday ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span className="text-green-600">
                              {lastSync?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </>
                        ) : lastSync ? (
                          <>
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-500">
                              {lastSync.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-500">从未同步</span>
                          </>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleTriggerSingleSite(site.id, site.name)}
                        disabled={syncingSiteId !== null || !site.enabled}
                      >
                        <Play className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 查看 Vercel 日志提示 */}
            <div className="space-y-2 pt-4 border-t">
              <Label className="text-sm">服务器日志</Label>
              <div className="bg-slate-100 rounded p-3 text-sm text-slate-600">
                <p>💡 服务器执行日志在 Vercel 控制台查看：</p>
                <ol className="mt-2 ml-4 space-y-1 list-decimal">
                  <li>打开 <a href="https://vercel.com" target="_blank" rel="noopener" className="text-blue-600 hover:underline">Vercel Dashboard</a></li>
                  <li>选择项目 → Logs 标签</li>
                  <li>筛选 <code className="bg-slate-200 px-1 rounded text-xs">/api/sync/single-site</code></li>
                </ol>
              </div>
            </div>

            {/* 调试日志 */}
            {debugLogs.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">操作日志</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDebugLogs([])}
                    className="h-6 text-xs"
                  >
                    清空
                  </Button>
                </div>
                <div className="bg-slate-950 text-slate-50 rounded p-3 font-mono text-xs max-h-48 overflow-y-auto">
                  {debugLogs.map((log, i) => (
                    <div key={i} className="py-0.5">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 上次运行状态 */}
        {config.last_run_at && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                上次运行
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">时间：</span>
                  {new Date(config.last_run_at).toLocaleString('zh-CN')}
                </div>
                <div>
                  <span className="text-muted-foreground">状态：</span>
                  <Badge
                    variant={
                      config.last_run_status === 'success' ? 'default' :
                      config.last_run_status === 'partial' ? 'secondary' :
                      config.last_run_status === 'no_changes' ? 'outline' : 'destructive'
                    }
                    className="ml-1"
                  >
                    {config.last_run_status === 'success' ? '成功' :
                     config.last_run_status === 'partial' ? '部分失败' :
                     config.last_run_status === 'no_changes' ? '无变化' : '失败'}
                  </Badge>
                </div>
                {config.last_run_summary && (
                  <>
                    <div>
                      <span className="text-muted-foreground">同步有货：</span>
                      <span className="text-green-600 font-medium">
                        +{config.last_run_summary.total_synced_to_instock}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">同步无货：</span>
                      <span className="text-red-600 font-medium">
                        +{config.last_run_summary.total_synced_to_outofstock}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">耗时：</span>
                      {(config.last_run_summary.duration_ms / 1000).toFixed(1)}秒
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 站点选择（全宽） */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              同步站点配置
              <Badge variant="outline" className="ml-2">{sites.filter(s => config.site_ids.includes(s.id)).length}/{sites.length} 已选择</Badge>
            </CardTitle>
            <CardDescription>
              选择要同步的站点并配置各站点的独立过滤规则（留空则使用下方全局配置）
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sites.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                暂无站点，请先在站点管理中添加
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {sites.map((site) => (
                  <div key={site.id} className="border rounded-lg p-3 space-y-3">
                    {/* 站点头部 */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={config.site_ids.includes(site.id)}
                          onCheckedChange={() => toggleSite(site.id)}
                        />
                        <div>
                          <div className="font-medium text-sm">{site.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[150px]">{site.url}</div>
                        </div>
                      </div>
                      {!site.enabled && (
                        <Badge variant="secondary" className="text-xs">禁用</Badge>
                      )}
                    </div>

                    {/* 过滤配置 */}
                    {siteFilters[site.id] && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">SKU 筛选</Label>
                          <Input
                            placeholder="关键词，逗号分隔"
                            value={siteFilters[site.id]?.skuFilter || ''}
                            onChange={(e) => updateSiteFilter(site.id, 'skuFilter', e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">排除前缀</Label>
                          <Input
                            placeholder="前缀，逗号分隔"
                            value={siteFilters[site.id]?.excludeSkuPrefixes || ''}
                            onChange={(e) => updateSiteFilter(site.id, 'excludeSkuPrefixes', e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">品类筛选</Label>
                          <Input
                            placeholder="品类，逗号分隔"
                            value={siteFilters[site.id]?.categoryFilters || ''}
                            onChange={(e) => updateSiteFilter(site.id, 'categoryFilters', e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">排除仓库</Label>
                          <Input
                            placeholder="仓库，逗号分隔"
                            value={siteFilters[site.id]?.excludeWarehouses || ''}
                            onChange={(e) => updateSiteFilter(site.id, 'excludeWarehouses', e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs mt-2"
                          onClick={() => saveSiteFilters(site.id)}
                        >
                          <Save className="w-3 h-3 mr-1" />
                          保存配置
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 同步选项 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                同步选项
              </CardTitle>
              <CardDescription>
                配置同步行为
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>同步为有货</Label>
                  <p className="text-xs text-muted-foreground">
                    当 WooCommerce 显示无货但本地有库存时
                  </p>
                </div>
                <Switch
                  checked={config.sync_to_instock}
                  onCheckedChange={(checked) => updateConfig({ sync_to_instock: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>同步为无货</Label>
                  <p className="text-xs text-muted-foreground">
                    当 WooCommerce 显示有货但本地无库存时
                  </p>
                </div>
                <Switch
                  checked={config.sync_to_outofstock}
                  onCheckedChange={(checked) => updateConfig({ sync_to_outofstock: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* 筛选条件 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                筛选条件
              </CardTitle>
              <CardDescription>
                与库存同步页面相同的筛选条件
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>合并仓库数据</Label>
                <Switch
                  checked={config.filters.isMergedMode}
                  onCheckedChange={(checked) => updateFilters({ isMergedMode: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>排除 SKU 前缀</Label>
                <Textarea
                  placeholder="JNR,VS5-,HO..."
                  value={config.filters.excludeSkuPrefixes}
                  onChange={(e) => updateFilters({ excludeSkuPrefixes: e.target.value })}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  多个前缀用逗号分隔
                </p>
              </div>

              <div className="space-y-2">
                <Label>排除仓库</Label>
                <Input
                  placeholder="深圳,德五,美一仓..."
                  value={config.filters.excludeWarehouses}
                  onChange={(e) => updateFilters({ excludeWarehouses: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  多个仓库用逗号分隔，合并前生效
                </p>
              </div>

              <div className="space-y-2">
                <Label>SKU 筛选</Label>
                <Input
                  placeholder="输入 SKU 关键词..."
                  value={config.filters.skuFilter}
                  onChange={(e) => updateFilters({ skuFilter: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* 企业微信通知 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                企业微信通知
              </CardTitle>
              <CardDescription>
                同步完成后推送结果到企业微信群
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Webhook 地址</Label>
                <Input
                  placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                  value={config.wechat_webhook_url || ''}
                  onChange={(e) => updateConfig({ wechat_webhook_url: e.target.value || null })}
                />
                <p className="text-xs text-muted-foreground">
                  在企业微信群设置中创建机器人获取
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>同步成功时通知</Label>
                  <Switch
                    checked={config.notify_on_success}
                    onCheckedChange={(checked) => updateConfig({ notify_on_success: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>同步失败时通知</Label>
                  <Switch
                    checked={config.notify_on_failure}
                    onCheckedChange={(checked) => updateConfig({ notify_on_failure: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>无变化时通知</Label>
                  <Switch
                    checked={config.notify_on_no_changes}
                    onCheckedChange={(checked) => updateConfig({ notify_on_no_changes: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 同步日志 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              同步日志
            </CardTitle>
            <CardDescription>
              最近的自动同步记录
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                暂无同步记录
              </div>
            ) : (
              <div className="space-y-2">
                {logs.slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 border rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-4">
                      {log.status === 'success' || log.status === 'no_changes' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : log.status === 'partial' ? (
                        <XCircle className="w-4 h-4 text-yellow-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-muted-foreground">
                        {new Date(log.started_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span>检测: {log.total_skus_checked}</span>
                      <span className="text-green-600">有货+{log.skus_synced_to_instock}</span>
                      <span className="text-red-600">无货+{log.skus_synced_to_outofstock}</span>
                      {log.skus_failed > 0 && (
                        <span className="text-orange-600">失败{log.skus_failed}</span>
                      )}
                      <Badge
                        variant={
                          log.status === 'success' ? 'default' :
                          log.status === 'partial' ? 'secondary' :
                          log.status === 'no_changes' ? 'outline' : 'destructive'
                        }
                      >
                        {log.status === 'success' ? '成功' :
                         log.status === 'partial' ? '部分失败' :
                         log.status === 'no_changes' ? '无变化' :
                         log.status === 'running' ? '运行中' : '失败'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}