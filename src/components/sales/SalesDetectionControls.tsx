import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { InventoryItem } from '@/lib/inventory-utils';
import { Calendar, TrendingUp, Database, Globe, Building2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface SalesDetectionControlsProps {
  isEnabled: boolean;
  isLoading: boolean;
  progress: string;
  orderStatuses: string[];
  dateRange: { start: string; end: string };
  onToggle: (enabled: boolean) => void;
  onOrderStatusesChange: (statuses: string[]) => void;
  onDateRangeChange: (range: { start: string; end: string }) => void;
  onStartDetection: (skus: string[], config: SalesDetectionConfig) => void;
  filteredData: InventoryItem[];
}

export interface SalesDetectionConfig {
  dataSource: 'supabase' | 'woocommerce';
  siteIds?: string[];  // For Supabase
  siteId?: string;     // For WooCommerce single site
  statuses: string[];
  dateStart?: string;
  dateEnd?: string;
  daysBack: number;
}

interface WooCommerceSite {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  last_sync_at?: string;
}

export function SalesDetectionControls({
  isEnabled,
  isLoading,
  progress,
  orderStatuses,
  dateRange,
  onToggle,
  onOrderStatusesChange,
  onDateRangeChange,
  onStartDetection,
  filteredData,
}: SalesDetectionControlsProps) {
  const [batchSize, setBatchSize] = useState(() => filteredData.length || 100);
  const [dataSource, setDataSource] = useState<'supabase' | 'woocommerce'>('supabase');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [availableSites, setAvailableSites] = useState<WooCommerceSite[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [daysBack, setDaysBack] = useState(30);

  // Update batchSize when filteredData changes
  useEffect(() => {
    if (filteredData.length > 0) {
      setBatchSize(filteredData.length);
    }
  }, [filteredData.length]);

  // 加载可用站点列表
  useEffect(() => {
    if (isEnabled) {
      loadAvailableSites();
    }
  }, [isEnabled, dataSource]);

  const loadAvailableSites = async () => {
    setIsLoadingSites(true);
    try {
      const endpoint = dataSource === 'supabase' 
        ? '/api/sales-analysis/supabase'
        : '/api/sales-analysis/woocommerce';
      
      const response = await fetch(endpoint);
      const data = await response.json();
      
      if (data.success && data.sites) {
        setAvailableSites(data.sites);
        
        // 自动选择第一个站点（如果有）
        if (data.sites.length > 0) {
          if (dataSource === 'supabase') {
            // Supabase模式：默认选择所有站点
            setSelectedSiteIds(data.sites.map((s: WooCommerceSite) => s.id));
          } else {
            // WooCommerce模式：选择第一个站点
            setSelectedSiteId(data.sites[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load sites:', error);
      toast.error('加载站点列表失败');
    } finally {
      setIsLoadingSites(false);
    }
  };

  const handleStartDetection = () => {
    if (filteredData.length === 0) {
      toast.error('请先导入库存数据');
      return;
    }

    if (dataSource === 'supabase' && selectedSiteIds.length === 0) {
      toast.error('请至少选择一个站点');
      return;
    }

    if (dataSource === 'woocommerce' && !selectedSiteId) {
      toast.error('请选择一个站点');
      return;
    }

    const skus = filteredData.map(item => item.产品代码).slice(0, batchSize);
    
    const config: SalesDetectionConfig = {
      dataSource,
      statuses: orderStatuses,
      dateStart: dateRange.start || undefined,
      dateEnd: dateRange.end || undefined,
      daysBack,
    };

    if (dataSource === 'supabase') {
      config.siteIds = selectedSiteIds;
    } else {
      config.siteId = selectedSiteId;
    }

    onStartDetection(skus, config);
  };

  const orderStatusOptions = [
    { value: 'completed', label: '已完成' },
    { value: 'processing', label: '处理中' },
    { value: 'pending', label: '待支付' },
    { value: 'on-hold', label: '暂停' },
    { value: 'cancelled', label: '已取消' },
    { value: 'refunded', label: '已退款' },
    { value: 'failed', label: '失败' },
  ];

  const handleStatusChange = (status: string, checked: boolean) => {
    if (checked) {
      onOrderStatusesChange([...orderStatuses, status]);
    } else {
      onOrderStatusesChange(orderStatuses.filter(s => s !== status));
    }
  };

  const handleSiteSelection = (siteId: string, checked: boolean) => {
    if (checked) {
      setSelectedSiteIds([...selectedSiteIds, siteId]);
    } else {
      setSelectedSiteIds(selectedSiteIds.filter(id => id !== siteId));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          销量检测设置
        </CardTitle>
        <CardDescription>
          从Supabase或WooCommerce获取产品销量数据
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="sales-detection"
            checked={isEnabled}
            onCheckedChange={onToggle}
          />
          <Label htmlFor="sales-detection">启用销量检测功能</Label>
        </div>

        {isEnabled && (
          <div className="space-y-4 border-t pt-4">
            {/* 数据源选择 */}
            <div className="space-y-3">
              <Label>数据源选择</Label>
              <RadioGroup value={dataSource} onValueChange={(v) => setDataSource(v as 'supabase' | 'woocommerce')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="supabase" id="source-supabase" />
                  <Label htmlFor="source-supabase" className="flex items-center gap-2 cursor-pointer">
                    <Database className="h-4 w-4" />
                    Supabase (推荐 - 支持多站点汇总)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="woocommerce" id="source-woocommerce" />
                  <Label htmlFor="source-woocommerce" className="flex items-center gap-2 cursor-pointer">
                    <Globe className="h-4 w-4" />
                    WooCommerce API (实时数据)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* 站点选择 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  站点选择
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadAvailableSites}
                  disabled={isLoadingSites}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingSites ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {dataSource === 'supabase' ? (
                // Supabase: 多选站点
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                  {availableSites.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {isLoadingSites ? '加载中...' : '没有可用的站点'}
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center space-x-2 pb-2 border-b">
                        <Checkbox
                          id="select-all"
                          checked={selectedSiteIds.length === availableSites.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedSiteIds(availableSites.map(s => s.id));
                            } else {
                              setSelectedSiteIds([]);
                            }
                          }}
                        />
                        <Label htmlFor="select-all" className="text-sm font-medium">
                          全选所有站点
                        </Label>
                      </div>
                      {availableSites.map(site => (
                        <div key={site.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`site-${site.id}`}
                            checked={selectedSiteIds.includes(site.id)}
                            onCheckedChange={(checked) => handleSiteSelection(site.id, checked as boolean)}
                          />
                          <Label htmlFor={`site-${site.id}`} className="text-sm cursor-pointer">
                            {site.name}
                            {site.last_sync_at && (
                              <span className="text-xs text-muted-foreground ml-2">
                                最后同步: {new Date(site.last_sync_at).toLocaleDateString()}
                              </span>
                            )}
                          </Label>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                // WooCommerce: 单选站点
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingSites ? "加载中..." : "选择站点"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSites.map(site => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name} ({site.url})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 时间范围设置 */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="start-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  开始日期
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="end-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  结束日期
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
                />
              </div>
            </div>

            {/* 对比天数设置 */}
            <div>
              <Label htmlFor="days-back">销量对比天数</Label>
              <Select value={daysBack.toString()} onValueChange={(v) => setDaysBack(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">最近7天</SelectItem>
                  <SelectItem value="14">最近14天</SelectItem>
                  <SelectItem value="30">最近30天</SelectItem>
                  <SelectItem value="60">最近60天</SelectItem>
                  <SelectItem value="90">最近90天</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 订单状态筛选 */}
            <div>
              <Label>订单状态筛选</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {orderStatusOptions.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`status-${option.value}`}
                      checked={orderStatuses.includes(option.value)}
                      onCheckedChange={(checked) => handleStatusChange(option.value, checked as boolean)}
                    />
                    <Label htmlFor={`status-${option.value}`} className="text-sm">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* 检测数量限制 */}
            <div>
              <Label htmlFor="batch-size">检测数量限制</Label>
              <Select value={batchSize.toString()} onValueChange={(value) => setBatchSize(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">前50个SKU</SelectItem>
                  <SelectItem value="100">前100个SKU</SelectItem>
                  <SelectItem value="200">前200个SKU</SelectItem>
                  <SelectItem value="500">前500个SKU</SelectItem>
                  <SelectItem value={filteredData.length.toString()}>
                    全部 ({filteredData.length}个SKU)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 开始检测按钮 */}
            <Button 
              onClick={handleStartDetection}
              disabled={isLoading || filteredData.length === 0 || 
                (dataSource === 'supabase' ? selectedSiteIds.length === 0 : !selectedSiteId)}
              className="w-full"
            >
              {isLoading ? '检测中...' : `开始销量检测 (${Math.min(batchSize, filteredData.length)}个SKU)`}
            </Button>

            {/* 进度显示 */}
            {isLoading && progress && (
              <div className="rounded bg-muted p-3 text-muted-foreground text-sm">
                {progress}
              </div>
            )}

            {/* 数据源说明 */}
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              {dataSource === 'supabase' ? (
                <>
                  <p>• 数据来源：Supabase数据库中的同步订单数据</p>
                  <p>• 优势：查询速度快，支持多站点汇总统计</p>
                  <p>• 注意：数据更新依赖于定期同步任务</p>
                </>
              ) : (
                <>
                  <p>• 数据来源：直接调用WooCommerce REST API</p>
                  <p>• 优势：获取最新实时数据</p>
                  <p>• 注意：大量数据查询可能较慢</p>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}