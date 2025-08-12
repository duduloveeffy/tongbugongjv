import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type InventoryItem, type TransitOrderItem, parseCSVFile, parseExcelFile, parseExcelPreview } from '@/lib/inventory-utils';
import { Truck, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ColumnMappingDialog } from './ColumnMappingDialog';

// 同步品类映射到数据库
async function syncCategoryMappings(inventoryData: InventoryItem[]) {
  try {
    const response = await fetch('/api/categories/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryData }),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`同步了 ${result.synced} 个SKU的品类映射`);
      if (result.synced > 0) {
        toast.info(`已同步 ${result.synced} 个品类映射`);
      }
    }
  } catch (error) {
    console.error('品类映射同步失败:', error);
  }
}

interface InventoryUploadProps {
  onInventoryDataLoad: (data: InventoryItem[], headers: string[]) => void;
  onTransitDataLoad: (data: TransitOrderItem[]) => void;
  onTransitDataAdd: (data: TransitOrderItem[]) => void;
  onTransitFileAdd: (fileName: string, items: TransitOrderItem[]) => void;
  transitOrderCount: number;
  isLoading: boolean;
}

export function InventoryUpload({ 
  onInventoryDataLoad, 
  onTransitDataLoad,
  onTransitDataAdd,
  onTransitFileAdd,
  transitOrderCount,
  isLoading 
}: InventoryUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transitFileInputRef = useRef<HTMLInputElement>(null);
  
  // 列映射对话框状态
  const [columnMappingOpen, setColumnMappingOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewData, setPreviewData] = useState<{
    headers: string[];
    rows: any[][];
    fileName: string;
  } | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('请选择CSV文件');
      return;
    }

    try {
      const { data, headers } = await parseCSVFile(file);
      
      if (data.length === 0) {
        toast.error('CSV文件为空');
        return;
      }

      // 验证必要字段
      const requiredFields = ['产品代码', '产品名称', '可售库存'];
      const missingFields = requiredFields.filter(field => !headers.includes(field));
      
      if (missingFields.length > 0) {
        toast.error(`CSV文件缺少必要字段: ${missingFields.join(', ')}`);
        return;
      }

      toast.success(`成功导入 ${data.length} 条库存数据`);
      onInventoryDataLoad(data as InventoryItem[], headers);
      
      // 同步品类映射到数据库
      syncCategoryMappings(data as InventoryItem[]);
    } catch (error) {
      console.error('文件处理失败:', error);
      toast.error(error instanceof Error ? error.message : '文件处理失败');
    }
  };

  const processFileWithMapping = async (
    file: File, 
    columnMapping?: { skuColumn: number; quantityColumn: number; nameColumn?: number },
    isFirstFile = false
  ) => {
    try {
      const transitOrders = await parseExcelFile(file, columnMapping);
      
      if (transitOrders.length === 0) {
        toast.warning(`文件 ${file.name} 中没有找到有效的在途订单数据`);
        return { processed: 0, skus: new Set<string>() };
      }

      // 统计唯一SKU
      const skus = new Set<string>();
      transitOrders.forEach(order => {
        skus.add(order.产品型号);
      });

      // 使用新的文件管理功能
      onTransitFileAdd(file.name, transitOrders);

      toast.success(`成功导入文件 ${file.name}: ${transitOrders.length} 条记录，${skus.size} 个SKU`);
      return { processed: transitOrders.length, skus };
    } catch (error) {
      // 检查是否是自动识别失败
      if (error instanceof Error && error.message.includes('无法自动识别列')) {
        // 需要手动映射
        return null;
      }
      console.error(`处理文件 ${file.name} 失败:`, error);
      toast.error(`文件 ${file.name} 处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return { processed: 0, skus: new Set<string>() };
    }
  };

  const handleTransitFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    
    // 筛选有效的Excel文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      
      if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
        toast.error(`文件 ${file.name} 不是Excel文件，已跳过`);
        continue;
      }
      
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      toast.error('没有有效的Excel文件');
      return;
    }

    setPendingFiles(validFiles);
    setCurrentFileIndex(0);
    
    // 处理第一个文件
    await processNextFile(validFiles, 0, transitOrderCount === 0);
    
    // 清空文件选择
    if (transitFileInputRef.current) {
      transitFileInputRef.current.value = '';
    }
  };

  const processNextFile = async (files: File[], index: number, isFirstUpload: boolean) => {
    if (index >= files.length) {
      // 所有文件处理完成
      const totalProcessed = files.length;
      toast.success(`所有文件处理完成，共处理 ${totalProcessed} 个文件`);
      setPendingFiles([]);
      return;
    }

    const file = files[index];
    if (!file) return;

    const result = await processFileWithMapping(file, undefined, isFirstUpload && index === 0);
    
    if (result === null) {
      // 需要手动映射
      try {
        const preview = await parseExcelPreview(file);
        setCurrentFile(file);
        setCurrentFileIndex(index);
        setPreviewData(preview);
        setColumnMappingOpen(true);
      } catch (error) {
        toast.error(`无法预览文件 ${file.name}`);
        // 继续处理下一个文件
        await processNextFile(files, index + 1, isFirstUpload);
      }
    } else {
      // 自动处理成功，继续下一个文件
      await processNextFile(files, index + 1, isFirstUpload);
    }
  };

  const handleColumnMappingConfirm = async (mapping: { skuColumn: number; quantityColumn: number; nameColumn?: number }) => {
    setColumnMappingOpen(false);
    
    if (!currentFile) return;
    
    const isFirstUpload = transitOrderCount === 0;
    const result = await processFileWithMapping(currentFile, mapping, isFirstUpload && currentFileIndex === 0);
    
    if (result) {
      // 继续处理下一个文件
      await processNextFile(pendingFiles, currentFileIndex + 1, isFirstUpload);
    }
    
    setCurrentFile(null);
    setPreviewData(null);
  };

  return (
    <>
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            库存数据导入
          </CardTitle>
          <CardDescription>
            上传CSV格式的库存数据文件（GB2312编码）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="inventory-file">选择库存数据文件</Label>
            <Input
              id="inventory-file"
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileUpload}
              disabled={isLoading}
            />
          </div>
          <Button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            选择CSV文件
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            在途订单导入
          </CardTitle>
          <CardDescription>
            上传Excel格式的在途订单数据文件（支持多文件选择，自动聚合相同SKU）
            {transitOrderCount > 0 && (
              <div className="mt-1 text-primary text-sm">
                当前已导入：{transitOrderCount} 个SKU的在途数据
              </div>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="transit-file">选择在途订单文件（可多选）</Label>
            <Input
              id="transit-file"
              type="file"
              accept=".xlsx,.xls"
              multiple
              ref={transitFileInputRef}
              onChange={handleTransitFileUpload}
              disabled={isLoading}
            />
          </div>
          <Button 
            onClick={() => transitFileInputRef.current?.click()}
            disabled={isLoading}
            className="w-full"
            variant="outline"
          >
            <Truck className="mr-2 h-4 w-4" />
            选择Excel文件（可多选）
          </Button>
        </CardContent>
      </Card>
    </div>

    {/* 列映射对话框 */}
    {previewData && (
      <ColumnMappingDialog
        open={columnMappingOpen}
        onOpenChange={setColumnMappingOpen}
        fileName={previewData.fileName}
        headers={previewData.headers}
        previewRows={previewData.rows}
        onConfirm={handleColumnMappingConfirm}
      />
    )}
    </>
  );
}