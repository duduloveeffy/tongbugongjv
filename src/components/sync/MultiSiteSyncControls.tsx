'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Globe,
  CheckCircle,
  Info,
  Search,
  ArrowRight,
  RefreshCw,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/export-utils';
import { useMultiSiteStore } from '@/store/multisite';
import { useInventoryStore } from '@/store/inventory';
import type { InventoryItem } from '@/lib/inventory-utils';
import { calculateNetStock } from '@/lib/inventory-utils';
import { PRESET_RULES, type SyncRule } from '@/lib/sync-rules';
import { MultiSiteDetectionTable } from './MultiSiteDetectionTable';

// 使用共享组件
import { SiteSelector } from './shared/SiteSelector';
import { SyncProgressBar } from './shared/SyncProgressBar';
import { SyncModeSelector } from './shared/SyncModeSelector';
import { SyncResultSummary } from './shared/SyncResultSummary';
import { SyncStatusIndicator } from './shared/SyncStatusIndicator';
import {
  batchDetectProducts,
  batchSyncToSites,
  validateSyncParams,
  type SyncConfig,
  type SyncResult,
  type SiteInfo as CoreSiteInfo,
  type SiteDetectionResult
} from '@/lib/sync-core';

interface MultiSiteSyncControlsProps {
  filteredData: InventoryItem[];
  selectedSkus: Set<string>;
  onSkuSelectionChange?: (sku: string, checked: boolean) => void;
}

// 使用核心库的类型
type DetectionResult = {
  siteId: string;
  siteName?: string;
  exists: boolean;
  productId?: number;
  name?: string;
  status?: string;
  stockStatus?: string;
  stockQuantity?: number;
  manageStock?: boolean;
  error?: string;
};

type SyncStep = 'select' | 'detect' | 'review' | 'configure' | 'sync' | 'complete';

export function MultiSiteSyncControls({ 
  filteredData, 
  selectedSkus,
  onSkuSelectionChange 
}: MultiSiteSyncControlsProps) {
  const { sites, fetchSites } = useMultiSiteStore();
  const { updateInventoryItem } = useInventoryStore();
  
  // 步骤控制
  const [currentStep, setCurrentStep] = useState<SyncStep>('select');

  // 检测相关状态
  const [selectedSitesForDetection, setSelectedSitesForDetection] = useState<Set<string>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [detectionResults, setDetectionResults] = useState<Map<string, DetectionResult[]>>(new Map());
  const [batchSize, setBatchSize] = useState(-1); // -1 表示全部

  // 同步相关状态
  const [selectedSitesForSync, setSelectedSitesForSync] = useState<Set<string>>(new Set());
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    mode: 'status'
  });
  const [selectedRule, setSelectedRule] = useState<string>('standard');
  const [customQuantity, setCustomQuantity] = useState<number | undefined>();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);
  
  useEffect(() => {
    // 默认选中所有启用的站点进行检测
    const enabledSites = sites.filter(s => s.enabled).map(s => s.id);
    setSelectedSitesForDetection(new Set(enabledSites));
  }, [sites]);
  
  // 更新同步配置
  const updateSyncConfig = (updates: Partial<SyncConfig>) => {
    setSyncConfig(prev => ({ ...prev, ...updates }));
  };
  
  // 执行产品检测
  const handleDetection = async () => {
    // 参数验证
    const validation = validateSyncParams(
      Array.from(selectedSkus),
      sites.filter(s => selectedSitesForDetection.has(s.id)),
      syncConfig
    );

    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    setIsDetecting(true);
    setDetectionProgress(0);
    setCurrentStep('detect');

    try {
      let skusToDetect = Array.from(selectedSkus);
      // 应用批量限制
      if (batchSize > 0) {
        skusToDetect = skusToDetect.slice(0, batchSize);
      }
      const sitesToDetect = sites.filter(s => selectedSitesForDetection.has(s.id));

      // 使用核心函数进行批量检测
      const results = await batchDetectProducts(
        skusToDetect,
        sitesToDetect as CoreSiteInfo[],
        (current, total) => {
          setDetectionProgress(Math.round((current / total) * 100));
        }
      );

      setDetectionResults(results as Map<string, DetectionResult[]>);

      // 自动选中存在产品的站点进行同步
      const sitesWithProducts = new Set<string>();
      results.forEach(siteResults => {
        siteResults.forEach(result => {
          if (result.exists) {
            sitesWithProducts.add(result.siteId);
          }
        });
      });
      setSelectedSitesForSync(sitesWithProducts);

      const totalFound = Array.from(results.values())
        .flat()
        .filter(r => r.exists).length;

      toast.success(`检测完成：找到 ${totalFound} 个产品`);
      setCurrentStep('review');
    } catch (error) {
      console.error('产品检测失败:', error);
      toast.error('检测失败，请重试');
      setCurrentStep('select');
    } finally {
      setIsDetecting(false);
    }
  };
  
  // 执行同步
  const handleSync = async () => {
    const sitesToSync = sites.filter(s => selectedSitesForSync.has(s.id));

    // 准备同步配置
    const finalSyncConfig: SyncConfig = {
      ...syncConfig,
      rules: syncConfig.mode === 'smart' ?
        PRESET_RULES.filter(r => r.id === selectedRule) : undefined,
      overrideQuantity: syncConfig.mode === 'quantity' ? customQuantity : undefined
    };

    // 获取实际检测过的SKUs (从检测结果中提取)
    const detectedSkus = new Set<string>();
    detectionResults.forEach((_, sku) => {
      detectedSkus.add(sku);
    });

    // 参数验证
    const validation = validateSyncParams(
      Array.from(detectedSkus),
      sitesToSync,
      finalSyncConfig
    );

    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    setIsSyncing(true);
    setSyncProgress(0);
    setCurrentStep('sync');
    setSyncResults([]);

    try {
      const skusToSync = Array.from(detectedSkus);

      // 使用核心函数进行批量同步
      const results = await batchSyncToSites(
        skusToSync,
        sitesToSync as CoreSiteInfo[],
        finalSyncConfig,
        filteredData,
        (current, total) => {
          setSyncProgress(Math.round((current / total) * 100));
        }
      );

      setSyncResults(results);

      // 更新本地数据
      results.forEach(result => {
        if (result.success) {
          const item = filteredData.find(d => d.产品代码 === result.sku);
          if (item) {
            const multiSiteData: any = item.multiSiteProductData || {};
            multiSiteData[result.siteId] = {
              stockStatus: result.updatedStatus,
              stockQuantity: result.updatedQuantity,
              lastSyncAt: new Date().toISOString(),
              syncResult: 'success'
            };
            updateInventoryItem(result.sku, {
              multiSiteProductData: multiSiteData
            });
          }
        }
      });

      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      toast.success(`同步完成：成功 ${successCount}，失败 ${failedCount}`);
      setCurrentStep('complete');
    } catch (error) {
      console.error('同步失败:', error);
      toast.error('同步失败，请重试');
    } finally {
      setIsSyncing(false);
    }
  };
  
  // 导出检测结果
  const handleExportDetectionResults = () => {
    if (detectionResults.size === 0) {
      toast.error('没有可导出的检测结果');
      return;
    }

    try {
      const exportData: any[] = [];

      detectionResults.forEach((results, sku) => {
        results.forEach(result => {
          const siteName = sites.find(s => s.id === result.siteId)?.name || result.siteId;

          exportData.push({
            SKU: sku,
            站点: siteName,
            状态: result.exists ? '已上架' : '未上架',
            产品ID: result.productId || '-',
            产品名称: result.name || '-',
            库存状态: result.stockStatus || '-',
            库存数量: result.stockQuantity ?? '-',
            是否管理库存: result.manageStock ? '是' : '否',
            错误信息: result.error || '-',
          });
        });
      });

      exportToExcel(exportData, '产品检测结果');
      toast.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败');
    }
  };

  // 重置流程
  const handleReset = () => {
    setCurrentStep('select');
    setDetectionResults(new Map());
    setSelectedSitesForSync(new Set());
    setDetectionProgress(0);
    setSyncProgress(0);
    setSyncResults([]);
    setSyncConfig({ mode: 'status' });
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          多站点库存同步
        </CardTitle>
        <CardDescription>
          检测产品在各站点的状态，然后同步库存信息
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 步骤指示器 */}
        <div className="flex items-center justify-between mb-4">
          <div className={`flex items-center gap-2 ${currentStep === 'select' ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'select' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              1
            </div>
            <span className="text-sm">选择</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className={`flex items-center gap-2 ${currentStep === 'detect' || currentStep === 'review' ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'detect' || currentStep === 'review' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              2
            </div>
            <span className="text-sm">检测</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className={`flex items-center gap-2 ${currentStep === 'configure' ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'configure' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              3
            </div>
            <span className="text-sm">配置</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className={`flex items-center gap-2 ${currentStep === 'sync' || currentStep === 'complete' ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'sync' || currentStep === 'complete' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              4
            </div>
            <span className="text-sm">同步</span>
          </div>
        </div>
        
        {/* 步骤1：选择站点 */}
        {currentStep === 'select' && (
          <div className="space-y-4">
            {/* 使用共享的站点选择器 */}
            <SiteSelector
              sites={sites as CoreSiteInfo[]}
              mode="multiple"
              value={selectedSitesForDetection}
              onChange={(value) => setSelectedSitesForDetection(value as Set<string>)}
              label="选择要检测的站点"
            />

            {/* 检测数量限制 */}
            <div>
              <Label htmlFor="detection-batch-size">检测数量限制</Label>
              <Select value={batchSize.toString()} onValueChange={(value) => setBatchSize(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">
                    全部 ({selectedSkus.size}个SKU)
                  </SelectItem>
                  <SelectItem value="50">前50个SKU</SelectItem>
                  <SelectItem value="100">前100个SKU</SelectItem>
                  <SelectItem value="200">前200个SKU</SelectItem>
                  <SelectItem value="500">前500个SKU</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                将检测 {batchSize === -1 ? selectedSkus.size : Math.min(batchSize, selectedSkus.size)} 个SKU，{selectedSitesForDetection.size} 个站点
              </AlertDescription>
            </Alert>

            <Button
              className="w-full"
              onClick={handleDetection}
              disabled={selectedSkus.size === 0 || selectedSitesForDetection.size === 0}
            >
              <Search className="mr-2 h-4 w-4" />
              开始检测产品状态
            </Button>
          </div>
        )}
        
        {/* 步骤2：检测中 */}
        {currentStep === 'detect' && (
          <SyncProgressBar
            value={detectionProgress}
            label="正在检测产品状态..."
            showCurrent
            current={Math.round(detectionProgress * (batchSize === -1 ? selectedSkus.size : Math.min(batchSize, selectedSkus.size)) / 100)}
            total={(batchSize === -1 ? selectedSkus.size : Math.min(batchSize, selectedSkus.size)) * selectedSitesForDetection.size}
          />
        )}
        
        {/* 步骤3：检测结果审核 */}
        {currentStep === 'review' && (
          <div className="space-y-4">
            {/* 导出按钮 */}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportDetectionResults}
              >
                <Download className="h-4 w-4 mr-2" />
                导出检测结果
              </Button>
            </div>

            <MultiSiteDetectionTable
              detectionResults={detectionResults}
              sites={sites}
              selectedSitesForSync={selectedSitesForSync}
              onSiteSelectionChange={(siteId, checked) => {
                const newSelection = new Set(selectedSitesForSync);
                if (checked) {
                  newSelection.add(siteId);
                } else {
                  newSelection.delete(siteId);
                }
                setSelectedSitesForSync(newSelection);
              }}
            />
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                重新检测
              </Button>
              <Button 
                className="flex-1"
                onClick={() => setCurrentStep('configure')}
                disabled={selectedSitesForSync.size === 0}
              >
                下一步：配置同步
              </Button>
            </div>
          </div>
        )}
        
        {/* 步骤4：配置同步 */}
        {currentStep === 'configure' && (
          <div className="space-y-4">
            {/* 使用共享的同步模式选择器 */}
            <SyncModeSelector
              value={syncConfig.mode}
              onChange={(mode) => updateSyncConfig({ mode })}
              selectedRule={selectedRule}
              onRuleChange={setSelectedRule}
              customQuantity={customQuantity}
              onQuantityChange={setCustomQuantity}
            />
            
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                将同步 {detectionResults.size} 个产品到 {selectedSitesForSync.size} 个站点
              </AlertDescription>
            </Alert>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep('review')}>
                上一步
              </Button>
              <Button className="flex-1" onClick={handleSync}>
                <RefreshCw className="mr-2 h-4 w-4" />
                开始同步
              </Button>
            </div>
          </div>
        )}
        
        {/* 步骤5：同步中 */}
        {currentStep === 'sync' && (
          <div className="space-y-4">
            <SyncProgressBar
              value={syncProgress}
              label="正在同步库存..."
              showPercentage
            />
            {syncResults.length > 0 && (
              <SyncResultSummary
                results={syncResults}
                title="实时同步结果"
                showDetails={false}
              />
            )}
          </div>
        )}
        
        {/* 步骤6：完成 */}
        {currentStep === 'complete' && (
          <div className="space-y-4">
            {/* 使用共享的结果汇总组件 */}
            <SyncResultSummary
              results={syncResults}
              title="同步完成"
              showDetails={true}
            />

            <Button className="w-full" onClick={handleReset}>
              <RefreshCw className="mr-2 h-4 w-4" />
              开始新的同步
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}