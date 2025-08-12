'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInventoryStore } from '@/store/inventory';
import { SalesDetectionControls } from '@/components/sales/SalesDetectionControls';
import { ArrowLeft, TrendingUp, Package, AlertCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function SalesDetectionPage() {
  const {
    inventoryData,
    isSalesDetectionEnabled,
    setIsSalesDetectionEnabled,
    isSalesDetectionLoading: isLoadingSales,
    setIsSalesDetectionLoading: setIsLoadingSales,
    salesDetectionProgress: salesProgress,
    setSalesDetectionProgress: setSalesProgress,
    salesData,
    setSalesData,
    salesLoadingProgress,
    setSalesLoadingProgress,
    salesDetectionSites,
    setSalesDetectionSites,
    filteredData,
    setFilteredData,
    processedInventoryData,
    setProcessedInventoryData,
    clearSalesData,
  } = useInventoryStore();

  const [salesAnalysisMode, setSalesAnalysisMode] = useState<'local' | 'woocommerce'>('local');

  // 启用销量检测
  useEffect(() => {
    setIsSalesDetectionEnabled(true);
  }, [setIsSalesDetectionEnabled]);
  
  // 处理库存数据
  useEffect(() => {
    if (inventoryData && inventoryData.length > 0) {
      // 简单处理，直接使用库存数据
      setProcessedInventoryData(inventoryData);
      setFilteredData(inventoryData);
    }
  }, [inventoryData]);

  // 获取要检测的SKU列表
  const skusToDetect = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];
    
    // 使用 Map 来去重（基于 SKU）
    const uniqueSkuMap = new Map();
    filteredData.forEach(item => {
      if (item.产品代码 && !uniqueSkuMap.has(item.产品代码)) {
        uniqueSkuMap.set(item.产品代码, item);
      }
    });
    
    return Array.from(uniqueSkuMap.keys());
  }, [filteredData]);

  // 检测销量数据
  const handleDetectSales = useCallback(async (customSkus?: string[]) => {
    const skusToUse = customSkus || skusToDetect;
    if (!skusToUse || skusToUse.length === 0) {
      console.log('No SKUs to detect');
      return;
    }

    setIsLoadingSales(true);
    setSalesLoadingProgress({ current: 0, total: skusToUse.length });
    // 不清空现有数据，而是累积更新

    try {
      const batchSize = 50;
      const batches = [];
      
      for (let i = 0; i < skusToUse.length; i += batchSize) {
        batches.push(skusToUse.slice(i, i + batchSize));
      }

      const allResults: any = {};
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        setSalesLoadingProgress({ 
          current: batchIndex * batchSize, 
          total: skusToUse.length 
        });

        try {
          // 根据模式选择不同的API
          const endpoint = salesAnalysisMode === 'local' 
            ? '/api/sales/query' 
            : '/api/wc-sales-analysis';
          
          // 确保batch不为空
          if (!batch || batch.length === 0) {
            console.warn(`Batch ${batchIndex + 1} is empty, skipping`);
            continue;
          }
            
          const requestBody = { 
            skus: batch,
            ...(salesAnalysisMode === 'local' && salesDetectionSites?.length > 0 
              ? { siteIds: salesDetectionSites } 
              : {})
          };
          
          console.log(`Sending request to ${endpoint} with body:`, requestBody);
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            console.error(`Failed to fetch sales for batch ${batchIndex + 1}`);
            continue;
          }

          const batchResults = await response.json();
          
          if (salesAnalysisMode === 'local' && batchResults.data) {
            // 本地数据库模式，添加检测时间戳
            const timestamp = new Date().toISOString();
            Object.keys(batchResults.data).forEach(sku => {
              allResults[sku] = {
                ...batchResults.data[sku],
                detectedAt: timestamp
              };
            });
          } else if (batchResults.results) {
            // WooCommerce API 模式，添加检测时间戳
            const timestamp = new Date().toISOString();
            Object.keys(batchResults.results).forEach(sku => {
              allResults[sku] = {
                ...batchResults.results[sku],
                detectedAt: timestamp
              };
            });
          }
        } catch (error) {
          console.error(`Error processing batch ${batchIndex + 1}:`, error);
        }
      }

      // 合并新旧数据，新数据会覆盖旧数据（对于相同的SKU）
      setSalesData((prevData) => ({
        ...prevData,
        ...allResults,
      }));
    } catch (error) {
      console.error('Sales detection failed:', error);
    } finally {
      setIsLoadingSales(false);
      setSalesLoadingProgress({ current: 0, total: 0 });
    }
  }, [skusToDetect, salesAnalysisMode, salesDetectionSites, setIsLoadingSales, setSalesLoadingProgress, setSalesData]);

  // 自动检测销量（当有数据且启用时）- 移除以防止无限循环
  // 用户需要手动点击检测按钮来触发检测

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题和返回按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回主页
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6" />
              销量检测分析
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              分析产品销售数据，支持本地数据库和WooCommerce API两种模式
            </p>
          </div>
        </div>
        {(salesData && Object.keys(salesData).length > 0) && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              clearSalesData();
              alert('销量检测数据已清除');
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            清除缓存
          </Button>
        )}
      </div>

      {/* 主要内容区域 */}
      <div className="grid gap-6">
        {/* 数据源提示 */}
        {(!filteredData || filteredData.length === 0) && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              请先在主页上传库存文件，然后再进行销量检测。
              <Link href="/" className="ml-2 underline">
                返回上传文件
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* 销量检测控制面板 */}
        {filteredData && filteredData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                检测设置
              </CardTitle>
              <CardDescription>
                共 {skusToDetect.length} 个SKU待检测
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={salesAnalysisMode} onValueChange={(v) => setSalesAnalysisMode(v as 'local' | 'woocommerce')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="local">本地数据库（推荐）</TabsTrigger>
                  <TabsTrigger value="woocommerce">WooCommerce API</TabsTrigger>
                </TabsList>
                
                <TabsContent value="local" className="space-y-4">
                  <Alert>
                    <AlertDescription>
                      从本地同步的数据库查询，速度快，支持批量查询（50+ SKU/批次）
                    </AlertDescription>
                  </Alert>
                  <SalesDetectionControls
                    isEnabled={isSalesDetectionEnabled}
                    isLoading={isLoadingSales}
                    progress={salesProgress}
                    orderStatuses={['completed', 'processing']}
                    dateRange={{ start: '', end: '' }}
                    onToggle={setIsSalesDetectionEnabled}
                    onOrderStatusesChange={() => {}}
                    onDateRangeChange={() => {}}
                    onStartDetection={(skus, config) => {
                      // SalesDetectionControls 已经传递了正确的skus
                      handleDetectSales(skus);
                    }}
                    filteredData={filteredData}
                  />
                </TabsContent>
                
                <TabsContent value="woocommerce" className="space-y-4">
                  <Alert>
                    <AlertDescription>
                      直接调用WooCommerce API，实时数据但速度较慢
                    </AlertDescription>
                  </Alert>
                  <SalesDetectionControls
                    isEnabled={isSalesDetectionEnabled}
                    isLoading={isLoadingSales}
                    progress={salesProgress}
                    orderStatuses={['completed', 'processing']}
                    dateRange={{ start: '', end: '' }}
                    onToggle={setIsSalesDetectionEnabled}
                    onOrderStatusesChange={() => {}}
                    onDateRangeChange={() => {}}
                    onStartDetection={(skus, config) => {
                      // SalesDetectionControls 已经传递了正确的skus
                      handleDetectSales(skus);
                    }}
                    filteredData={filteredData}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* 销量分析结果展示 */}
        {salesData && Object.keys(salesData).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>分析结果</CardTitle>
              <CardDescription>
                已检测 {Object.keys(salesData).length} 个SKU的销量数据
                <span className="text-xs block mt-1">
                  （数据已自动保存，重复检测会更新最新结果）
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(salesData).map(([sku, data]: [string, any]) => (
                  <div key={sku} className="border rounded p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{sku}</div>
                        <div className="text-sm text-muted-foreground">
                          30天销量: {data.sales30Days || 0} | 
                          7天销量: {data.sales7Days || 0}
                        </div>
                      </div>
                      {data.detectedAt && (
                        <div className="text-xs text-muted-foreground">
                          检测时间: {new Date(data.detectedAt).toLocaleString('zh-CN')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}