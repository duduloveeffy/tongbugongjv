'use client';

import { PageLayout } from '@/components/layout/PageLayout';
import { InventoryFilters } from '@/components/inventory/InventoryFilters';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { InventoryUpload } from '@/components/inventory/InventoryUpload';
import { TransitFilesList } from '@/components/inventory/TransitFilesList';
import { SalesDetectionDialog, type SalesDetectionConfig } from '@/components/inventory/SalesDetectionDialog';
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
import { exportToExcel } from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function InventoryPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [salesOrderStatuses, setSalesOrderStatuses] = useState<string[]>(['completed', 'processing']);
  const [salesDateRange, setSalesDateRange] = useState<{start: string, end: string}>({
    start: '',
    end: ''
  });
  const [showSalesDetectionDialog, setShowSalesDetectionDialog] = useState(false);

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
      categoryFilter,
      categoryFilters,
      skuFilter: skuFilters,
      excludeSkuPrefixes,
      excludeWarehouses,
    },
    setFilters,
    sortConfig,
    isSalesDetectionEnabled,
    setIsSalesDetectionEnabled,
    salesDetectionProgress,
    setSalesDetectionProgress,
    isSalesDetectionLoading: isSalesLoading,
    setIsSalesDetectionLoading: setIsSalesLoading,
    updateInventoryItem,
    setSalesData,
    salesDaysBack,
    setSalesDaysBack,
    salesDetectionDays,
    setSalesDetectionDays,
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
        const excelTransit = getTransitQuantityBySku(item.产品代码);
        const apiTransit = item.在途数量 || Number(item.采购在途) || 0;
        // 优先使用 API 的采购在途，如果为0则使用 Excel 上传的在途数量
        const 在途数量 = apiTransit > 0 ? apiTransit : excelTransit;
        const 净可售库存 = calculateNetStock(item);
        return {
          ...item,
          净可售库存: 净可售库存,
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
    sortConfig,
  ]);

  // Sales detection with site selection
  const handleSalesDetection = useCallback(async (config: SalesDetectionConfig) => {
    const skus = filteredInventoryData.map(item => item.产品代码);

    if (skus.length === 0) {
      toast.error('没有要检测的SKU');
      return;
    }

    setShowSalesDetectionDialog(false);

    // 判断是否是从弹窗调用（使用显式标志，避免天数比较误判）
    const isFromDialog = config.isFromDialog === true;

    // 如果是从弹窗调用，保存弹窗配置天数（用于 orderCount/salesQuantity 列）
    if (isFromDialog) {
      setSalesDetectionDays(config.salesDetectionDays);
      // 重置 N 天列为默认 30 天
      setSalesDaysBack(30);
    }

    setIsSalesLoading(true);
    setSalesDetectionProgress('正在检测销量...');

    try {
      // 确定动态天数（N天列）的值
      // - 弹窗调用：使用默认 30 天
      // - 表头修改调用：使用传入的新值
      const effectiveDaysBack = isFromDialog ? 30 : config.daysBack;

      const result = await fetchSalesAnalysis({
        skus,
        ...config,
        daysBack: effectiveDaysBack,
      });

      if (result.success && result.data) {
        // Debug: Log the data structure and SKU comparison
        console.log('[Sales Detection] Total sales data items:', result.data.length);
        console.log('[Sales Detection] Sample sales data:', result.data.slice(0, 3));
        console.log('[Sales Detection] Sample inventory SKUs:', inventoryData.slice(0, 3).map(i => i.产品代码));

        // Create a map for faster lookup and case-insensitive matching
        const salesMap = new Map();
        result.data.forEach((item: any) => {
          // Store with both original and uppercase keys for flexible matching
          salesMap.set(item.sku, item);
          salesMap.set(item.sku.toUpperCase(), item);
          salesMap.set(item.sku.trim(), item);
        });

        console.log('[Sales Detection] Sales map size:', salesMap.size);

        // Update inventory items with sales data
        let matchedCount = 0;
        let unmatchedSkus: string[] = [];

        const updatedData = inventoryData.map(item => {
          // Try multiple matching strategies
          const sku = item.产品代码;
          const salesInfo = salesMap.get(sku) ||
                           salesMap.get(sku.toUpperCase()) ||
                           salesMap.get(sku.trim());

          if (salesInfo) {
            matchedCount++;
            console.log(`[Sales Detection] ✓ Matched ${sku} with sales:`, {
              orderCountDaysN: salesInfo.orderCountDaysN,
              salesQuantityDaysN: salesInfo.salesQuantityDaysN
            });
            return {
              ...item,
              salesData: {
                orderCount: salesInfo.orderCount || 0,
                salesQuantity: salesInfo.salesQuantity || 0,
                orderCountDaysN: salesInfo.orderCountDaysN || 0,
                salesQuantityDaysN: salesInfo.salesQuantityDaysN || 0,
              }
            };
          } else {
            unmatchedSkus.push(sku);
          }
          return item;
        });

        console.log(`[Sales Detection] Matching summary: ${matchedCount}/${inventoryData.length} items matched`);
        if (unmatchedSkus.length > 0) {
          console.log('[Sales Detection] Unmatched SKUs (first 10):', unmatchedSkus.slice(0, 10));
        }

        // Update the inventory data with sales information
        setInventoryData(updatedData);

        // Calculate summary statistics - use salesQuantityDaysN instead of sales30Days
        const totalSales = result.data.reduce((sum: number, item: any) =>
          sum + (item.salesQuantityDaysN || 0), 0) || 0;
        const detectedCount = result.data.filter((item: any) =>
          item.salesQuantityDaysN > 0).length || 0;

        if (detectedCount === 0 && result.data.length > 0) {
          toast.warning(
            `检测完成但没有找到销量数据。请检查：\n1. 是否已同步订单数据到 Supabase\n2. SKU 格式是否匹配`,
            { duration: 5000 }
          );
        } else {
          toast.success(`销量检测完成！${detectedCount} 个SKU有销量，总销量: ${totalSales}`);
        }
        setSalesDetectionProgress(`检测完成！处理了 ${skus.length} 个SKU`);
      } else {
        throw new Error(result.error || '销量检测失败');
      }
    } catch (error: any) {
      console.error('销量检测失败:', error);
      const errorMessage = error.message || '销量检测失败，请检查配置';
      toast.error(errorMessage);
      setSalesDetectionProgress('检测失败');
    } finally {
      setIsSalesLoading(false);
      setTimeout(() => setSalesDetectionProgress(''), 5000);
    }
  }, [filteredInventoryData, inventoryData, setInventoryData, fetchSalesAnalysis, setIsSalesLoading, setSalesDetectionProgress, salesDaysBack, setSalesDetectionDays]);

  // 处理天数变更后自动触发销量检测
  // 注意：这里只改变 daysBack（动态天数），salesDetectionDays 保持为弹窗配置的值
  const handleDaysChangeAndDetect = useCallback((newDays: number) => {
    // 使用新天数和默认配置触发销量检测
    const config: SalesDetectionConfig = {
      dataSource: 'supabase',
      siteIds: [],  // 空数组表示所有站点
      statuses: salesOrderStatuses,  // 使用当前的订单状态配置
      daysBack: newDays,
      salesDetectionDays: salesDetectionDays, // 保持弹窗配置的天数
      isFromDialog: false, // 明确标记为从表头调用，不是弹窗
    };

    // 直接调用销量检测
    handleSalesDetection(config);
  }, [salesOrderStatuses, salesDetectionDays, handleSalesDetection]);

  // Export inventory data
  const handleExportInventory = useCallback(() => {
    if (filteredInventoryData.length === 0) {
      toast.error('没有可导出的数据');
      return;
    }

    try {
      // 计算在途库存和预测库存
      const exportData = filteredInventoryData.map(item => {
        const 净可售库存 = item.净可售库存 || 0;
        const 在途数量 = item.在途数量 || 0;
        const 在途库存 = item.在途库存 || (净可售库存 + 在途数量);
        const 销量 = item.salesData?.salesQuantityDaysN || 0;
        const 预测库存 = 在途库存 - 销量;

        return {
          产品代码: item.产品代码,
          产品名称: item.产品名称,
          产品英文名称: item.产品英文名称,
          仓库: item.仓库,
          可售库存: item.可售库存,
          缺货占用库存: item.缺货,
          '净可售库存（说明：可售库存-缺货占用）': 净可售库存,
          '在途数量（说明：采购在途数量）': 在途数量,
          '在途库存（说明：净可售库存+在途数量）': 在途库存,
          ...(isSalesDetectionEnabled && {
            [`${salesDaysBack}天销量`]: 销量,
            [`${salesDaysBack}天订单数`]: item.salesData?.orderCountDaysN || 0,
            [`预测库存_在途（说明：在途库存-${salesDaysBack}天销量）`]: 预测库存,
          }),
          仓库代码: item.仓库代码,
          一级品类: item.一级品类,
          二级品类: item.二级品类,
          三级品类: item.三级品类,
          销售状态: item.销售状态,
        };
      });

      const filename = isMergedMode ? '库存数据_合并' : '库存数据';
      exportToExcel(exportData, filename);
      toast.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败');
    }
  }, [filteredInventoryData, isMergedMode, isSalesDetectionEnabled, salesDaysBack]);

  // Clear data
  const handleClearData = () => {
    setInventoryData([]);
    clearTransitOrders();
    toast.success('已清空所有数据');
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
      title="补货分析"
      description="从氚云ERP同步库存数据，查看库存状态分析和销量趋势"
    >
      <div className="space-y-6">
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
          categoryFilter={categoryFilter}
          categoryFilters={categoryFilters}
          inventoryData={processedInventoryData}
          excludeSkuPrefixes={excludeSkuPrefixes}
          excludeWarehouses={excludeWarehouses}
          isMergedMode={isMergedMode}
          hideZeroStock={hideZeroStock}
          hideNormalStatus={hideNormalStatus}
          onSkuFiltersChange={(value) => setFilters({ skuFilter: value })}
          onCategoryFilterChange={(value) => setFilters({ categoryFilter: value })}
          onCategoryFiltersChange={(value) => setFilters({ categoryFilters: value })}
          onExcludeSkuPrefixesChange={(value) => setFilters({ excludeSkuPrefixes: value })}
          onExcludeWarehousesChange={(value) => setFilters({ excludeWarehouses: value })}
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
            setShowSalesDetectionDialog(true);
          }}
        />

        {/* Export Button */}
        {filteredInventoryData.length > 0 && (
          <div className="flex justify-end">
            <Button
              onClick={handleExportInventory}
              variant="outline"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              导出库存数据 ({filteredInventoryData.length} 条)
            </Button>
          </div>
        )}

        <InventoryTable
          data={filteredInventoryData}
          selectedSkusForSync={selectedSkusForSync}
          syncingSkus={syncingSkus}
          onSkuSelectionChange={handleSkuSelectionChange}
          onSyncSku={() => {}} // 同步功能在sync页面
          isProductDetectionEnabled={false}
          isSalesDetectionEnabled={isSalesDetectionEnabled}
          selectedSiteId={null}
          onDaysChange={handleDaysChangeAndDetect}
        />

        {/* Sales Detection Dialog */}
        <SalesDetectionDialog
          open={showSalesDetectionDialog}
          onOpenChange={setShowSalesDetectionDialog}
          onConfirm={handleSalesDetection}
          sites={sites}
          skuCount={filteredInventoryData.length}
          isLoading={isSalesLoading}
        />
      </div>
    </PageLayout>
  );
}