"use client";

import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInventoryStore } from '@/store/inventory';
import { useWooCommerceStore } from '@/store/woocommerce';
import { Layers, Settings, TrendingUp, Globe, Webhook, Save } from 'lucide-react';
import { useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';

import { InventoryFilters } from '@/components/inventory/InventoryFilters';
import { InventoryTable } from '@/components/inventory/InventoryTable';
// Components
import { InventoryUpload } from '@/components/inventory/InventoryUpload';
import { TransitFilesList } from '@/components/inventory/TransitFilesList';
import { ProductSyncControls } from '@/components/sync/ProductSyncControls';
import { WebhookManager } from '@/components/webhook/WebhookManager';
import { Button } from '@/components/ui/button';

// Utils
import { 
  calculateNetStock,
  filterInventoryData, 
  mergeWarehouseData,
  sortInventoryData 
} from '@/lib/inventory-utils';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function InventoryAnalysis() {
  // Local state (only for temporary UI state)
  const [isLoading, setIsLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [salesOrderStatuses, setSalesOrderStatuses] = useState<string[]>(['completed', 'processing', 'pending']);
  const [salesDateRange, setSalesDateRange] = useState<{start: string, end: string}>({
    start: '',
    end: ''
  });
  const [activeTab, setActiveTab] = useState('inventory');

  // Inventory store state
  const {
    inventoryData,
    setInventoryData,
    selectedSkusForSync,
    setSelectedSkusForSync,
    syncingSkus,
    setSyncingSkus,
    filters: {
      isMergedMode,
      hideZeroStock,
      hideNormalStatus,
      categoryFilter,
      categoryFilters,
      skuFilter: skuFilters,
      excludeSkuPrefixes,
    },
    setFilters,
    sortConfig,
    isProductDetectionEnabled,
    setIsProductDetectionEnabled,
    isSalesDetectionEnabled,
    setIsSalesDetectionEnabled,
    productDetectionProgress,
    setProductDetectionProgress,
    salesDetectionProgress,
    setSalesDetectionProgress,
    isProductDetectionLoading: isProductLoading,
    setIsProductDetectionLoading: setIsProductLoading,
    isSalesDetectionLoading: isSalesLoading,
    setIsSalesDetectionLoading: setIsSalesLoading,
    updateInventoryItem,
  } = useInventoryStore();

  // WooCommerce store
  const {
    settings,
    setSettings,
    transitOrders,
    transitFiles,
    setTransitOrders,
    addTransitOrders,
    addTransitFile,
    removeTransitFile,
    getTransitQuantityBySku,
    clearTransitOrders,
    fetchSalesAnalysis,
  } = useWooCommerceStore();


  // 使用useMemo优化数据处理性能
  const processedInventoryData = useMemo(() => {
    if (inventoryData.length === 0) return [];

    let processedData = [...inventoryData];

    // 合并仓库数据
    if (isMergedMode) {
      processedData = mergeWarehouseData(processedData, getTransitQuantityBySku);
    } else {
      // 即使不合并，也要添加在途数量
      processedData = processedData.map(item => {
        const 在途数量 = getTransitQuantityBySku(item.产品代码);
        const 净可售库存 = calculateNetStock(item);
        return {
          ...item,
          在途数量: 在途数量,
          在途库存: 净可售库存 + 在途数量,
        };
      });
    }

    return processedData;
  }, [inventoryData, isMergedMode, getTransitQuantityBySku]);

  // 使用useMemo优化筛选性能
  const filteredInventoryData = useMemo(() => {
    const filtered = filterInventoryData(processedInventoryData, {
      skuFilters,
      warehouseFilter: '', // 仓库筛选现在通过合并模式处理
      categoryFilter,
      categoryFilters,
      hideZeroStock,
      hideNormalStatus,
      excludeSkuPrefixes,
    });
    // 应用排序
    return sortInventoryData(filtered, sortConfig);
  }, [processedInventoryData, skuFilters, categoryFilter, categoryFilters, hideZeroStock, hideNormalStatus, excludeSkuPrefixes, sortConfig]);

  const handleClearData = () => {
    setInventoryData([]);
    setHeaders([]);
    clearTransitOrders();
    setFilters({
      skuFilter: '',
      categoryFilter: '全部',
      categoryFilters: [],
      hideZeroStock: false,
      hideNormalStatus: false,
      excludeSkuPrefixes: '',
    });
    setSelectedSkusForSync(new Set());
    toast.success('数据已清空');
  };

  const handleSkuSelectionChange = useCallback((sku: string, checked: boolean) => {
    const newSelection = new Set(selectedSkusForSync);
    if (checked) {
      newSelection.add(sku);
    } else {
      newSelection.delete(sku);
    }
    setSelectedSkusForSync(newSelection);
  }, [selectedSkusForSync]);

  // 优化后的销量检测函数 - 支持多数据源
  const handleSalesDetection = useCallback(async (skus: string[], config?: any) => {
    if (skus.length === 0) {
      toast.error('没有要检测的SKU');
      return;
    }

    // 如果没有提供config，使用默认配置（Supabase）
    if (!config) {
      config = {
        dataSource: 'supabase',
        siteIds: [], // 空数组表示查询所有站点
        statuses: salesOrderStatuses,
        dateStart: salesDateRange.start || undefined,
        dateEnd: salesDateRange.end || undefined,
        daysBack: 30,
      };
    }

    // 检查配置
    if (config.dataSource === 'woocommerce') {
      // WooCommerce模式：需要站点选择或API凭证
      if (!config.siteId && (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl)) {
        toast.error('请先配置WooCommerce API或选择站点');
        return;
      }
    } else if (config.dataSource === 'supabase') {
      // Supabase模式：如果没有指定站点，会查询所有站点
      // 空数组表示查询所有站点，这是允许的
      if (config.siteIds === undefined) {
        config.siteIds = []; // 设置为空数组，表示查询所有站点
      }
    }

    setIsSalesLoading(true);
    setSalesDetectionProgress('正在检测销量...');

    try {
      // 调用改进后的销量检测API
      const salesData = await fetchSalesAnalysis({
        skus,
        dataSource: config.dataSource,
        siteIds: config.siteIds,
        siteId: config.siteId,
        statuses: config.statuses || salesOrderStatuses,
        startDate: config.dateStart || salesDateRange.start,
        endDate: config.dateEnd || salesDateRange.end,
        daysBack: config.daysBack || 30,
        onProgress: (progress) => {
          setSalesDetectionProgress(progress.message);
        }
      });

      // 更新库存数据中的销量信息
      setInventoryData((prevData) => 
        prevData.map(item => {
          if (skus.includes(item.产品代码)) {
            const itemSalesData = salesData[item.产品代码];
            if (itemSalesData) {
              return {
                ...item,
                salesData: itemSalesData
              };
            }
          }
          return item;
        })
      );
      
      setSalesDetectionProgress(`检测完成！处理了 ${skus.length} 个SKU`);
      toast.success(`销量检测完成！处理了 ${skus.length} 个SKU`);
      
    } catch (error: any) {
      console.error('销量检测失败:', error);
      const errorMessage = error.message || '销量检测失败，请检查配置';
      toast.error(errorMessage);
      setSalesDetectionProgress('检测失败');
    } finally {
      setIsSalesLoading(false);
      setTimeout(() => setSalesDetectionProgress(''), 5000);
    }
  }, [settings, salesOrderStatuses, salesDateRange, fetchSalesAnalysis]);

  // Product Detection Functions
  const handleProductDetection = async (skus: string[]) => {
    if (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl) {
      toast.error('请先配置WooCommerce API');
      return;
    }

    setIsProductLoading(true);
    setProductDetectionProgress('开始检测产品上架状态...');

    // Adaptive concurrency control parameters
    let batchSize = 30;
    let batchDelay = 100;
    const maxBatchSize = 50;
    const minBatchSize = 5;
    const maxDelay = 1000;
    const minDelay = 50;
    const retryCount = 3;

    let consecutiveSuccesses = 0;
    let consecutiveErrors = 0;
    const failedSkus: string[] = [];

    try {
      let processedCount = 0;
      let foundCount = 0;
      const productDataMap = new Map<string, any>();

      for (let i = 0; i < skus.length; i += batchSize) {
        const batch = skus.slice(i, i + batchSize);
        setProductDetectionProgress(`检测进度: ${i + 1}-${Math.min(i + batchSize, skus.length)}/${skus.length} (批次大小: ${batchSize}, 延迟: ${batchDelay}ms)`);

        const batchPromises = batch.map(async (sku) => {
          for (let retry = 0; retry < retryCount; retry++) {
            try {
              const params = new URLSearchParams({
                siteUrl: settings.siteUrl,
                consumerKey: settings.consumerKey,
                consumerSecret: settings.consumerSecret,
                skus: sku
              });

              const response = await fetch(`/api/wc-products?${params.toString()}`);
              
              if (response.ok) {
                const products = await response.json();
                // console.log(`API响应 - SKU: ${sku}, 产品数量: ${products.length}`, products);
                return { sku, products, success: true };
              } else if (response.status === 429) {
                // Rate limit - increase delay
                batchDelay = Math.min(maxDelay, batchDelay * 1.5);
                batchSize = Math.max(minBatchSize, batchSize - 1);
                await new Promise(resolve => setTimeout(resolve, batchDelay * (retry + 1)));
              } else {
                if (retry === retryCount - 1) {
                  return { sku, products: [], success: false, error: `HTTP ${response.status}` };
                }
                await new Promise(resolve => setTimeout(resolve, batchDelay * (retry + 1)));
              }
            } catch (error) {
              if (retry === retryCount - 1) {
                return { sku, products: [], success: false, error: error instanceof Error ? error.message : '网络错误' };
              }
              await new Promise(resolve => setTimeout(resolve, batchDelay * (retry + 1)));
            }
          }
          return { sku, products: [], success: false, error: '重试次数耗尽' };
        });

        const batchResults = await Promise.all(batchPromises);
        let errorCount = 0;

        // Process results - 收集到Map中
        batchResults.forEach(result => {
          if (result.success && result.products.length > 0) {
            const product = result.products[0];
            productDataMap.set(result.sku, {
              isOnline: product.status === 'publish',
              status: product.status,
              stockStatus: product.stock_status,
              productUrl: product.permalink,
            });
            foundCount++;
          } else {
            errorCount++;
            if (!result.success) {
              failedSkus.push(result.sku);
            }
          }
          processedCount++;
        });

        // Adaptive parameter adjustment
        if (errorCount === 0) {
          consecutiveSuccesses++;
          consecutiveErrors = 0;
          if (consecutiveSuccesses >= 2) {
            batchSize = Math.min(maxBatchSize, batchSize + 2);
            batchDelay = Math.max(minDelay, batchDelay * 0.9);
            consecutiveSuccesses = 0;
          }
        } else if (errorCount > batchResults.length * 0.3) {
          consecutiveErrors++;
          consecutiveSuccesses = 0;
          if (consecutiveErrors >= 2) {
            batchSize = Math.max(minBatchSize, batchSize - 2);
            batchDelay = Math.min(maxDelay, batchDelay * 1.2);
            consecutiveErrors = 0;
          }
        }

        // Dynamic delay between batches
        if (i + batchSize < skus.length) {
          const adaptiveDelay = Math.max(minDelay, batchDelay * (1 + errorCount / batchResults.length));
          await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
        }
      }

      // 使用函数式更新，基于最新状态
      setInventoryData((prevData) => 
        prevData.map(item => {
          const productData = productDataMap.get(item.产品代码);
          if (productData) {
            return {
              ...item,
              productData
            };
          }
          return item;
        })
      );
      
      const successRate = ((processedCount - failedSkus.length) / processedCount * 100).toFixed(1);
      let resultMessage = `成功检测 ${processedCount} 个SKU，找到 ${foundCount} 个产品 (成功率: ${successRate}%)`;
      
      if (failedSkus.length > 0) {
        resultMessage += `，失败 ${failedSkus.length} 个SKU`;
        console.warn("检测失败的SKU列表:", failedSkus);
        console.warn(`失败率: ${(failedSkus.length / skus.length * 100).toFixed(1)}%`);
      }

      setProductDetectionProgress(resultMessage);
      toast.success('产品检测完成');
    } catch (error) {
      console.error('产品检测失败:', error);
      toast.error('产品检测失败，请检查配置');
    } finally {
      setIsProductLoading(false);
      setTimeout(() => setProductDetectionProgress(''), 5000);
    }
  };

  const handleSyncSku = async (sku: string, shouldBeInStock: boolean) => {
    if (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl) {
      toast.error('请先配置WooCommerce API');
      return;
    }

    // 使用 store 的 get 方法获取最新状态
    const store = useInventoryStore.getState();
    const currentSyncingSkus = new Set(store.syncingSkus);
    currentSyncingSkus.add(sku);
    setSyncingSkus(currentSyncingSkus);
    console.log('开始同步:', sku, '当前同步中的SKU:', Array.from(currentSyncingSkus));

    try {
      const params = new URLSearchParams({
        siteUrl: settings.siteUrl,
        consumerKey: settings.consumerKey,
        consumerSecret: settings.consumerSecret,
        sku: sku,
        stockStatus: shouldBeInStock ? 'instock' : 'outofstock',
      });

      const response = await fetch('/api/wc-update-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (response.ok) {
        const result = await response.json();
        
        // 使用函数式更新，基于最新状态
        setInventoryData((prevData) => 
          prevData.map(item => {
            if (item.产品代码 === sku && item.productData) {
              return {
                ...item,
                productData: {
                  ...item.productData,
                  stockStatus: shouldBeInStock ? 'instock' : 'outofstock',
                }
              };
            }
            return item;
          })
        );
        
        toast.success(`${sku} 同步成功：${shouldBeInStock ? '有货' : '无货'}`);
      } else {
        const error = await response.json();
        toast.error(`${sku} 同步失败：${error.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('同步失败:', error);
      toast.error(`${sku} 同步失败：网络错误`);
    } finally {
      // 使用 store 的 get 方法获取最新状态
      const store = useInventoryStore.getState();
      const currentSyncingSkus = new Set(store.syncingSkus);
      currentSyncingSkus.delete(sku);
      setSyncingSkus(currentSyncingSkus);
      console.log('同步完成:', sku, '剩余同步中的SKU:', Array.from(currentSyncingSkus));
    }
  };

  const handleBatchSync = async (shouldBeInStock: boolean) => {
    if (selectedSkusForSync.size === 0) {
      toast.error('请先选择要同步的SKU');
      return;
    }

    const skusToSync = Array.from(selectedSkusForSync);
    const batchSize = 5; // 批量同步时使用较小的批次大小

    for (let i = 0; i < skusToSync.length; i += batchSize) {
      const batch = skusToSync.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(sku => handleSyncSku(sku, shouldBeInStock))
      );

      // 批次间延迟
      if (i + batchSize < skusToSync.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setSelectedSkusForSync(new Set());
  };

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">ERP库存分析系统</h1>
          <p className="text-muted-foreground">
            库存分析、销量检测与WooCommerce库存同步
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/sites">
            <Button variant="outline">
              <Globe className="h-4 w-4 mr-2" />
              站点管理
            </Button>
          </Link>
          <Link href="/sales-detection">
            <Button variant="outline">
              <TrendingUp className="h-4 w-4 mr-2" />
              检测设置
            </Button>
          </Link>
        </div>
      </div>

      <Separator />

      {/* 数据状态提示 */}
      {inventoryData.length > 0 && (
        <Alert className="mb-4">
          <Save className="h-4 w-4" />
          <AlertDescription>
            当前已加载 {inventoryData.length} 条库存数据。数据已自动保存，刷新页面后会自动恢复。
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="inventory" className="space-y-6" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            库存分析
          </TabsTrigger>
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            库存同步
          </TabsTrigger>
          <TabsTrigger value="webhook" className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            实时同步
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-6">
          <InventoryUpload
            onInventoryDataLoad={(data, headers) => {
              setInventoryData(data);
              setHeaders(headers);
            }}
            onTransitDataLoad={setTransitOrders}
            onTransitDataAdd={addTransitOrders}
            onTransitFileAdd={addTransitFile}
            transitOrderCount={transitOrders.length}
            isLoading={isLoading}
          />

          <TransitFilesList 
            files={transitFiles}
            onRemoveFile={removeTransitFile}
          />

          <InventoryFilters
            skuFilters={skuFilters}
            warehouseFilter={''}
            categoryFilter={categoryFilter}
            categoryFilters={categoryFilters}
            inventoryData={processedInventoryData}
            excludeSkuPrefixes={excludeSkuPrefixes}
            isMergedMode={isMergedMode}
            hideZeroStock={hideZeroStock}
            hideNormalStatus={hideNormalStatus}
            onSkuFiltersChange={(value) => setFilters({ skuFilter: value })}
            onWarehouseFilterChange={() => {}} // 不再使用
            onCategoryFilterChange={(value) => setFilters({ categoryFilter: value })}
            onCategoryFiltersChange={(value) => setFilters({ categoryFilters: value })}
            onExcludeSkuPrefixesChange={(value) => setFilters({ excludeSkuPrefixes: value })}
            onMergedModeChange={(value) => setFilters({ isMergedMode: value })}
            onHideZeroStockChange={(value) => setFilters({ hideZeroStock: value })}
            onHideNormalStatusChange={(value) => setFilters({ hideNormalStatus: value })}
            onClearData={handleClearData}
            filteredData={filteredInventoryData}
            isLoading={isLoading}
            isSalesDetectionEnabled={isSalesDetectionEnabled}
            isSalesLoading={isSalesLoading}
            salesProgress={salesDetectionProgress}
            onStartSalesDetection={() => {
              const skus = filteredInventoryData.map(item => item.产品代码);
              // 默认使用Supabase数据源，更快速
              const defaultConfig = {
                dataSource: 'supabase' as const,
                siteIds: [], // 空数组表示所有站点
                statuses: salesOrderStatuses,
                dateStart: salesDateRange.start || undefined,
                dateEnd: salesDateRange.end || undefined,
                daysBack: 30,
              };
              handleSalesDetection(skus, defaultConfig);
            }}
          />

          <InventoryTable
            data={filteredInventoryData}
            selectedSkusForSync={selectedSkusForSync}
            syncingSkus={syncingSkus}
            onSkuSelectionChange={handleSkuSelectionChange}
            onSyncSku={handleSyncSku}
            isProductDetectionEnabled={isProductDetectionEnabled}
            isSalesDetectionEnabled={isSalesDetectionEnabled}
          />
        </TabsContent>

        <TabsContent value="sync" className="space-y-6">
          <ProductSyncControls
            isEnabled={isProductDetectionEnabled}
            isLoading={isProductLoading}
            progress={productDetectionProgress}
            selectedSkusForSync={selectedSkusForSync}
            onToggle={setIsProductDetectionEnabled}
            onStartDetection={handleProductDetection}
            onBatchSync={handleBatchSync}
            filteredData={filteredInventoryData}
          />

          <InventoryTable
            data={filteredInventoryData}
            selectedSkusForSync={selectedSkusForSync}
            syncingSkus={syncingSkus}
            onSkuSelectionChange={handleSkuSelectionChange}
            onSyncSku={handleSyncSku}
            isProductDetectionEnabled={isProductDetectionEnabled}
            isSalesDetectionEnabled={isSalesDetectionEnabled}
          />
        </TabsContent>

        <TabsContent value="webhook" className="space-y-6">
          <WebhookManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}