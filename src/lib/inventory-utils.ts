import type { SortConfig } from '@/store/inventory';
import iconv from 'iconv-lite';
import Papa from 'papaparse';
import { toast } from 'sonner';
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
  // 仓库明细（合并模式下使用）
  warehouseDetails?: Array<{
    warehouse: string;
    sellableStock: number;
    netStock: number;
  }>;
  [key: string]: string | any;
}

export interface TransitOrderItem {
  产品型号: string;
  产品英文名称: string;
  数量: number;
}

// 计算净可售库存
export const calculateNetStock = (item: InventoryItem): number => {
  const 可售库存 = Number(item.可售库存) || 0;
  const 缺货 = Number(item.缺货) || 0;
  const netStock = 可售库存 - 缺货;
  return netStock;
};

// 获取库存状态颜色
export const getStockStatusColor = (netStock: number): string => {
  if (netStock > 0) return 'text-green-600';
  if (netStock === 0) return 'text-yellow-600';
  return 'text-red-600';
};

// 获取同步按钮颜色（基于库存状态和净库存判断）
export const getSyncButtonColor = (isOnline: boolean, netStock: number, stockStatus?: string): string => {
  // 如果有库存状态信息，基于库存状态判断
  if (stockStatus) {
    if (stockStatus === 'instock' && netStock <= 0) return 'destructive'; // 红色 - 显示有货但净库存<=0
    if (stockStatus === 'outofstock' && netStock > 0) return 'default'; // 蓝色 - 显示无货但净库存>0
    return 'secondary'; // 灰色 - 状态正常
  }
  
  // 兼容旧逻辑（基于上架状态）
  if (isOnline && netStock <= 0) return 'destructive';
  if (!isOnline && netStock > 0) return 'default';
  return 'secondary';
};

// 获取同步按钮文本（基于当前库存状态显示切换操作）
export const getSyncButtonText = (isOnline: boolean, netStock: number, currentStockStatus?: string): string => {
  // 如果有当前库存状态，显示切换操作
  if (currentStockStatus) {
    return currentStockStatus === 'instock' ? '同步为无货' : '同步为有货';
  }
  
  // 兼容旧的逻辑（基于建议）
  if (isOnline && netStock <= 0) return '同步为无货';
  if (!isOnline && netStock > 0) return '同步为有货';
  return isOnline ? '同步为无货' : '同步为有货';
};

// 在合并前过滤掉要排除的仓库
export const filterWarehousesBeforeMerge = (data: InventoryItem[], excludeWarehouses: string): InventoryItem[] => {
  if (!excludeWarehouses || !excludeWarehouses.trim()) {
    return data;
  }
  
  // 解析要排除的仓库列表（支持逗号分隔）
  const warehousesToExclude = excludeWarehouses
    .split(/[,，]/)
    .map(w => w.trim())
    .filter(w => w)
    .map(w => w.toLowerCase());
  
  if (warehousesToExclude.length === 0) {
    return data;
  }
  
  // 过滤掉要排除的仓库
  return data.filter(item => {
    const warehouseLower = item.仓库.toLowerCase();
    // 使用包含匹配，支持部分匹配
    return !warehousesToExclude.some(excluded => 
      warehouseLower.includes(excluded)
    );
  });
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
      // 只有一个仓库的数据，也添加warehouseDetails以支持tooltip显示
      const 在途数量 = getTransitQuantityBySku(sku);
      const 净可售库存 = calculateNetStock(firstItem);
      merged.push({
        ...firstItem,
        在途数量: 在途数量,
        在途库存: 净可售库存 + 在途数量,
        warehouseDetails: [{
          warehouse: firstItem.仓库,
          sellableStock: Number(firstItem.可售库存) || 0,
          netStock: 净可售库存
        }]
      });
    } else {
      // 多个仓库的数据，需要合并
      const warehouseList = items.map(item => item.仓库).filter(w => w);
      const warehouseCount = warehouseList.length;
      
      // 生成仓库明细
      const warehouseDetails = items.map(item => ({
        warehouse: item.仓库,
        sellableStock: Number(item.可售库存) || 0,
        netStock: calculateNetStock(item)
      }));
      
      // 优化仓库显示：超过3个仓库时简化显示
      let warehouseDisplay: string;
      if (warehouseCount <= 3) {
        warehouseDisplay = `多仓库 (${warehouseList.join(', ')})`;
      } else {
        const firstTwo = warehouseList.slice(0, 2).join(', ');
        warehouseDisplay = `多仓库 (${firstTwo} 等${warehouseCount}个)`;
      }
      
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
        仓库: warehouseDisplay,
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
        // 仓库明细
        warehouseDetails: warehouseDetails,
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

// 解析Excel文件的预览数据
export const parseExcelPreview = (file: File): Promise<{ headers: string[], rows: any[][], fileName: string }> => {
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
        
        const headers = (jsonData[0] as string[]).map((h, index) => h || `列${index + 1}`);
        const rows = jsonData.slice(1, 6); // 只返回前5行作为预览
        
        resolve({ headers, rows, fileName: file.name });
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

// 解析Excel文件（支持自定义列映射）
export const parseExcelFile = (file: File, columnMapping?: { skuColumn: number, quantityColumn: number, nameColumn?: number }): Promise<TransitOrderItem[]> => {
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
        
        let productCodeIndex: number;
        let quantityIndex: number;
        let productNameIndex: number;
        
        if (columnMapping) {
          // 使用用户指定的列映射
          productCodeIndex = columnMapping.skuColumn;
          quantityIndex = columnMapping.quantityColumn;
          productNameIndex = columnMapping.nameColumn ?? -1;
        } else {
          // 尝试自动检测列
          productCodeIndex = headers.findIndex(h => 
            h && (h.includes('产品型号') || h.includes('型号') || h.includes('SKU') || h.includes('sku'))
          );
          productNameIndex = headers.findIndex(h => 
            h && (h.includes('产品英文名称') || h.includes('英文名称') || h.includes('名称') || h.includes('name'))
          );
          quantityIndex = headers.findIndex(h => 
            h && (h.includes('数量') || h.includes('Quantity') || h.includes('quantity') || h.includes('qty'))
          );
          
          // 如果找不到，尝试查找包含类似vxe-cell--label的列
          if (productCodeIndex === -1 && quantityIndex === -1) {
            // 假设第一列是SKU，最后一个数字列是数量
            productCodeIndex = 0;
            
            // 从后往前找第一个包含数字的列作为数量列
            for (let i = headers.length - 1; i >= 0; i--) {
              const hasNumber = dataRows.some(row => {
                const value = row[i];
                return value !== undefined && value !== null && !Number.isNaN(Number(value));
              });
              if (hasNumber) {
                quantityIndex = i;
                break;
              }
            }
          }
        }
        
        if (productCodeIndex === -1 || quantityIndex === -1) {
          // 返回错误信息，包含列信息以帮助用户选择
          reject(new Error(`无法自动识别列。请手动指定列映射。\n找到的列: ${headers.join(', ')}`));
          return;
        }
        
        const transitOrders: TransitOrderItem[] = dataRows
          .filter(row => row[productCodeIndex] && row[quantityIndex])
          .map(row => {
            // 处理数量字段，支持文本类型
            let quantity = 0;
            const quantityValue = row[quantityIndex];
            if (quantityValue !== undefined && quantityValue !== null) {
              // 转换为字符串并去除空格
              const quantityStr = String(quantityValue).trim();
              // 去除可能的千分位分隔符
              const cleanedStr = quantityStr.replace(/,/g, '');
              // 尝试转换为数字
              const parsed = Number(cleanedStr);
              if (!Number.isNaN(parsed)) {
                quantity = parsed;
              }
            }
            
            return {
              产品型号: String(row[productCodeIndex] || '').trim(),
              产品英文名称: productNameIndex >= 0 ? String(row[productNameIndex] || '').trim() : '',
              数量: quantity,
            };
          })
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
export const exportToExcel = (data: InventoryItem[], fileName = '库存分析结果.xlsx') => {
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
    
    // 生成采购建议数据
    const purchaseSuggestions = data
      .filter(item => {
        const netStock = calculateNetStock(item);
        const transitStock = item.在途库存 || netStock;
        const sales30d = item.salesData?.salesQuantity30d || 0;
        const predictedTransitQuantity = transitStock - sales30d;
        
        // 紧急补货：在途库存<=0 且 30天销售数量>=5
        // 一般补货：预测库存（在途）<0
        return (transitStock <= 0 && sales30d >= 5) || predictedTransitQuantity < 0;
      })
      .map(item => {
        const netStock = calculateNetStock(item);
        const transitStock = item.在途库存 || netStock;
        const sales30d = item.salesData?.salesQuantity30d || 0;
        const predictedTransitQuantity = transitStock - sales30d;
        
        // 判断预警级别
        let 预警 = '';
        let 建议数量 = 0;
        
        if (transitStock <= 0 && sales30d >= 5) {
          预警 = '紧急补货';
          // 紧急补货：建议数量为30天销量的2倍
          建议数量 = Math.ceil(sales30d * 2);
        } else if (predictedTransitQuantity < 0) {
          预警 = '一般补货';
          // 一般补货：建议数量为30天销量的1.5倍，最少10个
          建议数量 = Math.max(10, Math.ceil(sales30d * 1.5));
        }
        
        return {
          预警: 预警,
          一级品类: item.一级品类,
          产品代码: item.产品代码,
          产品名称: item.产品名称,
          产品英文名称: item.产品英文名称,
          建议数量: 建议数量,
          净可售库存: netStock,
          在途数量: item.在途数量 || 0,
          当前在途库存: transitStock,
          '30天销售数量': sales30d,
          '预测库存（在途）': predictedTransitQuantity,
        };
      })
      .filter(item => item.预警) // 只保留有预警的记录
      .sort((a, b) => {
        // 紧急补货排在前面
        if (a.预警 === '紧急补货' && b.预警 !== '紧急补货') return -1;
        if (a.预警 !== '紧急补货' && b.预警 === '紧急补货') return 1;
        // 同级别按30天销量降序排序
        return (b['30天销售数量'] || 0) - (a['30天销售数量'] || 0);
      });
    
    // 创建采购建议工作表
    if (purchaseSuggestions.length > 0) {
      const suggestionSheet = XLSX.utils.json_to_sheet(purchaseSuggestions);
      XLSX.utils.book_append_sheet(workbook, suggestionSheet, '采购建议');
    }
    
    XLSX.writeFile(workbook, fileName);
    
    const message = purchaseSuggestions.length > 0 
      ? `已导出 ${data.length} 条库存记录和 ${purchaseSuggestions.length} 条采购建议到 ${fileName}`
      : `已导出 ${data.length} 条记录到 ${fileName}`;
    toast.success(message);
  } catch (error) {
    console.error('导出失败:', error);
    toast.error('导出失败，请重试');
  }
};

// 数据排序函数
export const sortInventoryData = (
  data: InventoryItem[],
  sortConfig: SortConfig | null
): InventoryItem[] => {
  if (!sortConfig) return data;
  
  const sortedData = [...data];
  
  sortedData.sort((a, b) => {
    let aValue: any;
    let bValue: any;
    
    switch (sortConfig.field) {
      case '产品代码':
        aValue = a.产品代码;
        bValue = b.产品代码;
        break;
      case '产品名称':
        aValue = a.产品名称;
        bValue = b.产品名称;
        break;
      case '净可售库存':
        aValue = calculateNetStock(a);
        bValue = calculateNetStock(b);
        break;
      case '在途库存':
        aValue = a.在途库存 || calculateNetStock(a);
        bValue = b.在途库存 || calculateNetStock(b);
        break;
      case '30天销售数量':
        aValue = a.salesData?.salesQuantity30d || 0;
        bValue = b.salesData?.salesQuantity30d || 0;
        break;
      case '预测库存（在途）': {
        const aTransit = a.在途库存 || calculateNetStock(a);
        const bTransit = b.在途库存 || calculateNetStock(b);
        aValue = aTransit - (a.salesData?.salesQuantity30d || 0);
        bValue = bTransit - (b.salesData?.salesQuantity30d || 0);
        break;
      }
      case '订单数':
        aValue = a.salesData?.orderCount || 0;
        bValue = b.salesData?.orderCount || 0;
        break;
      case '销售数量':
        aValue = a.salesData?.salesQuantity || 0;
        bValue = b.salesData?.salesQuantity || 0;
        break;
      case '30天订单数':
        aValue = a.salesData?.orderCount30d || 0;
        bValue = b.salesData?.orderCount30d || 0;
        break;
      default:
        return 0;
    }
    
    // 处理字符串和数字的比较
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortConfig.direction === 'asc' 
        ? aValue.localeCompare(bValue, 'zh-CN')
        : bValue.localeCompare(aValue, 'zh-CN');
    }
    
    // 数字比较
    const numA = Number(aValue) || 0;
    const numB = Number(bValue) || 0;
    
    return sortConfig.direction === 'asc' 
      ? numA - numB
      : numB - numA;
  });
  
  return sortedData;
};

// 数据筛选函数
export const filterInventoryData = (
  data: InventoryItem[],
  filters: {
    skuFilters: string;
    warehouseFilter: string;
    categoryFilter?: string;  // 保留单个品类筛选以兼容
    categoryFilters?: string[];  // 新增：多个品类筛选
    hideZeroStock?: boolean;
    hideNormalStatus?: boolean;
    excludeSkuPrefixes?: string;
  }
): InventoryItem[] => {
  const { skuFilters, warehouseFilter, categoryFilter, categoryFilters, hideZeroStock = false, hideNormalStatus = false, excludeSkuPrefixes = '' } = filters;
  
  return data.filter(item => {
    // SKU前缀排除筛选（优先级最高）
    if (excludeSkuPrefixes.trim()) {
      const excludeList = excludeSkuPrefixes.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
      const shouldExclude = excludeList.some(prefix => 
        item.产品代码.toLowerCase().startsWith(prefix.toLowerCase())
      );
      if (shouldExclude) return false;
    }
    
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
    
    // 品类筛选 - 支持多选
    if (categoryFilters && categoryFilters.length > 0) {
      // 使用多个品类筛选（OR逻辑）
      const matchesCategory = categoryFilters.some(filter => {
        const filterLower = filter.toLowerCase();
        return item.一级品类.toLowerCase().includes(filterLower) ||
               item.二级品类.toLowerCase().includes(filterLower) ||
               item.三级品类.toLowerCase().includes(filterLower);
      });
      if (!matchesCategory) return false;
    } else if (categoryFilter && categoryFilter.trim() && categoryFilter !== '全部') {
      // 向后兼容：单个品类筛选
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