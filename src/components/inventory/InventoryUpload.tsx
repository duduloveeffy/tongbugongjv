import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { parseCSVFile, parseExcelFile, type InventoryItem, type TransitOrderItem } from '@/lib/inventory-utils';

interface InventoryUploadProps {
  onInventoryDataLoad: (data: InventoryItem[], headers: string[]) => void;
  onTransitDataLoad: (data: TransitOrderItem[]) => void;
  isLoading: boolean;
}

export function InventoryUpload({ 
  onInventoryDataLoad, 
  onTransitDataLoad, 
  isLoading 
}: InventoryUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transitFileInputRef = useRef<HTMLInputElement>(null);

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
    } catch (error) {
      console.error('文件处理失败:', error);
      toast.error(error instanceof Error ? error.message : '文件处理失败');
    }
  };

  const handleTransitFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      toast.error('请选择Excel文件');
      return;
    }

    try {
      const transitOrders = await parseExcelFile(file);
      
      if (transitOrders.length === 0) {
        toast.error('Excel文件中没有找到有效的在途订单数据');
        return;
      }

      toast.success(`成功导入 ${transitOrders.length} 条在途订单数据`);
      onTransitDataLoad(transitOrders);
    } catch (error) {
      console.error('在途订单文件处理失败:', error);
      toast.error(error instanceof Error ? error.message : '在途订单文件处理失败');
    }
  };

  return (
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
            上传Excel格式的在途订单数据文件
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="transit-file">选择在途订单文件</Label>
            <Input
              id="transit-file"
              type="file"
              accept=".xlsx,.xls"
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
            选择Excel文件
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}