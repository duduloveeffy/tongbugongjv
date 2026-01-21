'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TrendingUp, Globe, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface SalesDetectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (config: SalesDetectionConfig) => void;
  sites: Site[];
  skuCount: number;
  isLoading?: boolean;
}

interface Site {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  last_sync_at?: string | null;
}

export interface SalesDetectionConfig {
  dataSource: 'supabase';
  siteIds: string[];
  statuses: string[];
  daysBack: number;
  dateStart?: string;
  dateEnd?: string;
}

export function SalesDetectionDialog({
  open,
  onOpenChange,
  onConfirm,
  sites,
  skuCount,
  isLoading = false
}: SalesDetectionDialogProps) {
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(true);
  const [daysBack, setDaysBack] = useState(30);
  const [orderStatuses, setOrderStatuses] = useState<string[]>(['completed', 'processing']);

  // Initialize with all sites selected
  useEffect(() => {
    if (sites.length > 0 && selectedSiteIds.length === 0) {
      const allSiteIds = sites.filter(s => s.enabled).map(s => s.id);
      setSelectedSiteIds(allSiteIds);
      setSelectAll(true);
    }
  }, [sites]);

  const handleSelectAllChange = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedSiteIds(sites.filter(s => s.enabled).map(s => s.id));
    } else {
      setSelectedSiteIds([]);
    }
  };

  const handleSiteToggle = (siteId: string, checked: boolean) => {
    if (checked) {
      setSelectedSiteIds([...selectedSiteIds, siteId]);
    } else {
      setSelectedSiteIds(selectedSiteIds.filter(id => id !== siteId));
      setSelectAll(false);
    }
  };

  const handleStatusToggle = (status: string, checked: boolean) => {
    if (checked) {
      setOrderStatuses([...orderStatuses, status]);
    } else {
      setOrderStatuses(orderStatuses.filter(s => s !== status));
    }
  };

  const handleConfirm = () => {
    if (selectedSiteIds.length === 0) {
      toast.error('请至少选择一个站点');
      return;
    }

    if (orderStatuses.length === 0) {
      toast.error('请至少选择一个订单状态');
      return;
    }

    const config: SalesDetectionConfig = {
      dataSource: 'supabase',
      siteIds: selectAll ? [] : selectedSiteIds, // Empty array means all sites
      statuses: orderStatuses,
      daysBack,
    };

    onConfirm(config);
  };

  const statusOptions = [
    { value: 'completed', label: '已完成' },
    { value: 'processing', label: '处理中' },
    { value: 'pending', label: '待支付' },
    { value: 'on-hold', label: '暂停' },
    { value: 'cancelled', label: '已取消' },
    { value: 'refunded', label: '已退款' },
    { value: 'failed', label: '失败' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            销量检测设置
          </DialogTitle>
          <DialogDescription>
            配置销量检测参数，选择要查询的站点和订单状态
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Important Notice about Data Source */}
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-900">数据来源说明</AlertTitle>
            <AlertDescription className="text-orange-800 space-y-2 mt-2">
              <p>销量检测从 <strong>本地 Supabase 数据库</strong> 获取数据，而非实时 WooCommerce API。</p>
              <p className="text-sm">
                如果没有销量数据或数据不准确，请先执行"数据同步"将 WooCommerce 订单同步到本地。
              </p>
            </AlertDescription>
          </Alert>

          {/* SKU Count Info */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              将检测 <strong>{skuCount}</strong> 个SKU的销量数据
            </AlertDescription>
          </Alert>

          {/* Days Back Selection */}
          <div className="space-y-2">
            <Label>统计天数</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={daysBack}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value) && value >= 1 && value <= 365) {
                    setDaysBack(value);
                  }
                }}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">天</span>
              <div className="flex gap-1 ml-2">
                {[7, 15, 30, 60, 90].map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant={daysBack === d ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDaysBack(d)}
                    className="h-7 px-2 text-xs"
                  >
                    {d}天
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Order Status Selection */}
          <div className="space-y-2">
            <Label>订单状态</Label>
            <div className="grid grid-cols-3 gap-2">
              {statusOptions.map(status => (
                <div key={status.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status.value}`}
                    checked={orderStatuses.includes(status.value)}
                    onCheckedChange={(checked) => handleStatusToggle(status.value, checked as boolean)}
                  />
                  <Label
                    htmlFor={`status-${status.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {status.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Site Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>选择站点</Label>
              <Badge variant="secondary">
                {selectAll ? '所有站点' : `${selectedSiteIds.length}/${sites.length} 个站点`}
              </Badge>
            </div>

            {/* Select All Checkbox */}
            <div className="flex items-center space-x-2 pb-2 border-b">
              <Checkbox
                id="select-all"
                checked={selectAll}
                onCheckedChange={handleSelectAllChange}
              />
              <Label
                htmlFor="select-all"
                className="text-sm font-medium cursor-pointer"
              >
                选择所有站点（查询所有站点的汇总数据）
              </Label>
            </div>

            {/* Site List */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {sites.map(site => (
                <div
                  key={site.id}
                  className={`flex items-center space-x-2 p-2 rounded ${
                    !site.enabled ? 'opacity-50' : ''
                  }`}
                >
                  <Checkbox
                    id={`site-${site.id}`}
                    checked={selectedSiteIds.includes(site.id)}
                    onCheckedChange={(checked) => handleSiteToggle(site.id, checked as boolean)}
                    disabled={!site.enabled}
                  />
                  <Label
                    htmlFor={`site-${site.id}`}
                    className="flex-1 text-sm font-normal cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="h-3 w-3" />
                      <span>{site.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({new URL(site.url).hostname})
                      </span>
                    </div>
                  </Label>
                  {site.last_sync_at && site.last_sync_at !== null ? (
                    <span className="text-xs text-green-600">
                      已同步: {new Date(site.last_sync_at).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  ) : (
                    <span className="text-xs text-orange-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      未同步
                    </span>
                  )}
                </div>
              ))}
            </div>

            {selectedSiteIds.length === 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  请至少选择一个站点进行销量检测
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-3">
          <div className="flex-1 text-left">
            <a
              href="/sync"
              className="text-sm text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              前往数据同步页面
            </a>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isLoading || selectedSiteIds.length === 0 || orderStatuses.length === 0}
            >
              {isLoading ? '检测中...' : '开始检测'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}