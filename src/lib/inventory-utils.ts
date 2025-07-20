import { toast } from 'sonner';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import * as XLSX from 'xlsx';

export interface InventoryItem {
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

export interface TransitOrderItem {
  产品型号: string;
  产品英文名称: string;
  数量: number;
}

// 计算净可售库存
export const calculateNetStock = (item: InventoryItem): number => {
  const netStock = Number(item['可售库存减去缺货占用库存']) || 0;
  return netStock;
};

// 获取库存状态颜色
export const getStockStatusColor = (netStock: number): string => {
  if (netStock > 0) return 'text-green-600';
  if (netStock === 0) return 'text-yellow-600';
  return 'text-red-600';
};

// 获取同步按钮颜色
export const getSyncButtonColor = (isOnline: boolean, netStock: number): string => {
  if (isOnline && netStock <= 0) return 'destructive'; // 红色 - 有货但净库存<=0
  if (!isOnline && netStock > 0) return 'default'; // 蓝色 - 无货但净库存>0
  return 'secondary'; // 灰色 - 状态正常
};

// 获取同步按钮文本
export const getSyncButtonText = (isOnline: boolean, netStock: number): string => {
  if (isOnline && netStock <= 0) return '同步为无货';
  if (!isOnline && netStock > 0) return '同步为有货';
  return isOnline ? '同步为无货' : '同步为有货';
};

// 合并仓库数据
export const mergeWarehouseData = (data: InventoryItem[], getTransitQuantityBySku: (sku: string) => number): InventoryItem[] => {
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
    if (items.length === 0) return;
    
    const firstItem = items[0];
    if (!firstItem) return;
    
    if (items.length === 1) {
      // 只有一个仓库的数据
      const 在途数量 = getTransitQuantityBySku(sku);
      const 净可售库存 = calculateNetStock(firstItem);
      merged.push({
        ...firstItem,
        在途数量: 在途数量,
        在途库存: 净可售库存 + 在途数量,
      });
    } else {
      // 多个仓库的数据，需要合并
      const warehouses = items.map(item => item.仓库).filter(w => w).join(', ');
      
      const itemWithProductData = items.find(item => item.productData);
      const itemWithSalesData = items.find(item => item.salesData);
      
      const 在途数量 = getTransitQuantityBySku(sku);
      const 合并净可售库存 = items.reduce((sum, item) => sum + calculateNetStock(item), 0);
      
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
        '可售库存减去缺货占用库存': String(合并净可售库存),
        待出库: String(items.reduce((sum, item) => sum + (Number(item.待出库) || 0), 0)),
        '不良品 ': String(items.reduce((sum, item) => sum + (Number(item['不良品 ']) || 0), 0)),
        不良品待出库: String(items.reduce((sum, item) => sum + (Number(item.不良品待出库) || 0), 0)),
        预警库存: String(items.reduce((sum, item) => sum + (Number(item.预警库存) || 0), 0)),
        缺货: String(items.reduce((sum, item) => sum + (Number(item.缺货) || 0), 0)),
        缺货天数: String(Math.max(...items.map(item => Number(item.缺货天数) || 0))),
        缺货订单所占可售库存: String(items.reduce((sum, item) => sum + (Number(item.缺货订单所占可售库存) || 0), 0)),
        可售天数: firstItem.可售天数,
        可售总库存: String(items.reduce((sum, item) => sum + (Number(item.可售总库存) || 0), 0)),
        // 保留已有的检测数据
        productData: itemWithProductData?.productData,
        salesData: itemWithSalesData?.salesData,
        // 在途数据
        在途数量: 在途数量,
        在途库存: 合并净可售库存 + 在途数量,
      };
      
      merged.push(mergedItem);
    }
  });
  
  return merged;
};

// 解析CSV文件
export const parseCSVFile = (file: File): Promise<{ data: any[], headers: string[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        let text: string;
        
        // 尝试使用GB2312编码解析
        try {
          text = iconv.decode(Buffer.from(arrayBuffer), 'gb2312');
        } catch (gbError) {
          // 如果GB2312失败，尝试UTF-8
          text = new TextDecoder('utf-8').decode(arrayBuffer);
        }
        
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(),
          complete: (result) => {
            if (result.errors.length > 0) {
              console.warn('CSV解析警告:', result.errors);
            }
            
            const data = result.data as any[];
            const headers = result.meta.fields || [];
            
            resolve({ data, headers });
          },
          error: (error: any) => {
            reject(new Error(`CSV解析失败: ${error.message}`));
          }
        });
      } catch (error: any) {
        reject(new Error(`文件读取失败: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// 解析Excel文件
export const parseExcelFile = (file: File): Promise<TransitOrderItem[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        
        if (!firstSheetName) {
          reject(new Error('Excel文件为空'));
          return;
        }
        
        const worksheet = workbook.Sheets[firstSheetName];
        if (!worksheet) {
          reject(new Error('无法读取Excel工作表'));
          return;
        }
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (jsonData.length < 2) {
          reject(new Error('Excel文件格式不正确，至少需要包含标题行和数据行'));
          return;
        }
        
        const headers = jsonData[0] as string[];
        const dataRows = jsonData.slice(1);
        
        // 查找列索引
        const productCodeIndex = headers.findIndex(h => 
          h && (h.includes('产品型号') || h.includes('型号') || h.includes('SKU'))
        );
        const productNameIndex = headers.findIndex(h => 
          h && (h.includes('产品英文名称') || h.includes('英文名称') || h.includes('名称'))
        );
        const quantityIndex = headers.findIndex(h => 
          h && (h.includes('数量') || h.includes('Quantity'))
        );
        
        if (productCodeIndex === -1 || quantityIndex === -1) {
          reject(new Error('Excel文件必须包含"产品型号"和"数量"列'));
          return;
        }
        
        const transitOrders: TransitOrderItem[] = dataRows
          .filter(row => row[productCodeIndex] && row[quantityIndex])
          .map(row => ({
            产品型号: String(row[productCodeIndex] || '').trim(),
            产品英文名称: String(row[productNameIndex] || '').trim(),
            数量: Number(row[quantityIndex]) || 0,
          }))
          .filter(item => item.产品型号 && item.数量 > 0);
        
        resolve(transitOrders);
      } catch (error: any) {
        reject(new Error(`Excel解析失败: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// 导出Excel文件
export const exportToExcel = (data: InventoryItem[], fileName: string = '库存分析结果.xlsx') => {
  try {
    // 准备导出数据
    const exportData = data.map(item => {
      const 净可售库存 = calculateNetStock(item);
      const sales30d = item.salesData?.salesQuantity30d || 0;
      const transitStock = item.在途库存 || 净可售库存;
      const predictedTransitQuantity = transitStock - sales30d;
      
      return {
        产品代码: item.产品代码,
        产品名称: item.产品名称,
        产品英文名称: item.产品英文名称,
        仓库: item.仓库,
        可售库存: item.可售库存,
        净可售库存: 净可售库存,
        在途数量: item.在途数量 || 0,
        在途库存: item.在途库存 || 净可售库存,
        一级品类: item.一级品类,
        二级品类: item.二级品类,
        三级品类: item.三级品类,
        销售状态: item.销售状态,
        // 销量数据
        '订单数': item.salesData?.orderCount || '',
        '销售数量': item.salesData?.salesQuantity || '',
        '30天订单数': item.salesData?.orderCount30d || '',
        '30天销售数量': item.salesData?.salesQuantity30d || '',
        '预测库存（在途）': item.salesData ? predictedTransitQuantity : '',
        // 上架状态
        '上架状态': item.productData?.isOnline ? '已上架' : '未上架',
        '库存状态': item.productData?.stockStatus || '',
        // 其他字段
        规格: item.规格,
        预警库存: item.预警库存,
        可售天数: item.可售天数,
        销售负责人: item.销售负责人,
        默认采购员: item.默认采购员,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '库存分析');
    
    XLSX.writeFile(workbook, fileName);
    toast.success(`已导出 ${data.length} 条记录到 ${fileName}`);
  } catch (error) {
    console.error('导出失败:', error);
    toast.error('导出失败，请重试');
  }
};

// 数据筛选函数
export const filterInventoryData = (
  data: InventoryItem[],
  filters: {
    skuFilters: string;
    warehouseFilter: string;
    categoryFilter: string;
    hideZeroStock?: boolean;
    hideNormalStatus?: boolean;
  }
): InventoryItem[] => {
  const { skuFilters, warehouseFilter, categoryFilter, hideZeroStock = false, hideNormalStatus = false } = filters;
  
  return data.filter(item => {
    // SKU筛选
    if (skuFilters.trim()) {
      const skuList = skuFilters.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
      const matchesSku = skuList.some(sku => 
        item.产品代码.toLowerCase().includes(sku.toLowerCase()) ||
        item.产品名称.toLowerCase().includes(sku.toLowerCase()) ||
        item.产品英文名称.toLowerCase().includes(sku.toLowerCase())
      );
      if (!matchesSku) return false;
    }
    
    // 仓库筛选
    if (warehouseFilter.trim()) {
      if (!item.仓库.toLowerCase().includes(warehouseFilter.toLowerCase())) {
        return false;
      }
    }
    
    // 品类筛选
    if (categoryFilter.trim() && categoryFilter !== '全部') {
      const matchesCategory = 
        item.一级品类.toLowerCase().includes(categoryFilter.toLowerCase()) ||
        item.二级品类.toLowerCase().includes(categoryFilter.toLowerCase()) ||
        item.三级品类.toLowerCase().includes(categoryFilter.toLowerCase());
      if (!matchesCategory) return false;
    }
    
    // 隐藏零库存
    if (hideZeroStock) {
      const netStock = calculateNetStock(item);
      if (netStock <= 0) return false;
    }
    
    // 隐藏状态正常的商品（同步状态检测）
    if (hideNormalStatus && item.productData) {
      const netStock = calculateNetStock(item);
      const isOnline = item.productData.isOnline;
      
      // 状态正常的情况：
      // 1. 有库存且已上架
      // 2. 无库存且未上架
      const isNormalStatus = (netStock > 0 && isOnline) || (netStock <= 0 && !isOnline);
      if (isNormalStatus) return false;
    }
    
    return true;
  });
};