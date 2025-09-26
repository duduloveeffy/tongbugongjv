'use client';

import { PageLayout } from '@/components/layout/PageLayout';
import { SalesDetectionControls } from '@/components/sales/SalesDetectionControls';
import { SalesAnalysisTable } from '@/components/sales/SalesAnalysisTable';
import { useInventoryStore } from '@/store/inventory';
import { useWooCommerceStore } from '@/store/woocommerce';
import { useMultiSiteStore } from '@/store/multisite';
import { useCallback, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';

export default function SalesPage() {
  const [salesOrderStatuses, setSalesOrderStatuses] = useState<string[]>(['completed', 'processing']);
  const [salesDateRange, setSalesDateRange] = useState<{start: string, end: string}>({
    start: '',
    end: ''
  });

  // Multisite store
  const { sites, fetchSites } = useMultiSiteStore();

  // Inventory store state
  const {
    inventoryData,
    setInventoryData,
    isSalesDetectionEnabled,
    setIsSalesDetectionEnabled,
    salesDetectionProgress,
    setSalesDetectionProgress,
    isSalesDetectionLoading: isSalesLoading,
    setIsSalesDetectionLoading: setIsSalesLoading,
  } = useInventoryStore();

  // WooCommerce store
  const {
    settings,
    fetchSalesAnalysis,
  } = useWooCommerceStore();

  // Fetch sites on mount
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Sales detection
  const handleSalesDetection = useCallback(async (skus: string[], config?: any) => {
    if (skus.length === 0) {
      toast.error('没有要检测的SKU');
      return;
    }

    // If no config provided, use default
    if (!config) {
      config = {
        dataSource: 'supabase',
        siteIds: [], // Empty array means all sites
        statuses: salesOrderStatuses,
        dateStart: salesDateRange.start || undefined,
        dateEnd: salesDateRange.end || undefined,
        daysBack: 30,
      };
    }

    // Check configuration
    if (config.dataSource === 'woocommerce') {
      if (!config.siteId && (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl)) {
        toast.error('请先配置WooCommerce API或选择站点');
        return;
      }
    }

    setIsSalesLoading(true);
    setSalesDetectionProgress('正在检测销量...');

    try {
      // Call improved sales detection API
      const result = await fetchSalesAnalysis({
        skus,
        ...config
      });

      if (result.success && result.data) {
        // Update inventory items with sales data
        const updatedData = inventoryData.map(item => {
          const salesInfo = result.data.find((s: any) => s.sku === item.产品代码);
          if (salesInfo) {
            return {
              ...item,
              salesData: {
                orderCount: salesInfo.orderCount || 0,
                salesQuantity: salesInfo.salesQuantity || 0,
                orderCount30d: salesInfo.orderCount30d || 0,
                salesQuantity30d: salesInfo.salesQuantity30d || 0,
              }
            };
          }
          return item;
        });

        // Update the inventory data with sales information
        setInventoryData(updatedData);

        // Calculate summary statistics - use salesQuantity30d
        const totalSales = result.data?.reduce((sum: number, item: any) =>
          sum + (item.salesQuantity30d || 0), 0) || 0;

        const detectedCount = result.data?.filter((item: any) =>
          item.salesQuantity30d > 0).length || 0;

        setSalesDetectionProgress(`检测完成！处理了 ${skus.length} 个SKU`);
        toast.success(`销量检测完成！${detectedCount} 个SKU有销量，总销量: ${totalSales}`);
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
  }, [inventoryData, setInventoryData, settings, salesOrderStatuses, salesDateRange, fetchSalesAnalysis, setIsSalesLoading, setSalesDetectionProgress]);

  // Get filtered inventory data
  const filteredInventoryData = inventoryData.filter(item => {
    // You can add filters here if needed
    return true;
  });

  return (
    <PageLayout
      title="销量检测"
      description="分析产品销量数据，支持多站点聚合查询"
    >
      <div className="space-y-6">
        {inventoryData.length === 0 ? (
          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              请先在<a href="/inventory" className="underline">库存分析</a>页面上传库存数据
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <SalesDetectionControls
              isEnabled={isSalesDetectionEnabled}
              isLoading={isSalesLoading}
              progress={salesDetectionProgress}
              onToggle={setIsSalesDetectionEnabled}
              onStartDetection={(skus, config) => {
                handleSalesDetection(skus, config);
              }}
              filteredData={filteredInventoryData}
              orderStatuses={salesOrderStatuses}
              dateRange={salesDateRange}
              onOrderStatusesChange={setSalesOrderStatuses}
              onDateRangeChange={setSalesDateRange}
            />

            <SalesAnalysisTable
              data={filteredInventoryData}
              isLoading={isSalesLoading}
            />
          </>
        )}
      </div>
    </PageLayout>
  );
}