"use client";

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useWooCommerceStore } from '@/store/woocommerce';
import { Upload, Search, Filter, Download, Trash2, ChevronDown, Layers, TrendingUp, Calendar, Package, FileSpreadsheet, Truck, Settings, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import * as XLSX from 'xlsx';

interface InventoryItem {
  产品代码: string;
  产品名称: string;
  产品英文名称: string;
  产品单重: string;
  产品尺寸: string;
  规格: string;
  计划库存: string;
  采购在途: string;
  退件在途: string;
  待上架: string;
  可用库存: string;
  可售库存: string;
  '可售库存减去缺货占用库存': string;
  待出库: string;
  '不良品 ': string;
  不良品待出库: string;
  预警库存: string;
  缺货: string;
  缺货天数: string;
  缺货订单所占可售库存: string;
  默认采购员: string;
  销售负责人: string;
  开发负责人: string;
  pi_id: string;
  可售天数: string;
  '币种(供应商结算)': string;
  采购计划: string;
  仓库: string;
  仓库代码: string;
  一级品类: string;
  二级品类: string;
  三级品类: string;
  销售状态: string;
  仓库产品代码: string;
  推荐库位: string;
  '单价(默认采购价)': string;
  款式: string;
  可售总库存: string;
  库龄: string;
  // 销量检测相关字段
  salesData?: {
    orderCount: number;
    salesQuantity: number;
    orderCount30d: number;
    salesQuantity30d: number;
  };
  // 上架检测相关字段
  productData?: {
    isOnline: boolean;
    status: string;
    stockStatus: string;
    productUrl?: string;
  };
  // 在途数量字段
  在途数量: number;
  在途库存: number;
  [key: string]: string | any;
}

export default function InventoryAnalysis() {
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [filteredData, setFilteredData] = useState<InventoryItem[]>([]);
  const [skuFilters, setSkuFilters] = useState<string>('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [isMergedMode, setIsMergedMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transitFileInputRef = useRef<HTMLInputElement>(null);
  const [isSalesDetectionEnabled, setIsSalesDetectionEnabled] = useState(false);
  const [isSalesLoading, setIsSalesLoading] = useState(false);
  const [salesDetectionProgress, setSalesDetectionProgress] = useState('');
  const [isProductDetectionEnabled, setIsProductDetectionEnabled] = useState(false);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [productDetectionProgress, setProductDetectionProgress] = useState('');
  const [salesOrderStatuses, setSalesOrderStatuses] = useState<string[]>(['completed', 'processing', 'pending']);
  const [salesDateRange, setSalesDateRange] = useState<{start: string, end: string}>({
    start: '',
    end: ''
  });
  const [isWarehouseDialogOpen, setIsWarehouseDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [selectedSkusForSync, setSelectedSkusForSync] = useState<Set<string>>(new Set());
  const [syncingSkus, setSyncingSkus] = useState<Set<string>>(new Set());

  const {
    settings,
    orders,
    setOrders,
    isLoadingOrders: wooLoading,
    setIsLoadingOrders: setWooLoading,
    transitOrders,
    setTransitOrders,
    getTransitQuantityBySku,
    clearTransitOrders,
  } = useWooCommerceStore();

  // 合并仓库数据的函数
  const mergeWarehouseData = (data: InventoryItem[]): InventoryItem[] => {
    const grouped = new Map<string, InventoryItem[]>();
    
    // 按产品代码分组
    data.forEach(item => {
      const sku = item.产品代码;
      if (!grouped.has(sku)) {
        grouped.set(sku, []);
      }
      grouped.get(sku)!.push(item);
    });

    // 合并每个分组的数据
    const merged: InventoryItem[] = [];
    grouped.forEach((items, sku) => {
      if (items.length === 0) return; // 安全检查
      
      const firstItem = items[0];
      if (!firstItem) return; // 再次安全检查
      
      if (items.length === 1) {
        // 只有一个仓库的数据，直接使用，确保在途字段存在
        const 在途数量 = firstItem.在途数量 || 0;
        const 净可售库存 = calculateNetStock(firstItem);
        merged.push({
          ...firstItem,
          在途数量: 在途数量,
          在途库存: 净可售库存 + 在途数量,
        });
      } else {
        // 多个仓库的数据，需要合并
        const warehouses = items.map(item => item.仓库).filter(w => w).join(', ');
        const mergedItem: InventoryItem = {
          产品代码: firstItem.产品代码,
          产品名称: firstItem.产品名称,
          产品英文名称: firstItem.产品英文名称,
          产品单重: firstItem.产品单重,
          产品尺寸: firstItem.产品尺寸,
          规格: firstItem.规格,
          仓库: `多仓库 (${warehouses})`,
          仓库代码: '合并',
          一级品类: firstItem.一级品类,
          二级品类: firstItem.二级品类,
          三级品类: firstItem.三级品类,
          销售状态: firstItem.销售状态,
          仓库产品代码: firstItem.仓库产品代码,
          推荐库位: firstItem.推荐库位,
          '单价(默认采购价)': firstItem['单价(默认采购价)'],
          款式: firstItem.款式,
          库龄: firstItem.库龄,
          默认采购员: firstItem.默认采购员,
          销售负责人: firstItem.销售负责人,
          开发负责人: firstItem.开发负责人,
          pi_id: firstItem.pi_id,
          '币种(供应商结算)': firstItem['币种(供应商结算)'],
          采购计划: firstItem.采购计划,
          // 数值字段求和
          计划库存: String(items.reduce((sum, item) => sum + (Number(item.计划库存) || 0), 0)),
          采购在途: String(items.reduce((sum, item) => sum + (Number(item.采购在途) || 0), 0)),
          退件在途: String(items.reduce((sum, item) => sum + (Number(item.退件在途) || 0), 0)),
          待上架: String(items.reduce((sum, item) => sum + (Number(item.待上架) || 0), 0)),
          可用库存: String(items.reduce((sum, item) => sum + (Number(item.可用库存) || 0), 0)),
          可售库存: String(items.reduce((sum, item) => sum + (Number(item.可售库存) || 0), 0)),
          '可售库存减去缺货占用库存': String(items.reduce((sum, item) => sum + (Number(item['可售库存减去缺货占用库存']) || 0), 0)),
          待出库: String(items.reduce((sum, item) => sum + (Number(item.待出库) || 0), 0)),
          '不良品 ': String(items.reduce((sum, item) => sum + (Number(item['不良品 ']) || 0), 0)),
          不良品待出库: String(items.reduce((sum, item) => sum + (Number(item.不良品待出库) || 0), 0)),
          预警库存: String(items.reduce((sum, item) => sum + (Number(item.预警库存) || 0), 0)),
          缺货: String(items.reduce((sum, item) => sum + (Number(item.缺货) || 0), 0)),
          缺货天数: String(Math.max(...items.map(item => Number(item.缺货天数) || 0))), // 取最大缺货天数
          缺货订单所占可售库存: String(items.reduce((sum, item) => sum + (Number(item.缺货订单所占可售库存) || 0), 0)),
          可售天数: firstItem.可售天数,
          可售总库存: String(items.reduce((sum, item) => sum + (Number(item.可售总库存) || 0), 0)),
          // 在途数量和在途库存的计算
          在途数量: items.reduce((sum, item) => sum + (Number(item.在途数量) || 0), 0),
          在途库存: (() => {
            // 计算合并后的净可售库存
            const mergedNetStock = items.reduce((sum, item) => {
              const baseStock = Number(item['可售库存减去缺货占用库存']) || 0;
              const shortage = Number(item.缺货) || 0;
              return sum + (baseStock - shortage);
            }, 0);
            // 计算合并后的在途数量
            const mergedTransitQuantity = items.reduce((sum, item) => sum + (Number(item.在途数量) || 0), 0);
            // 在途库存 = 合并后的净可售库存 + 合并后的在途数量
            return mergedNetStock + mergedTransitQuantity;
          })(),
        };
        merged.push(mergedItem);
      }
    });

    return merged;
  };

  // 当数据或筛选条件变化时重新应用筛选
	useEffect(() => {
    if (inventoryData.length > 0) {
      let baseData = inventoryData;
      
      // 如果开启合并模式，先合并数据
      if (isMergedMode) {
        baseData = mergeWarehouseData(inventoryData);
      }

      let filtered = baseData;

      // SKU筛选
      if (skuFilters.trim()) {
        const skuFilterArray = skuFilters.split(',').map(f => f.trim().toUpperCase()).filter(f => f);
        filtered = filtered.filter(item => {
          const productCode = item.产品代码?.toUpperCase() || '';
          return skuFilterArray.some(filter => productCode.startsWith(filter));
        });
      }

      // 仓库筛选（在合并模式下禁用）
      if (!isMergedMode && warehouseFilter && warehouseFilter !== 'all') {
        filtered = filtered.filter(item => item.仓库 === warehouseFilter);
      }

      // 一级品类筛选
      if (categoryFilter && categoryFilter !== 'all') {
        filtered = filtered.filter(item => item.一级品类 === categoryFilter);
      }

      // 确保所有项目都有在途数量和在途库存字段
      filtered = filtered.map(item => {
        const 在途数量 = item.在途数量 || 0;
        const 净可售库存 = calculateNetStock(item);
        return {
          ...item,
          在途数量: 在途数量,
          在途库存: 净可售库存 + 在途数量,
        };
      });

      setFilteredData(filtered);
    }
  }, [inventoryData, skuFilters, warehouseFilter, categoryFilter, isMergedMode]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('请上传CSV文件');
      return;
    }

    setIsLoading(true);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // 转换GB2312编码为UTF-8
      const decodedString = iconv.decode(buffer, 'gb2312');
      
      // 解析CSV
              Papa.parse(decodedString, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const data = (results.data as InventoryItem[]).map(item => ({
              ...item,
              在途数量: 0,
              在途库存: 0,
            }));
            console.log('CSV Headers:', results.meta.fields);
            console.log('Sample data:', data[0]);
            
            setHeaders(results.meta.fields || []);
            setInventoryData(data);
            setFilteredData(data);
            toast.success(`成功导入 ${data.length} 条库存数据`);
          },
          error: (error: any) => {
            console.error('CSV解析错误:', error);
            toast.error('CSV文件解析失败');
          }
        });
    } catch (error) {
      console.error('文件读取错误:', error);
      toast.error('文件读取失败，请确保文件编码为GB2312');
    } finally {
      setIsLoading(false);
    }
  };

  // 在途订单导入处理
  const handleTransitOrderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedWarehouse) {
      toast.error('请先选择目标仓库');
      return;
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('请上传Excel文件（.xlsx或.xls）');
      return;
    }

    setIsLoading(true);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const sheetName = workbook.SheetNames[0];
      
      if (!sheetName) {
        throw new Error('Excel文件中没有找到工作表');
      }
      
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        throw new Error('无法读取Excel工作表');
      }
      
      // 转换为JSON，跳过第一行（标题行）
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // 处理数据，跳过标题行
      const dataRows = jsonData.slice(1) as any[][];
      const transitData = dataRows.map(row => ({
        产品型号: String(row[0] || '').trim(),
        产品英文名称: String(row[1] || '').trim(),
        数量: Number(row[2]) || 0,
      })).filter(item => item.产品型号 && item.数量 > 0);
      
      console.log('在途订单数据:', transitData);
      console.log('目标仓库:', selectedWarehouse);
      
      setTransitOrders(transitData);
      
      // 更新库存数据中的在途数量（只更新指定仓库）
      updateInventoryWithTransitData(transitData, selectedWarehouse);
      
      const uniqueSkus = new Set(transitData.map(item => item.产品型号)).size;
      toast.success(`成功导入 ${transitData.length} 条在途订单数据到 ${selectedWarehouse}，覆盖 ${uniqueSkus} 个不同SKU`);
      
      // 关闭对话框
      setIsWarehouseDialogOpen(false);
    } catch (error) {
      console.error('Excel文件读取错误:', error);
      toast.error('Excel文件读取失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 更新库存数据中的在途数量
  const updateInventoryWithTransitData = (transitData: any[], targetWarehouse?: string) => {
    const transitMap = new Map<string, number>();
    
    // 建立SKU到在途数量的映射
    transitData.forEach(item => {
      const sku = item.产品型号;
      transitMap.set(sku, (transitMap.get(sku) || 0) + item.数量);
    });
    
    // 更新库存数据
    const updatedInventoryData = inventoryData.map(item => {
      const sku = item.产品代码;
      
      // 如果指定了目标仓库，只更新该仓库的数据
      if (targetWarehouse && item.仓库 !== targetWarehouse) {
        const 在途数量 = item.在途数量 || 0;
        const 净可售库存 = calculateNetStock(item);
        return {
          ...item,
          在途数量: 在途数量,
          在途库存: 净可售库存 + 在途数量,
        };
      }
      
      const transitQuantity = sku ? (transitMap.get(sku) || 0) : 0;
      const netStock = calculateNetStock(item);
      
      return {
        ...item,
        在途数量: transitQuantity,
        在途库存: netStock + transitQuantity,
      };
    });
    
    setInventoryData(updatedInventoryData);
    
    // 重新应用筛选
    let baseData = updatedInventoryData;
    if (isMergedMode) {
      baseData = mergeWarehouseData(updatedInventoryData);
    }
    
    let filtered = baseData;
    
    // 应用现有的筛选条件
    if (skuFilters.trim()) {
      const skuFilterArray = skuFilters.split(',').map(f => f.trim().toUpperCase()).filter(f => f);
      filtered = filtered.filter(item => {
        const productCode = item.产品代码?.toUpperCase() || '';
        return skuFilterArray.some(filter => productCode.startsWith(filter));
      });
    }
    
    if (!isMergedMode && warehouseFilter && warehouseFilter !== 'all') {
      filtered = filtered.filter(item => item.仓库 === warehouseFilter);
    }
    
    if (categoryFilter && categoryFilter !== 'all') {
      filtered = filtered.filter(item => item.一级品类 === categoryFilter);
    }
    
    // 确保所有项目都有在途数量和在途库存字段
    filtered = filtered.map(item => {
      const 在途数量 = item.在途数量 || 0;
      const 净可售库存 = calculateNetStock(item);
      return {
        ...item,
        在途数量: 在途数量,
        在途库存: 净可售库存 + 在途数量,
      };
    });
    
    setFilteredData(filtered);
  };

  const showFilterToast = () => {
    toast.success(`筛选结果：${filteredData.length} 条数据`);
  };

  const handleSkuFilterChange = (value: string) => {
    setSkuFilters(value);
    setIsSalesDetectionEnabled(false);
    setIsProductDetectionEnabled(false);
    setSelectedSkusForSync(new Set());
    // Toast在useEffect中处理筛选结果后显示
    setTimeout(() => showFilterToast(), 100);
  };

  const handleWarehouseFilterChange = (value: string) => {
    setWarehouseFilter(value);
    setIsSalesDetectionEnabled(false);
    setIsProductDetectionEnabled(false);
    setSelectedSkusForSync(new Set());
    setTimeout(() => showFilterToast(), 100);
  };

  const handleCategoryFilterChange = (value: string) => {
    setCategoryFilter(value);
    setIsSalesDetectionEnabled(false);
    setIsProductDetectionEnabled(false);
    setSelectedSkusForSync(new Set());
    setTimeout(() => showFilterToast(), 100);
  };

  const clearData = () => {
    setInventoryData([]);
    setFilteredData([]);
    setSkuFilters('');
    setWarehouseFilter('');
    setCategoryFilter('');
    setIsMergedMode(false);
    setIsSalesDetectionEnabled(false);
    setIsProductDetectionEnabled(false);
    setSalesOrderStatuses(['completed', 'processing', 'pending']);
    setSalesDateRange({ start: '', end: '' });
    setHeaders([]);
    clearTransitOrders();
    setSelectedWarehouse('');
    setIsWarehouseDialogOpen(false);
    setSelectedSkusForSync(new Set());
    setSyncingSkus(new Set());
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (transitFileInputRef.current) {
      transitFileInputRef.current.value = '';
    }
    toast.success('数据已清空');
  };

  const clearFilters = () => {
    setSkuFilters('');
    setWarehouseFilter('');
    setCategoryFilter('');
    setIsMergedMode(false);
    setIsSalesDetectionEnabled(false);
    setIsProductDetectionEnabled(false);
    setSalesOrderStatuses(['completed', 'processing', 'pending']);
    setSalesDateRange({ start: '', end: '' });
    setSelectedSkusForSync(new Set());
    setTimeout(() => {
      toast.success('筛选条件已清空');
    }, 100);
  };

  // 获取仓库选项
  const getWarehouseOptions = () => {
    const warehouses = [...new Set(inventoryData.map(item => item.仓库).filter(w => w))];
    return warehouses.sort();
  };

  // 获取一级品类选项
  const getCategoryOptions = () => {
    const categories = [...new Set(inventoryData.map(item => item.一级品类).filter(c => c))];
    return categories.sort();
  };

  const exportFilteredData = () => {
    if (filteredData.length === 0) {
      toast.error('没有可导出的数据');
      return;
    }

    const csv = Papa.unparse(filteredData);
    // 转换为GB2312编码以确保中文正确显示
    const encoded = iconv.encode(csv, 'gb2312');
    const blob = new Blob([encoded], { type: 'text/csv;charset=gb2312;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `库存筛选结果_${new Date().toLocaleDateString()}.csv`;
    link.click();
    toast.success('数据导出成功');
  };

  const exportToExcel = () => {
    if (filteredData.length === 0) {
      toast.error('没有可导出的数据');
      return;
    }

    // 准备Excel数据
    const excelData = filteredData.map(item => {
      const netStock = calculateNetStock(item);
      const sales30d = item.salesData?.salesQuantity30d || 0;
      const transitStock = item.在途库存 || netStock;
      const predictedTransitQuantity = transitStock - sales30d;
      
      const baseData = {
        '产品代码': getFieldValue(item, '产品代码'),
        '产品英文名称': getFieldValue(item, '产品英文名称'),
        '可售库存': getFieldValue(item, '可售库存'),
        '净可售库存': netStock,
        '在途数量': item.在途数量 || 0,
        '在途库存': transitStock,
        '缺货天数': getFieldValue(item, '缺货天数') || '0',
        '仓库': getFieldValue(item, '仓库'),
        '一级品类': getFieldValue(item, '一级品类'),
      };

      // 添加销量数据和上架数据
      let extendedData: any = { ...baseData };

      if (isSalesDetectionEnabled && item.salesData) {
        extendedData = {
          ...extendedData,
          '预测数量（在途）': predictedTransitQuantity,
          '订单数': item.salesData.orderCount,
          '销售数量': item.salesData.salesQuantity,
          '30天订单数': item.salesData.orderCount30d,
          '30天销售数量': item.salesData.salesQuantity30d,
        };
      }

      if (isProductDetectionEnabled && item.productData) {
        extendedData = {
          ...extendedData,
          '上架状态': item.productData.isOnline ? '已上架' : '未上架',
          '库存状态': item.productData.stockStatus === 'instock' ? '有货' : 
                     item.productData.stockStatus === 'onbackorder' ? '缺货' : '无货',
  
        };
      }

      return extendedData;
    });

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // 设置列宽
    const columnWidths = [
      { wch: 15 }, // 产品代码
      { wch: 25 }, // 产品英文名称
      { wch: 10 }, // 可售库存
      { wch: 12 }, // 净可售库存
      { wch: 10 }, // 在途数量
      { wch: 12 }, // 在途库存
      { wch: 10 }, // 缺货天数
      { wch: 15 }, // 仓库
      { wch: 15 }, // 一级品类
    ];

    if (isSalesDetectionEnabled) {
      columnWidths.push(
        { wch: 14 }, // 预测数量（在途）
        { wch: 10 }, // 订单数
        { wch: 12 }, // 销售数量
        { wch: 12 }, // 30天订单数
        { wch: 14 }  // 30天销售数量
      );
    }

    if (isProductDetectionEnabled) {
      columnWidths.push(
        { wch: 12 }, // 上架状态
        { wch: 12 }  // 库存状态
      );
    }

    worksheet['!cols'] = columnWidths;

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(workbook, worksheet, '库存分析');

    // 如果开启了销量检测，创建建议采购表（在途）
    if (isSalesDetectionEnabled) {
      const purchaseRecommendationData = filteredData
        .filter(item => {
          const sales30d = item.salesData?.salesQuantity30d || 0;
          const transitStock = item.在途库存 || calculateNetStock(item);
          const predictedTransitQuantity = transitStock - sales30d;
          return predictedTransitQuantity < 0;
        })
        .map(item => {
          const netStock = calculateNetStock(item);
          const sales30d = item.salesData?.salesQuantity30d || 0;
          const transitStock = item.在途库存 || netStock;
          const predictedTransitQuantity = transitStock - sales30d;
          
          return {
            '产品代码': getFieldValue(item, '产品代码'),
            '产品英文名称': getFieldValue(item, '产品英文名称'),
            '净可售库存': netStock,
            '在途数量': item.在途数量 || 0,
            '在途库存': transitStock,
            '30天销售数量': sales30d,
            '预测数量（在途）': predictedTransitQuantity,
            '建议采购数量': Math.abs(predictedTransitQuantity),
            '仓库': getFieldValue(item, '仓库'),
            '一级品类': getFieldValue(item, '一级品类'),
            '默认采购员': getFieldValue(item, '默认采购员'),
            '单价(默认采购价)': getFieldValue(item, '单价(默认采购价)'),
            '预估采购金额': (Math.abs(predictedTransitQuantity) * (parseFloat(getFieldValue(item, '单价(默认采购价)')) || 0)).toFixed(2),
          };
        });

      if (purchaseRecommendationData.length > 0) {
        const purchaseWorksheet = XLSX.utils.json_to_sheet(purchaseRecommendationData);
        
        // 设置建议采购表的列宽
        const purchaseColumnWidths = [
          { wch: 15 }, // 产品代码
          { wch: 25 }, // 产品英文名称
          { wch: 12 }, // 净可售库存
          { wch: 10 }, // 在途数量
          { wch: 12 }, // 在途库存
          { wch: 14 }, // 30天销售数量
          { wch: 14 }, // 预测数量（在途）
          { wch: 14 }, // 建议采购数量
          { wch: 15 }, // 仓库
          { wch: 15 }, // 一级品类
          { wch: 15 }, // 默认采购员
          { wch: 15 }, // 单价(默认采购价)
          { wch: 15 }, // 预估采购金额
        ];
        
        purchaseWorksheet['!cols'] = purchaseColumnWidths;
        
        // 添加建议采购表到工作簿
        XLSX.utils.book_append_sheet(workbook, purchaseWorksheet, '建议采购表（在途）');
      }
    }

    // 生成文件名
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    let filename = `库存分析报告_${timestamp}`;
    
    // 如果有销量检测，添加状态信息到文件名
    if (isSalesDetectionEnabled) {
      filename += `_销量(${salesOrderStatuses.join('')})`;
    }
    
    filename += '.xlsx';

    // 导出文件
    XLSX.writeFile(workbook, filename);
    
    // 显示导出成功消息
    let message = 'Excel文件导出成功';
    if (isSalesDetectionEnabled) {
      const purchaseCount = filteredData.filter(item => {
        const sales30d = item.salesData?.salesQuantity30d || 0;
        const transitStock = item.在途库存 || calculateNetStock(item);
        const predictedTransitQuantity = transitStock - sales30d;
        return predictedTransitQuantity < 0;
      }).length;
      
      if (purchaseCount > 0) {
        message += `，包含${purchaseCount}个建议采购项目`;
      }
    }
    
    toast.success(message);
  };

  // 辅助函数：安全获取字段值
  const getFieldValue = (item: InventoryItem, fieldName: string): string => {
    return item[fieldName] || '';
  };

  // 计算净可售库存：可售库存减去缺货占用库存 - 缺货
  const calculateNetStock = (item: InventoryItem): number => {
    const baseStock = Number(getFieldValue(item, '可售库存减去缺货占用库存')) || 0;
    const shortage = Number(getFieldValue(item, '缺货')) || 0;
    return baseStock - shortage;
  };

  const handleSalesDetection = async () => {
    if (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl) {
      toast.error('请先在销量检测页面配置WooCommerce API设置');
      return;
    }

    if (salesOrderStatuses.length === 0) {
      toast.error('请至少选择一个订单状态');
      return;
    }

    setIsSalesLoading(true);
    setSalesDetectionProgress('开始销量检测...');
    
    try {
      // 获取当前筛选的SKU列表
      const skus = filteredData.map(item => getFieldValue(item, '产品代码'));
      
      if (skus.length === 0) {
        toast.error('请先筛选出需要检测的SKU');
        setIsSalesLoading(false);
        setSalesDetectionProgress('');
        return;
      }

      setSalesDetectionProgress('正在获取订单数据...');
      toast.info('开始获取订单数据，请耐心等待...');

      // 获取订单数据
      const params = new URLSearchParams({
        siteUrl: settings.siteUrl,
        consumerKey: settings.consumerKey,
        consumerSecret: settings.consumerSecret,
        skus: skus.join(','),
        statuses: salesOrderStatuses.join(',')
      });
      
      // 如果有时间范围筛选，添加时间参数
      if (salesDateRange.start) {
        params.append('dateStart', new Date(salesDateRange.start).toISOString());
      }
      if (salesDateRange.end) {
        params.append('dateEnd', new Date(salesDateRange.end).toISOString());
      }
      
      // 计算30天前的时间
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const response = await fetch(`/api/wc-orders?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const orders = await response.json();
      
      // 显示获取到的订单数量
      setSalesDetectionProgress(`成功获取 ${orders.length} 个订单数据，开始计算销量...`);
      toast.success(`成功获取 ${orders.length} 个订单数据，开始计算销量...`);
      
      // 计算每个SKU的销量数据
      const salesDataMap = new Map<string, {
        orderCount: number;
        salesQuantity: number;
        orderCount30d: number;
        salesQuantity30d: number;
      }>();

      // 初始化销量数据
      skus.forEach(sku => {
        salesDataMap.set(sku, {
          orderCount: 0,
          salesQuantity: 0,
          orderCount30d: 0,
          salesQuantity30d: 0,
        });
      });

      // 遍历订单计算销量
      orders.forEach((order: any) => {
        const orderDate = new Date(order.date_created);
        const isWithin30Days = orderDate >= thirtyDaysAgo;
        
        // 记录已经处理过的SKU（避免同一订单中的同一SKU重复计算订单数）
        const processedSkusInOrder = new Set<string>();
        
        order.line_items.forEach((item: any) => {
          const sku = item.sku;
          if (skus.includes(sku)) {
            const salesData = salesDataMap.get(sku);
            if (salesData) {
              // 计算销售数量（全部时间）
              salesData.salesQuantity += item.quantity;
              
              // 计算订单数（全部时间，每个订单中的SKU只计算一次）
              if (!processedSkusInOrder.has(sku)) {
                salesData.orderCount += 1;
                processedSkusInOrder.add(sku);
              }
            }
          }
        });
      });

      // 单独计算30天数据 - 重新获取不带时间筛选的订单数据
      setSalesDetectionProgress('正在获取最近30天的订单数据...');
      
      const thirtyDaysParams = new URLSearchParams({
        siteUrl: settings.siteUrl,
        consumerKey: settings.consumerKey,
        consumerSecret: settings.consumerSecret,
        skus: skus.join(','),
        statuses: salesOrderStatuses.join(',')
      });
      
      // 30天数据查询：只设置开始时间为30天前
      thirtyDaysParams.append('dateStart', thirtyDaysAgo.toISOString());
      
      console.log('30天数据查询参数:', thirtyDaysParams.toString());
      console.log('30天前时间:', thirtyDaysAgo.toISOString());
      
      const thirtyDaysResponse = await fetch(`/api/wc-orders?${thirtyDaysParams.toString()}`);
      
      if (thirtyDaysResponse.ok) {
        const thirtyDaysOrders = await thirtyDaysResponse.json();
        
        // 显示30天数据获取情况
        console.log('30天数据获取结果:', {
          订单数量: thirtyDaysOrders.length,
          查询状态: salesOrderStatuses,
          时间范围: `${thirtyDaysAgo.toISOString()} 至 ${new Date().toISOString()}`
        });
        
        setSalesDetectionProgress(`获取到最近30天的 ${thirtyDaysOrders.length} 个订单数据，计算30天销量...`);
        toast.info(`获取到最近30天的 ${thirtyDaysOrders.length} 个订单数据，计算30天销量...`);
        
        // 计算30天数据
        thirtyDaysOrders.forEach((order: any) => {
          const processedSkusInOrder30d = new Set<string>();
          
          order.line_items.forEach((item: any) => {
            const sku = item.sku;
            if (skus.includes(sku)) {
              const salesData = salesDataMap.get(sku);
              if (salesData) {
                // 计算30天销售数量
                salesData.salesQuantity30d += item.quantity;
                
                // 计算30天订单数
                if (!processedSkusInOrder30d.has(sku)) {
                  salesData.orderCount30d += 1;
                  processedSkusInOrder30d.add(sku);
                }
              }
            }
          });
        });
      }

      // 更新库存数据，添加销量信息
      const updatedData = filteredData.map(item => ({
        ...item,
        salesData: salesDataMap.get(getFieldValue(item, '产品代码')) || {
          orderCount: 0,
          salesQuantity: 0,
          orderCount30d: 0,
          salesQuantity30d: 0,
        }
      }));

      setFilteredData(updatedData);
      setIsSalesDetectionEnabled(true);
      setSalesDetectionProgress('');
      
      toast.success(`成功检测 ${skus.length} 个SKU的销量数据`);
      
    } catch (error) {
      console.error('销量检测失败:', error);
      toast.error('销量检测失败，请检查API配置');
      setSalesDetectionProgress('');
    } finally {
      setIsSalesLoading(false);
    }
  };

  const handleOrderStatusChange = (statusId: string, checked: boolean) => {
    if (checked) {
      setSalesOrderStatuses(prev => [...prev, statusId]);
    } else {
      setSalesOrderStatuses(prev => {
        const newStatuses = prev.filter(id => id !== statusId);
        // 确保至少保留一个状态
        if (newStatuses.length === 0) {
          toast.error('至少需要选择一个订单状态');
          return prev;
        }
        return newStatuses;
      });
    }
  };

  const handleProductDetection = async () => {
    if (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl) {
      toast.error('请先在销量检测页面配置WooCommerce API设置');
      return;
    }

    setIsProductLoading(true);
    setProductDetectionProgress('开始检测...');
    
    try {
      // 获取当前筛选的SKU列表
      const skus = filteredData.map(item => getFieldValue(item, '产品代码'));
      
      if (skus.length === 0) {
        toast.error('请先筛选出需要检测的SKU');
        setIsProductLoading(false);
        return;
      }

      // 获取产品数据
      const auth = btoa(`${settings.consumerKey}:${settings.consumerSecret}`);
      const baseUrl = settings.siteUrl.replace(/\/$/, '');
      
      const productDataMap = new Map<string, {
        isOnline: boolean;
        status: string;
        stockStatus: string;
        productUrl?: string;
      }>();

      // 初始化产品数据
      skus.forEach(sku => {
        productDataMap.set(sku, {
          isOnline: false,
          status: 'notfound',
          stockStatus: 'outofstock',
        });
      });

      // 优化的产品信息获取 - 并行查询多个SKU
      setProductDetectionProgress(`正在并行查询 ${skus.length} 个SKU...`);
      
      // 并行查询所有SKU
      const fetchPromises = skus.map(async (sku, index) => {
        try {
          const params = new URLSearchParams({
            siteUrl: settings.siteUrl,
            consumerKey: settings.consumerKey,
            consumerSecret: settings.consumerSecret,
            sku: sku
          });
          
          const response = await fetch(`/api/wc-products?${params.toString()}`);
          
          if (response.ok) {
            const products = await response.json();
            setProductDetectionProgress(`已完成 ${index + 1}/${skus.length} 个SKU查询`);
            return products;
          }
        } catch (error) {
          console.error(`Failed to fetch product with SKU ${sku}:`, error);
        }
        return [];
      });
      
      const results = await Promise.all(fetchPromises);
      const allProducts = results.flat();

      const products = allProducts;
      
      console.log(`Found ${products.length} products for ${skus.length} SKUs:`, products.map(p => ({ sku: p.sku, status: p.status, stock_status: p.stock_status })));
      
      // 处理产品数据
      products.forEach((product: any) => {
        if (product.sku && skus.includes(product.sku)) {
          productDataMap.set(product.sku, {
            isOnline: product.status === 'publish',
            status: product.status,
            stockStatus: product.stock_status,
            productUrl: product.permalink,
          });
        }
      });

      // 更新库存数据，添加产品信息
      const updatedData = filteredData.map(item => ({
        ...item,
        productData: productDataMap.get(getFieldValue(item, '产品代码')) || {
          isOnline: false,
          status: 'notfound',
          stockStatus: 'outofstock',
        }
      }));

      setFilteredData(updatedData);
      setIsProductDetectionEnabled(true);
      setProductDetectionProgress('');
      
      const foundCount = products.length;
      toast.success(`成功检测 ${skus.length} 个SKU，找到 ${foundCount} 个产品的上架状态`);
      
    } catch (error) {
      console.error('产品检测失败:', error);
      toast.error('产品检测失败，请检查API配置和网络连接');
      setProductDetectionProgress('');
    } finally {
      setIsProductLoading(false);
    }
  };

  // 同步单个SKU的库存状态
  const syncSingleSku = async (sku: string, targetStatus: 'instock' | 'outofstock') => {
    if (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl) {
      toast.error('请先配置WooCommerce API设置');
      return;
    }

    setSyncingSkus(prev => new Set([...prev, sku]));
    
    try {
      const params = new URLSearchParams({
        siteUrl: settings.siteUrl,
        consumerKey: settings.consumerKey,
        consumerSecret: settings.consumerSecret,
        sku: sku,
        stockStatus: targetStatus
      });
      
      const response = await fetch(`/api/wc-update-stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString()
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // 更新本地数据
        const updatedData = filteredData.map(item => {
          if (getFieldValue(item, '产品代码') === sku) {
            return {
              ...item,
              productData: {
                isOnline: item.productData?.isOnline ?? false,
                status: item.productData?.status ?? 'notfound',
                stockStatus: targetStatus,
                productUrl: item.productData?.productUrl
              }
            };
          }
          return item;
        });
        
        setFilteredData(updatedData);
        toast.success(`SKU ${sku} 库存状态已同步为${targetStatus === 'instock' ? '有货' : '无货'}`);
      } else {
        const errorData = await response.json();
        
        if (response.status === 401) {
          toast.error(`API权限错误：${errorData.error}`, {
            description: errorData.solution,
            duration: 8000
          });
        } else {
          toast.error(`同步失败：${errorData.error || '未知错误'}`, {
            description: errorData.details ? `详情：${errorData.details}` : undefined,
            duration: 5000
          });
        }
        throw new Error(errorData.error || '同步失败');
      }
    } catch (error) {
      console.error('同步失败:', error);
      toast.error(`SKU ${sku} 同步失败，请检查网络连接`);
    } finally {
      setSyncingSkus(prev => {
        const newSet = new Set(prev);
        newSet.delete(sku);
        return newSet;
      });
    }
  };

    // 批量同步库存状态
  const syncMultipleSkus = async () => {
    if (selectedSkusForSync.size === 0) {
      toast.error('请选择要同步的SKU');
      return;
    }

    if (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl) {
      toast.error('请先配置WooCommerce API设置');
      return;
    }

    const skusToSync = Array.from(selectedSkusForSync);
    setSyncingSkus(new Set(skusToSync));
    
    try {
      const syncPromises = skusToSync.map(async (sku) => {
        const item = filteredData.find(item => getFieldValue(item, '产品代码') === sku);
        if (!item) return;

        const currentStatus = item.productData?.stockStatus || 'outofstock';
        
        // 直接切换状态：有货变无货，无货变有货
        const targetStatus: 'instock' | 'outofstock' = currentStatus === 'instock' ? 'outofstock' : 'instock';

        const params = new URLSearchParams({
          siteUrl: settings.siteUrl,
          consumerKey: settings.consumerKey,
          consumerSecret: settings.consumerSecret,
          sku: sku,
          stockStatus: targetStatus
        });
        
        const response = await fetch(`/api/wc-update-stock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString()
        });
        
        if (response.ok) {
          return { sku, targetStatus, success: true };
        } else {
          const errorData = await response.json();
          return { sku, targetStatus, success: false, error: errorData.error };
        }
      });

      const results = await Promise.all(syncPromises);
      const successCount = results.filter(r => r?.success).length;
      const failCount = results.filter(r => r?.success === false).length;
      const failedResults = results.filter(r => r?.success === false);

      // 更新本地数据
      const updatedData = filteredData.map(item => {
        const result = results.find(r => r?.sku === getFieldValue(item, '产品代码'));
        if (result?.success) {
          return {
            ...item,
            productData: {
              isOnline: item.productData?.isOnline ?? false,
              status: item.productData?.status ?? 'notfound',
              stockStatus: result.targetStatus,
              productUrl: item.productData?.productUrl
            }
          };
        }
        return item;
      });
      
      setFilteredData(updatedData);
      setSelectedSkusForSync(new Set());
      
      if (successCount > 0) {
        toast.success(`成功同步 ${successCount} 个SKU的库存状态`);
      }
      if (failCount > 0) {
        // 检查是否有权限错误
        const hasAuthError = failedResults.some(r => r?.error?.includes('权限') || r?.error?.includes('authentication'));
        if (hasAuthError) {
          toast.error(`${failCount} 个SKU同步失败`, {
            description: '请检查API密钥是否具有写入权限',
            duration: 8000
          });
        } else {
          toast.error(`${failCount} 个SKU同步失败`);
        }
      }
    } catch (error) {
      console.error('批量同步失败:', error);
      toast.error('批量同步失败，请检查网络连接');
    } finally {
      setSyncingSkus(new Set());
    }
  };

  // 处理SKU选择变化
  const handleSkuSelectionChange = (sku: string, checked: boolean) => {
    const newSet = new Set(selectedSkusForSync);
    if (checked) {
      newSet.add(sku);
    } else {
      newSet.delete(sku);
    }
    setSelectedSkusForSync(newSet);
  };

  // 判断SKU是否需要同步以及同步状态
  const getSyncRecommendation = (item: InventoryItem) => {
    const netStock = calculateNetStock(item);
    const currentStatus = item.productData?.stockStatus || 'outofstock';
    
    if (currentStatus === 'instock' && netStock < 0) {
      return {
        shouldSync: true,
        targetStatus: 'outofstock' as const,
        type: 'to-outofstock' as const,
        reason: '有货但净库存<0，建议同步为无货'
      };
    } else if (currentStatus === 'outofstock' && netStock > 0) {
      return {
        shouldSync: true,
        targetStatus: 'instock' as const,
        type: 'to-instock' as const,
        reason: '无货但净库存>0，建议同步为有货'
      };
    } else {
      return {
        shouldSync: false,
        targetStatus: currentStatus as 'instock' | 'outofstock',
        type: 'no-sync' as const,
        reason: '状态正常，无需同步'
      };
    }
  };

  // WooCommerce Store
  const wooStore = useWooCommerceStore();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-4 mb-2">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
            <div className="text-white text-2xl font-bold">📊</div>
          </div>
          <h1 className="text-3xl font-bold">ERP数据分析系统</h1>
        </div>
        <p className="text-muted-foreground mt-2">库存分析 & 销量检测</p>
					</div>
					
      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            库存分析
          </TabsTrigger>
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            网站配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-6">

      {/* 文件上传区域 */}
      <Card>
                  <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              文件上传
            </CardTitle>
            <CardDescription>
              支持上传GB2312编码的CSV文件（如库存查询.csv）
            </CardDescription>
          </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={isLoading}
              className="flex-1"
            />
            <Button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              variant="outline"
            >
              <Upload className="h-4 w-4 mr-2" />
              {isLoading ? '上传中...' : '选择文件'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 调试信息 */}
      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>调试信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              <p><strong>检测到的字段：</strong></p>
              <div className="mt-2 p-2 bg-gray-100 rounded max-h-40 overflow-y-auto">
                {headers.map((header, index) => (
                  <div key={index} className="text-xs">
                    {index + 1}. "{header}"
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 数据统计和筛选 */}
      {inventoryData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              数据筛选
            </CardTitle>
            <CardDescription>
              按SKU开头筛选，多个条件用逗号分隔（如：JNR,FL,FX）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 模式切换 */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="merge-mode"
                    checked={isMergedMode}
                    onCheckedChange={(checked) => {
                      setIsMergedMode(checked);
                      setIsSalesDetectionEnabled(false);
                      setIsProductDetectionEnabled(false);
                      setSelectedSkusForSync(new Set());
                    }}
                  />
                  <Label htmlFor="merge-mode" className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    合并仓库数据
                  </Label>
                </div>
                <div className="text-sm text-muted-foreground">
                  开启后将相同SKU的不同仓库数据合并统计
                </div>
              </div>

              {/* 筛选条件行 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="sku-filter">SKU筛选</Label>
                  <Input
                    id="sku-filter"
                    placeholder="输入SKU前缀，如：JNR,FL,FX"
                    value={skuFilters}
                    onChange={(e) => handleSkuFilterChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="warehouse-filter">仓库筛选</Label>
                  <Select 
                    value={warehouseFilter} 
                    onValueChange={handleWarehouseFilterChange}
                    disabled={isMergedMode}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={isMergedMode ? "合并模式下不可用" : "选择仓库"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部仓库</SelectItem>
                      {getWarehouseOptions().map(warehouse => (
                        <SelectItem key={warehouse} value={warehouse}>
                          {warehouse}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="category-filter">一级品类筛选</Label>
                  <Select value={categoryFilter} onValueChange={handleCategoryFilterChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="选择品类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部品类</SelectItem>
                      {getCategoryOptions().map(category => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 销量检测筛选区域 */}
              <div className="p-4 bg-blue-50 rounded-lg space-y-4">
                <h3 className="text-sm font-medium text-gray-700">销量检测设置</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">订单状态</Label>
                    <div className="mt-2 space-y-2">
                      {[
                        { id: 'completed', label: '已完成' },
                        { id: 'processing', label: '处理中' },
                        { id: 'pending', label: '待付款' },
                        { id: 'on-hold', label: '暂停' },
                        { id: 'cancelled', label: '已取消' },
                        { id: 'refunded', label: '已退款' },
                        { id: 'failed', label: '失败' },
                      ].map(status => (
                        <div key={status.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={status.id}
                            checked={salesOrderStatuses.includes(status.id)}
                            onCheckedChange={(checked) => handleOrderStatusChange(status.id, checked as boolean)}
                          />
                          <Label htmlFor={status.id} className="text-sm">{status.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">时间范围</Label>
                    <div className="mt-2 space-y-2">
                      <div>
                        <Label htmlFor="start-date" className="text-xs text-gray-500">开始日期</Label>
                        <Input
                          id="start-date"
                          type="date"
                          value={salesDateRange.start}
                          onChange={(e) => setSalesDateRange(prev => ({ ...prev, start: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="end-date" className="text-xs text-gray-500">结束日期</Label>
                        <Input
                          id="end-date"
                          type="date"
                          value={salesDateRange.end}
                          onChange={(e) => setSalesDateRange(prev => ({ ...prev, end: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSalesDateRange({ start: '', end: '' })}
                      >
                        清除时间筛选
                      </Button>
                    </div>
                  </div>
                </div>
              </div>



              {/* 操作按钮行 */}
              <div className="flex items-center gap-4">
						<Button 
                  onClick={clearFilters}
							variant="outline"
                  disabled={!skuFilters && !warehouseFilter && !categoryFilter}
						>
                  <Filter className="h-4 w-4 mr-2" />
                  清空筛选
						</Button>
						<Button 
                  onClick={exportFilteredData}
							variant="outline"
                  disabled={filteredData.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  导出CSV
                </Button>
                <Button 
                  onClick={exportToExcel}
                  variant="outline"
                  disabled={filteredData.length === 0}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  导出Excel
                </Button>
                <Button 
                  onClick={handleSalesDetection}
                  variant="default"
                  disabled={filteredData.length === 0 || isSalesLoading}
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {isSalesLoading ? (salesDetectionProgress || '检测中...') : '销量检测'}
                </Button>
                <Dialog open={isWarehouseDialogOpen} onOpenChange={setIsWarehouseDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="secondary"
                      disabled={filteredData.length === 0 || isLoading}
                    >
                      <Truck className="h-4 w-4 mr-2" />
                      {isLoading ? '上传中...' : '在途检测'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>在途检测 - 选择入库仓库</DialogTitle>
                      <DialogDescription>
                        请选择在途订单的目标入库仓库，在途数量只会添加到选择的仓库数据中。
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="warehouse-select">目标仓库</Label>
                        <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="请选择仓库" />
                          </SelectTrigger>
                          <SelectContent>
                            {getWarehouseOptions().map(warehouse => (
                              <SelectItem key={warehouse} value={warehouse}>
                                {warehouse}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {selectedWarehouse && (
                        <div>
                          <Label>在途订单文件</Label>
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                ref={transitFileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleTransitOrderUpload}
                                disabled={isLoading}
                                className="flex-1"
                              />
                              <Button 
                                onClick={() => transitFileInputRef.current?.click()}
                                disabled={isLoading}
                                variant="outline"
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                {isLoading ? '上传中...' : '选择文件'}
                              </Button>
                            </div>
                            <p className="text-xs text-gray-500">
                              支持Excel格式（.xlsx或.xls），包含产品型号、产品英文名称、数量三列
                            </p>
                            <a
                              href="/在途模板.csv"
                              download="在途模板.csv"
                              className="text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                              下载模板文件
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
                {transitOrders.length > 0 && (
                  <Button 
                    variant="outline"
                    onClick={() => {
                      clearTransitOrders();
                      setSelectedWarehouse('');
                      if (transitFileInputRef.current) {
                        transitFileInputRef.current.value = '';
                      }
                      // 重新计算库存数据
                      updateInventoryWithTransitData([]);
                      toast.success('在途数据已清空');
                    }}
                  >
                    清空在途数据
                  </Button>
                )}
                <Button 
                  onClick={handleProductDetection}
                  variant="secondary"
                  disabled={filteredData.length === 0 || isProductLoading}
                >
                  <Package className="h-4 w-4 mr-2" />
                  {isProductLoading ? (productDetectionProgress || '检测中...') : '上架检测'}
                </Button>
                <Button onClick={clearData} variant="outline">
                  <Trash2 className="h-4 w-4 mr-2" />
                  清空数据
						</Button>
					</div>
            </div>
            
                          <div className="flex gap-4 text-sm">
                <Badge variant="outline">总数据: {inventoryData.length}</Badge>
                <Badge variant="secondary">筛选结果: {filteredData.length}</Badge>
                {transitOrders.length > 0 && (
                  <Badge variant="default" className="bg-green-600">
                    在途订单: {transitOrders.length}条 ({new Set(transitOrders.map(item => item.产品型号)).size}个SKU) - {selectedWarehouse || '未指定仓库'}
                  </Badge>
                )}
                {isMergedMode && <Badge variant="destructive">合并仓库模式</Badge>}
                {isSalesDetectionEnabled && <Badge variant="default">已启用销量检测</Badge>}
                {isProductDetectionEnabled && <Badge variant="secondary">已启用上架检测</Badge>}
                {isSalesDetectionEnabled && <Badge variant="outline">状态: {salesOrderStatuses.join(',')}</Badge>}
                {isSalesDetectionEnabled && (salesDateRange.start || salesDateRange.end) && (
                  <Badge variant="outline">
                    时间: {salesDateRange.start || '开始'} 至 {salesDateRange.end || '结束'}
                  </Badge>
                )}
                {skuFilters && <Badge variant="default">SKU: {skuFilters}</Badge>}
                {!isMergedMode && warehouseFilter && warehouseFilter !== 'all' && <Badge variant="default">仓库: {warehouseFilter}</Badge>}
                {categoryFilter && categoryFilter !== 'all' && <Badge variant="default">品类: {categoryFilter}</Badge>}
              </div>
          </CardContent>
        </Card>
      )}

      {/* 数据表格 */}
      {filteredData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>库存数据表格</CardTitle>
            <CardDescription>
              显示 {filteredData.length} 条数据 
              {transitOrders.length > 0 && '（已包含在途订单数据）'}
              {isSalesDetectionEnabled && `（已包含销量数据: ${salesOrderStatuses.join(',')}）`}
              {isProductDetectionEnabled && '（已包含上架数据）'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>产品代码</TableHead>
                    <TableHead>产品英文名称</TableHead>
                    <TableHead>可售库存</TableHead>
                    <TableHead>净可售库存</TableHead>
                    <TableHead>在途数量</TableHead>
                    <TableHead>在途库存</TableHead>
                    {isSalesDetectionEnabled && <TableHead>预测数量（在途）</TableHead>}
                    <TableHead>缺货天数</TableHead>
                    <TableHead>仓库</TableHead>
                    <TableHead>一级品类</TableHead>
                    {isSalesDetectionEnabled && (
                      <>
                        <TableHead>订单数</TableHead>
                        <TableHead>销售数量</TableHead>
                        <TableHead>30天订单数</TableHead>
                        <TableHead>30天销售数量</TableHead>
                      </>
                    )}
                    {isProductDetectionEnabled && (
                      <>
                        <TableHead>上架状态</TableHead>
                        <TableHead>库存状态</TableHead>
                        <TableHead>库存同步</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item, index) => {
                    const netStock = calculateNetStock(item);
                    const sales30d = item.salesData?.salesQuantity30d || 0;
                    const transitStock = item.在途库存 || netStock;
                    const predictedTransitQuantity = transitStock - sales30d;
                    const isTransitStockInsufficient = isSalesDetectionEnabled && sales30d > transitStock;
                    const sku = getFieldValue(item, '产品代码');
                    const syncRecommendation = getSyncRecommendation(item);
                    const isSkuSelected = selectedSkusForSync.has(sku);
                    const isSkuSyncing = syncingSkus.has(sku);
                    
                    return (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{getFieldValue(item, '产品代码')}</TableCell>
                        <TableCell>{getFieldValue(item, '产品英文名称')}</TableCell>
                        <TableCell>{getFieldValue(item, '可售库存')}</TableCell>
                        <TableCell>
                          <Badge variant={netStock < 0 ? 'destructive' : netStock === 0 ? 'secondary' : 'outline'}>
                            {netStock}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.在途数量 < 0 ? 'destructive' : item.在途数量 === 0 ? 'secondary' : 'outline'}>
                            {item.在途数量 || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            transitStock < 0 ? 'destructive' : 
                            transitStock === 0 ? 'secondary' : 
                            isTransitStockInsufficient ? 'destructive' : 'outline'
                          }>
                            {transitStock}
                          </Badge>
                        </TableCell>
                        {isSalesDetectionEnabled && (
                          <TableCell>
                            <Badge variant={predictedTransitQuantity < 0 ? 'destructive' : predictedTransitQuantity === 0 ? 'secondary' : 'outline'}>
                              {predictedTransitQuantity}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell>{getFieldValue(item, '缺货天数') || '0'}</TableCell>
                        <TableCell>{getFieldValue(item, '仓库')}</TableCell>
                        <TableCell>{getFieldValue(item, '一级品类')}</TableCell>
                        {isSalesDetectionEnabled && (
                          <>
                            <TableCell>
                              <Badge variant={item.salesData?.orderCount ? 'default' : 'secondary'}>
                                {item.salesData?.orderCount || 0}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.salesData?.salesQuantity ? 'default' : 'secondary'}>
                                {item.salesData?.salesQuantity || 0}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.salesData?.orderCount30d ? 'default' : 'secondary'}>
                                {item.salesData?.orderCount30d || 0}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.salesData?.salesQuantity30d ? 'default' : 'secondary'}>
                                {item.salesData?.salesQuantity30d || 0}
                              </Badge>
                            </TableCell>
                          </>
                        )}
                        {isProductDetectionEnabled && (
                          <>
                            <TableCell>
                              <Badge variant={item.productData?.isOnline ? 'default' : 'destructive'}>
                                {item.productData?.isOnline ? '已上架' : '未上架'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                item.productData?.stockStatus === 'instock' ? 'default' : 
                                item.productData?.stockStatus === 'onbackorder' ? 'destructive' : 'destructive'
                              }>
                                {item.productData?.stockStatus === 'instock' ? '有货' : 
                                 item.productData?.stockStatus === 'onbackorder' ? '缺货' : '无货'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={isSkuSelected}
                                  onCheckedChange={(checked) => handleSkuSelectionChange(sku, checked as boolean)}
                                  disabled={isSkuSyncing}
                                />
                                <Button
                                  size="sm"
                                  variant={
                                    syncRecommendation.type === 'to-outofstock' ? 'destructive' : 
                                    syncRecommendation.type === 'to-instock' ? 'default' : 'outline'
                                  }
                                  onClick={() => {
                                    const currentStatus = item.productData?.stockStatus || 'outofstock';
                                    const newStatus = currentStatus === 'instock' ? 'outofstock' : 'instock';
                                    syncSingleSku(sku, newStatus);
                                  }}
                                  disabled={isSkuSyncing}
                                  title={syncRecommendation.reason}
                                >
                                  {isSkuSyncing ? (
                                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                  ) : (
                                    <>
                                      {item.productData?.stockStatus === 'instock' ? '同步无货' : '同步有货'}
                                    </>
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {/* 批量同步按钮 */}
            {isProductDetectionEnabled && (
              <div className="mt-4 flex items-center gap-4">
                <Button
                  onClick={syncMultipleSkus}
                  disabled={selectedSkusForSync.size === 0 || syncingSkus.size > 0}
                  className="flex items-center gap-2"
                >
                  {syncingSkus.size > 0 ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      批量同步中...
                    </>
                  ) : (
                    <>
                      <Package className="h-4 w-4" />
                      批量切换库存状态 ({selectedSkusForSync.size})
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedSkusForSync(new Set())}
                  disabled={selectedSkusForSync.size === 0}
                >
                  清空选择
                </Button>
                <div className="text-sm text-muted-foreground">
                  已选择 {selectedSkusForSync.size} 个SKU，将切换为相反状态
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 空状态 */}
      {inventoryData.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无数据</h3>
            <p className="text-muted-foreground text-center">
              请上传CSV文件开始分析库存数据
            </p>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="sales" className="space-y-6">
          <SalesAnalysis />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Sales Analysis Component
function SalesAnalysis() {
  const {
    settings,
    setSettings,
    orders,
    salesAnalysis,
    isLoadingOrders,
    fetchOrders,
  } = useWooCommerceStore();

  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['completed']);
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0] || '';
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0] || '';
  });

  const orderStatuses = [
    { id: 'pending', label: '等待付款', color: 'bg-yellow-500' },
    { id: 'processing', label: '处理中', color: 'bg-blue-500' },
    { id: 'on-hold', label: '暂停', color: 'bg-orange-500' },
    { id: 'completed', label: '已完成', color: 'bg-green-500' },
    { id: 'cancelled', label: '已取消', color: 'bg-red-500' },
    { id: 'refunded', label: '已退款', color: 'bg-purple-500' },
    { id: 'failed', label: '失败', color: 'bg-gray-500' },
  ];

  const handleFetchOrders = async () => {
    try {
      await fetchOrders({
        status: selectedStatuses,
        startDate,
        endDate,
      });
      toast.success(`成功获取 ${orders.length} 个订单数据`);
    } catch (error) {
      toast.error('获取订单数据失败，请检查网站设置和网络连接');
    }
  };

  const handleStatusChange = (statusId: string, checked: boolean) => {
    if (checked) {
      setSelectedStatuses([...selectedStatuses, statusId]);
    } else {
      setSelectedStatuses(selectedStatuses.filter(id => id !== statusId));
    }
  };

  return (
    <>
      {/* WooCommerce设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            WooCommerce网站设置
          </CardTitle>
          <CardDescription>
            配置WooCommerce API连接设置
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="site-url">网站URL</Label>
                <Input
                  id="site-url"
                  value={settings.siteUrl}
                  onChange={(e) => setSettings({ ...settings, siteUrl: e.target.value })}
                  placeholder="https://yoursite.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="consumer-key">Consumer Key</Label>
                <Input
                  id="consumer-key"
                  value={settings.consumerKey}
                  onChange={(e) => setSettings({ ...settings, consumerKey: e.target.value })}
                  placeholder="ck_..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="consumer-secret">Consumer Secret</Label>
                <Input
                  id="consumer-secret"
                  type="password"
                  value={settings.consumerSecret}
                  onChange={(e) => setSettings({ ...settings, consumerSecret: e.target.value })}
                  placeholder="cs_..."
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button 
                onClick={() => {
                  // 验证配置是否完整
                  if (!settings.siteUrl || !settings.consumerKey || !settings.consumerSecret) {
                    toast.error('请填写完整的配置信息');
                    return;
                  }
                  
                  // 验证网站URL格式
                  if (!settings.siteUrl.startsWith('http://') && !settings.siteUrl.startsWith('https://')) {
                    toast.error('网站URL必须以http://或https://开头');
                    return;
                  }
                  
                  // 配置已经自动保存到zustand store中
                  toast.success('配置已保存并验证通过');
                }}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                保存配置
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 订单筛选条件 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            订单筛选条件
          </CardTitle>
          <CardDescription>
            选择要分析的订单状态和时间范围
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* 订单状态选择 */}
            <div>
              <Label>订单状态（多选）</Label>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                {orderStatuses.map((status) => (
                  <div key={status.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={status.id}
                      checked={selectedStatuses.includes(status.id)}
                      onCheckedChange={(checked) => handleStatusChange(status.id, !!checked)}
                    />
                    <Label htmlFor={status.id} className="flex items-center gap-2 cursor-pointer">
                      <div className={`w-3 h-3 rounded-full ${status.color}`}></div>
                      {status.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* 时间范围选择 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start-date">开始日期</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="end-date">结束日期</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-4">
              <Button
                onClick={handleFetchOrders}
                disabled={isLoadingOrders || selectedStatuses.length === 0}
                className="flex items-center gap-2"
              >
                {isLoadingOrders ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    获取中...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    获取订单数据
                  </>
                )}
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                已选择 {selectedStatuses.length} 个状态
					</div>
				</div>
			</div>
        </CardContent>
      </Card>

      {/* 销量分析结果 */}
      {salesAnalysis && (
        <>
          {/* 销量概览 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">总订单数</p>
                    <p className="text-2xl font-bold">{salesAnalysis.totalOrders}</p>
                  </div>
                  <Package className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">总销售额</p>
                    <p className="text-2xl font-bold">€{salesAnalysis.totalRevenue.toFixed(2)}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">平均订单价值</p>
                    <p className="text-2xl font-bold">€{salesAnalysis.averageOrderValue.toFixed(2)}</p>
                  </div>
                  <Calendar className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">热销产品数</p>
                    <p className="text-2xl font-bold">{salesAnalysis.topProducts.length}</p>
                  </div>
                  <Search className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 订单状态分布 */}
          <Card>
            <CardHeader>
              <CardTitle>订单状态分布</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(salesAnalysis.ordersByStatus).map(([status, count]) => {
                  const statusInfo = orderStatuses.find(s => s.id === status);
                  return (
                    <div key={status} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className={`w-4 h-4 rounded-full ${statusInfo?.color || 'bg-gray-400'}`}></div>
                      <div>
                        <p className="font-medium">{statusInfo?.label || status}</p>
                        <p className="text-sm text-muted-foreground">{count} 个订单</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 热销产品排行 */}
          <Card>
            <CardHeader>
              <CardTitle>热销产品排行 TOP 10</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>排名</TableHead>
                      <TableHead>产品SKU</TableHead>
                      <TableHead>产品名称</TableHead>
                      <TableHead>销售数量</TableHead>
                      <TableHead>销售额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesAnalysis.topProducts.map((product, index) => (
                      <TableRow key={product.sku}>
                        <TableCell>
                          <Badge variant={index < 3 ? 'destructive' : 'outline'}>
                            #{index + 1}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{product.sku}</TableCell>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>{product.quantity}</TableCell>
                        <TableCell>€{product.revenue.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* 订单列表 */}
      {orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>订单详情列表</CardTitle>
            <CardDescription>
              显示 {orders.length} 个订单
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>订单号</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>客户</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>订单金额</TableHead>
                    <TableHead>商品数量</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.slice(0, 50).map((order) => {
                    const statusInfo = orderStatuses.find(s => s.id === order.status);
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">#{order.id}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="flex items-center gap-2 w-fit">
                            <div className={`w-2 h-2 rounded-full ${statusInfo?.color || 'bg-gray-400'}`}></div>
                            {statusInfo?.label || order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {order.billing.first_name} {order.billing.last_name}
                        </TableCell>
                        <TableCell>
                          {new Date(order.date_created).toLocaleDateString('zh-CN')}
                        </TableCell>
                        <TableCell>€{order.total}</TableCell>
                        <TableCell>{order.line_items.length} 个商品</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {orders.length > 50 && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                显示前50个订单，共{orders.length}个订单
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
