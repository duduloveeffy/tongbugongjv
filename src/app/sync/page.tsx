'use client';

import { PageLayout } from '@/components/layout/PageLayout';
import { ProductSyncControls } from '@/components/sync/ProductSyncControls';
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
    clearInventoryData,
    selectedSiteForSync,
    setSelectedSiteForSync,
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

  // 默认启用产品检测功能
  useEffect(() => {
    if (!isProductDetectionEnabled && inventoryData.length > 0) {
      setIsProductDetectionEnabled(true);
    }
  }, [inventoryData.length, isProductDetectionEnabled, setIsProductDetectionEnabled]);

  // 智能站点选择：确保选择的站点有效，否则选择第一个可用站点
  useEffect(() => {
    if (sites.length > 0) {
      if (!selectedSiteForSync) {
        // 如果没有选择站点，自动选择第一个
        setSelectedSiteForSync(sites[0].id);
      } else if (!sites.find(s => s.id === selectedSiteForSync)) {
        // 如果选择的站点不存在（可能被删除），选择第一个可用站点
        setSelectedSiteForSync(sites[0].id);
      }
    }
  }, [sites, selectedSiteForSync, setSelectedSiteForSync]);

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

    // 【新增】1. 加载SKU映射表
    let mappingIndex: any = null;
    try {
      setProductDetectionProgress('正在加载SKU映射表...');
      const { buildMappingIndex, getWooCommerceSkus } = await import('@/lib/h3yun/mapping-service');

      const mappingResponse = await fetch('/api/h3yun/sku-mappings');
      if (mappingResponse.ok) {
        const mappingData = await mappingResponse.json();
        if (mappingData.success && mappingData.mappings.length > 0) {
          mappingIndex = buildMappingIndex(mappingData.mappings);
          console.log(`[产品检测] SKU映射加载成功: ${mappingData.count}条`);
        } else {
          console.log('[产品检测] 映射表为空，使用原始SKU模式');
        }
      }
    } catch (error) {
      console.warn('[产品检测] SKU映射加载失败，将使用原始SKU', error);
    }

    // 【新增】2. 扩展SKU列表（应用映射）
    const skuDetectionMap = new Map<string, string>(); // WooCommerce SKU → 氚云SKU
    let detectionSkus: string[] = [];

    if (mappingIndex) {
      const { getWooCommerceSkus } = await import('@/lib/h3yun/mapping-service');

      for (const h3yunSku of skus) {
        const wooSkus = getWooCommerceSkus(h3yunSku, mappingIndex);
        if (wooSkus.length > 0) {
          // 有映射：使用WooCommerce SKU检测
          for (const wooSku of wooSkus) {
            detectionSkus.push(wooSku);
            skuDetectionMap.set(wooSku, h3yunSku);
          }
          console.log(`[映射] ${h3yunSku} → [${wooSkus.join(', ')}]`);
        } else {
          // 无映射：使用原始氚云SKU
          detectionSkus.push(h3yunSku);
          skuDetectionMap.set(h3yunSku, h3yunSku);
        }
      }
      console.log(`[产品检测] 原始SKU: ${skus.length}, 映射扩展后: ${detectionSkus.length}`);
    } else {
      // 无映射表：直接使用原始SKU
      detectionSkus = [...skus];
      skus.forEach(sku => skuDetectionMap.set(sku, sku));
    }

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

      // 【修改】使用扩展后的SKU列表进行检测
      for (let i = 0; i < detectionSkus.length; i += batchSize) {
        const batch = detectionSkus.slice(i, i + batchSize);
        setProductDetectionProgress(`检测进度: ${i + 1}-${Math.min(i + batchSize, detectionSkus.length)}/${detectionSkus.length} (批次大小: ${batchSize}, 延迟: ${batchDelay}ms)`);

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

        // 【修改】Process results - 将结果关联到原始氚云SKU（支持一对多映射）
        batchResults.forEach(result => {
          if (result.success && result.products.length > 0) {
            const product = result.products[0];
            const originalH3yunSku = skuDetectionMap.get(result.sku) || result.sku;
            const isMapped = result.sku !== originalH3yunSku;

            // 获取或创建该氚云SKU的产品数据
            const existingData = productDataMap.get(originalH3yunSku);

            const newResult = {
              woocommerceSku: result.sku,
              isOnline: product.status === 'publish',
              status: product.status,
              stockStatus: product.stock_status,
              productUrl: product.permalink,
            };

            if (isMapped) {
              // 使用了映射：需要支持一对多
              if (existingData?.allMappedResults) {
                // 已有其他映射结果，追加到数组
                existingData.allMappedResults.push(newResult);
                // 更新主状态：如果任一映射SKU在线，则标记为在线
                if (newResult.isOnline) {
                  existingData.isOnline = true;
                  existingData.status = newResult.status;
                  existingData.stockStatus = newResult.stockStatus;
                  existingData.productUrl = newResult.productUrl;
                }
              } else {
                // 第一次检测到映射结果
                productDataMap.set(originalH3yunSku, {
                  isOnline: newResult.isOnline,
                  status: newResult.status,
                  stockStatus: newResult.stockStatus,
                  productUrl: newResult.productUrl,
                  woocommerceSku: result.sku,
                  isMapped: true,
                  allMappedResults: [newResult],
                });
              }
            } else {
              // 未使用映射：直接存储（一对一）
              productDataMap.set(originalH3yunSku, {
                isOnline: newResult.isOnline,
                status: newResult.status,
                stockStatus: newResult.stockStatus,
                productUrl: newResult.productUrl,
                woocommerceSku: result.sku,
                isMapped: false,
              });
            }
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

    // 【新增】检查是否有映射的WooCommerce SKU（支持一对多）
    const inventoryItem = inventoryData.find(item => item.产品代码 === sku);
    const allMappedResults = inventoryItem?.productData?.allMappedResults;

    // 确定需要同步的所有WooCommerce SKU
    let targetSkus: string[] = [];
    if (allMappedResults && allMappedResults.length > 0) {
      // 有一对多映射：同步所有映射的WooCommerce SKU
      targetSkus = allMappedResults.map(r => r.woocommerceSku);
      console.log(`[同步] 一对多映射: ${sku} → [${targetSkus.join(', ')}]`);
    } else if (inventoryItem?.productData?.woocommerceSku) {
      // 有一对一映射
      targetSkus = [inventoryItem.productData.woocommerceSku];
      console.log(`[同步] 使用映射SKU: ${sku} → ${targetSkus[0]}`);
    } else {
      // 无映射：直接使用氚云SKU
      targetSkus = [sku];
    }

    try {
      let successCount = 0;
      let failedCount = 0;

      // 同步所有映射的SKU
      for (const targetSku of targetSkus) {
        try {
          const params = new URLSearchParams({
            siteUrl: apiConfig.siteUrl,
            consumerKey: apiConfig.consumerKey,
            consumerSecret: apiConfig.consumerSecret,
            sku: targetSku,
            stockStatus: shouldBeInStock ? 'instock' : 'outofstock',
            siteId: siteId || '',
          });

          const response = await fetch('/api/wc-update-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
          });

          if (response.ok) {
            successCount++;
            console.log(`[同步成功] ${targetSku}`);
          } else {
            const errorData = await response.json();
            console.error(`[同步失败] ${targetSku}:`, errorData.error);
            failedCount++;
          }
        } catch (error) {
          console.error(`[同步失败] ${targetSku}:`, error);
          failedCount++;
        }

        // 如果有多个SKU，添加延迟避免请求过快
        if (targetSkus.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Update inventory data
      setInventoryData((prevData) =>
        prevData.map(item => {
          if (item.产品代码 === sku && item.productData) {
            // 如果有一对多映射，更新所有映射结果的状态
            if (item.productData.allMappedResults) {
              const updatedResults = item.productData.allMappedResults.map(r => ({
                ...r,
                stockStatus: shouldBeInStock ? 'instock' : 'outofstock',
              }));
              return {
                ...item,
                productData: {
                  ...item.productData,
                  stockStatus: shouldBeInStock ? 'instock' : 'outofstock',
                  allMappedResults: updatedResults,
                }
              };
            } else {
              return {
                ...item,
                productData: {
                  ...item.productData,
                  stockStatus: shouldBeInStock ? 'instock' : 'outofstock',
                }
              };
            }
          }
          return item;
        })
      );

      const siteName = siteId && sites.length > 0
        ? sites.find(s => s.id === siteId)?.name || siteId
        : '默认站点';

      if (targetSkus.length > 1) {
        toast.success(`${sku} 已同步 ${successCount}/${targetSkus.length} 个映射SKU到 ${siteName}`);
      } else {
        toast.success(`${sku} 已同步到 ${siteName} 为${shouldBeInStock ? '有货' : '无货'}`);
      }

      if (failedCount > 0) {
        toast.warning(`${failedCount} 个映射SKU同步失败，请查看控制台`);
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

  // Clear data handler
  const handleClearData = useCallback(() => {
    if (confirm('确定要清空所有库存数据吗？此操作无法撤销。')) {
      clearInventoryData();
      setSelectedSkusForSync(new Set());
      toast.success('数据已清空');
    }
  }, [clearInventoryData, setSelectedSkusForSync]);

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

        {/* 单站点库存同步 */}
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

        {/* Data filters */}
        <InventoryFilters
          skuFilters={skuFilters}
          categoryFilter={categoryFilter}
          categoryFilters={categoryFilters}
          inventoryData={processedInventoryData}
          excludeSkuPrefixes={excludeSkuPrefixes}
          excludeWarehouses={excludeWarehouses}
          isMergedMode={isMergedMode}
          hideZeroStock={hideZeroStock}
          hideNormalStatus={hideNormalStatus}
          showNeedSync={showNeedSync}
          onSkuFiltersChange={(value) => setFilters({ skuFilter: value })}
          onCategoryFilterChange={(value) => setFilters({ categoryFilter: value })}
          onCategoryFiltersChange={(value) => setFilters({ categoryFilters: value })}
          onExcludeSkuPrefixesChange={(value) => setFilters({ excludeSkuPrefixes: value })}
          onExcludeWarehousesChange={(value) => setFilters({ excludeWarehouses: value })}
          onMergedModeChange={(value) => setFilters({ isMergedMode: value })}
          onHideZeroStockChange={(value) => setFilters({ hideZeroStock: value })}
          onHideNormalStatusChange={(value) => setFilters({ hideNormalStatus: value })}
          onShowNeedSyncChange={(value) => setFilters({ showNeedSync: value })}
          onClearData={handleClearData}
          filteredData={filteredInventoryData}
          isLoading={isProductLoading}
          isSalesDetectionEnabled={false}
        />

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