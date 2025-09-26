'use client';

import { PageLayout } from '@/components/layout/PageLayout';
import { ProductSyncControls } from '@/components/sync/ProductSyncControls';
import { MultiSiteSyncControls } from '@/components/sync/MultiSiteSyncControls';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { InventoryFilters } from '@/components/inventory/InventoryFilters';
import { useInventoryStore } from '@/store/inventory';
import { useWooCommerceStore } from '@/store/woocommerce';
import { useMultiSiteStore } from '@/store/multisite';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  calculateNetStock,
  filterInventoryData,
  filterWarehousesBeforeMerge,
  mergeWarehouseData,
  sortInventoryData
} from '@/lib/inventory-utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';

export default function SyncPage() {
  const [selectedSiteForSync, setSelectedSiteForSync] = useState<string | null>(null);

  // Multisite store
  const { sites, fetchSites } = useMultiSiteStore();

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
      showNeedSync,
      categoryFilter,
      categoryFilters,
      skuFilter: skuFilters,
      excludeSkuPrefixes,
      excludeWarehouses,
    },
    setFilters,
    sortConfig,
    isProductDetectionEnabled,
    setIsProductDetectionEnabled,
    productDetectionProgress,
    setProductDetectionProgress,
    isProductDetectionLoading: isProductLoading,
    setIsProductDetectionLoading: setIsProductLoading,
    updateInventoryItem,
  } = useInventoryStore();

  // WooCommerce store
  const {
    settings,
    getTransitQuantityBySku,
  } = useWooCommerceStore();

  // Fetch sites on mount
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Process inventory data
  const processedInventoryData = useMemo(() => {
    if (inventoryData.length === 0) return [];

    let processedData = [...inventoryData];

    // Merge warehouse data
    if (isMergedMode) {
      let dataToMerge = processedData;
      if (excludeWarehouses) {
        dataToMerge = filterWarehousesBeforeMerge(processedData, excludeWarehouses);
      }
      processedData = mergeWarehouseData(dataToMerge, getTransitQuantityBySku);
    } else {
      // Add transit quantities even without merging
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
  }, [inventoryData, isMergedMode, excludeWarehouses, getTransitQuantityBySku]);

  // Filter inventory data
  const filteredInventoryData = useMemo(() => {
    let filteredData = processedInventoryData;

    // Apply filters
    filteredData = filterInventoryData(
      filteredData,
      {
        skuFilters: skuFilters,
        categoryFilter,
        categoryFilters,
        excludeSkuPrefixes,
        hideZeroStock,
        hideNormalStatus,
        showNeedSync,
      }
    );

    // Apply sorting
    if (sortConfig) {
      filteredData = sortInventoryData(filteredData, sortConfig);
    }

    return filteredData;
  }, [
    processedInventoryData,
    skuFilters,
    categoryFilter,
    categoryFilters,
    excludeSkuPrefixes,
    hideZeroStock,
    hideNormalStatus,
    showNeedSync,
    sortConfig,
  ]);

  // Product Detection
  const handleProductDetection = async (skus: string[], siteId?: string) => {
    // If a siteId is provided, use the site's credentials
    let apiConfig = { ...settings };

    if (siteId && sites.length > 0) {
      const site = sites.find(s => s.id === siteId);
      if (site) {
        apiConfig = {
          consumerKey: site.api_key,
          consumerSecret: site.api_secret,
          siteUrl: site.url,
        };
      } else {
        toast.error('未找到选中的站点');
        return;
      }
    }

    // Check if we have API credentials
    if (!apiConfig.consumerKey || !apiConfig.consumerSecret || !apiConfig.siteUrl) {
      toast.error('请先配置WooCommerce API或选择站点');
      return;
    }

    setIsProductLoading(true);
    setProductDetectionProgress('开始检测产品上架状态...');

    // Adaptive concurrency control parameters
    let batchSize = 100;
    let batchDelay = 20;
    const maxBatchSize = 150;
    const minBatchSize = 10;
    const maxDelay = 1000;
    const minDelay = 20;
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
                siteUrl: apiConfig.siteUrl,
                consumerKey: apiConfig.consumerKey,
                consumerSecret: apiConfig.consumerSecret,
                skus: sku
              });

              const response = await fetch(`/api/wc-products?${params.toString()}`);

              if (response.ok) {
                const products = await response.json();
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

        // Process results
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

        // Batch delay
        if (i + batchSize < skus.length) {
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }

      // Update inventory data with product info
      setInventoryData((prevData) =>
        prevData.map(item => ({
          ...item,
          productData: productDataMap.get(item.产品代码) || item.productData,
        }))
      );

      const notFoundCount = processedCount - foundCount;
      setProductDetectionProgress(
        `检测完成！已找到 ${foundCount} 个产品，${notFoundCount} 个未找到`
      );

      if (failedSkus.length > 0) {
        console.warn('检测失败的SKU:', failedSkus);
        toast.warning(`${failedSkus.length} 个SKU检测失败，请查看控制台`);
      }

      toast.success(`产品检测完成！已找到 ${foundCount} 个产品`);
    } catch (error) {
      console.error('产品检测失败:', error);
      toast.error('产品检测失败，请查看控制台');
      setProductDetectionProgress('检测失败');
    } finally {
      setIsProductLoading(false);
      setTimeout(() => setProductDetectionProgress(''), 5000);
    }
  };

  // Sync SKU
  const handleSyncSku = async (sku: string, shouldBeInStock: boolean, siteId?: string) => {
    // If a siteId is provided, use the site's credentials
    let apiConfig = { ...settings };

    if (siteId && sites.length > 0) {
      const site = sites.find(s => s.id === siteId);
      if (site) {
        apiConfig = {
          consumerKey: site.api_key,
          consumerSecret: site.api_secret,
          siteUrl: site.url,
        };
      } else {
        toast.error('未找到选中的站点');
        return;
      }
    }

    // Check if we have API credentials
    if (!apiConfig.consumerKey || !apiConfig.consumerSecret || !apiConfig.siteUrl) {
      toast.error('请先配置WooCommerce API或选择站点');
      return;
    }

    const store = useInventoryStore.getState();
    const currentSyncingSkus = new Set(store.syncingSkus);
    currentSyncingSkus.add(sku);
    setSyncingSkus(currentSyncingSkus);

    try {
      const params = new URLSearchParams({
        siteUrl: apiConfig.siteUrl,
        consumerKey: apiConfig.consumerKey,
        consumerSecret: apiConfig.consumerSecret,
        sku: sku,
        stockStatus: shouldBeInStock ? 'instock' : 'outofstock',
        siteId: siteId || '', // 传递站点ID用于日志记录
      });

      const response = await fetch('/api/wc-update-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (response.ok) {
        const result = await response.json();

        // Update inventory data
        setInventoryData((prevData) =>
          prevData.map(item => {
            if (item.产品代码 === sku) {
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

        const siteName = siteId && sites.length > 0
          ? sites.find(s => s.id === siteId)?.name || siteId
          : '默认站点';
        toast.success(`${sku} 已同步到 ${siteName} 为${shouldBeInStock ? '有货' : '无货'}`);
      } else {
        const errorData = await response.json();
        toast.error(`同步失败: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('同步失败:', error);
      toast.error('同步失败，请查看控制台');
    } finally {
      const currentSyncingSkus = new Set(store.syncingSkus);
      currentSyncingSkus.delete(sku);
      setSyncingSkus(currentSyncingSkus);
    }
  };

  // Batch sync
  const handleBatchSync = async (shouldBeInStock: boolean, siteId?: string) => {
    if (selectedSkusForSync.size === 0) {
      toast.error('请先选择要同步的SKU');
      return;
    }

    const skusToSync = Array.from(selectedSkusForSync);
    const batchSize = 5;

    for (let i = 0; i < skusToSync.length; i += batchSize) {
      const batch = skusToSync.slice(i, i + batchSize);

      await Promise.all(
        batch.map(sku => handleSyncSku(sku, shouldBeInStock, siteId))
      );

      if (i + batchSize < skusToSync.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setSelectedSkusForSync(new Set());
    toast.success(`批量同步完成，共处理 ${skusToSync.length} 个SKU`);
  };

  // SKU selection
  const handleSkuSelectionChange = (sku: string, checked: boolean) => {
    const newSelection = new Set(selectedSkusForSync);
    if (checked) {
      newSelection.add(sku);
    } else {
      newSelection.delete(sku);
    }
    setSelectedSkusForSync(newSelection);
  };

  return (
    <PageLayout
      title="库存同步"
      description="检测产品上架状态，同步库存信息到WooCommerce"
    >
      <div className="space-y-6">
        {inventoryData.length === 0 && (
          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              请先在<a href="/inventory" className="underline">库存分析</a>页面上传库存数据
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <ProductSyncControls
            isEnabled={isProductDetectionEnabled}
            isLoading={isProductLoading}
            progress={productDetectionProgress}
            selectedSkusForSync={selectedSkusForSync}
            onToggle={setIsProductDetectionEnabled}
            onStartDetection={handleProductDetection}
            onBatchSync={handleBatchSync}
            filteredData={filteredInventoryData}
            sites={sites}
            selectedSiteId={selectedSiteForSync}
            onSiteChange={setSelectedSiteForSync}
          />

          <MultiSiteSyncControls
            filteredData={filteredInventoryData}
            selectedSkus={selectedSkusForSync}
            onSkuSelectionChange={handleSkuSelectionChange}
          />
        </div>

        {/* Simple filters for sync page */}
        <div className="rounded-lg border p-4 space-y-4">
          <h3 className="font-medium">快速筛选</h3>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hideZeroStock || false}
                onChange={(e) => setFilters({ hideZeroStock: e.target.checked })}
              />
              隐藏零库存
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hideNormalStatus || false}
                onChange={(e) => setFilters({ hideNormalStatus: e.target.checked })}
              />
              只显示异常状态
            </label>
            <label className="flex items-center gap-2 text-orange-600 font-medium">
              <input
                type="checkbox"
                checked={showNeedSync || false}
                onChange={(e) => setFilters({ showNeedSync: e.target.checked })}
                className="accent-orange-600"
              />
              🔄 建议同步
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isMergedMode || false}
                onChange={(e) => setFilters({ isMergedMode: e.target.checked })}
              />
              合并仓库显示
            </label>
          </div>
        </div>

        <InventoryTable
          data={filteredInventoryData}
          selectedSkusForSync={selectedSkusForSync}
          syncingSkus={syncingSkus}
          onSkuSelectionChange={handleSkuSelectionChange}
          onSyncSku={handleSyncSku}
          isProductDetectionEnabled={isProductDetectionEnabled}
          isSalesDetectionEnabled={false}
          selectedSiteId={selectedSiteForSync}
          selectedSiteName={selectedSiteForSync ? sites.find(s => s.id === selectedSiteForSync)?.name : undefined}
        />
      </div>
    </PageLayout>
  );
}