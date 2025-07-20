import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { type InventoryItem } from '@/lib/inventory-utils';

interface SalesDetectionControlsProps {
  isEnabled: boolean;
  isLoading: boolean;
  progress: string;
  orderStatuses: string[];
  dateRange: { start: string; end: string };
  onToggle: (enabled: boolean) => void;
  onOrderStatusesChange: (statuses: string[]) => void;
  onDateRangeChange: (range: { start: string; end: string }) => void;
  onStartDetection: (skus: string[]) => void;
  filteredData: InventoryItem[];
}

export function SalesDetectionControls({
  isEnabled,
  isLoading,
  progress,
  orderStatuses,
  dateRange,
  onToggle,
  onOrderStatusesChange,
  onDateRangeChange,
  onStartDetection,
  filteredData,
}: SalesDetectionControlsProps) {
  const [batchSize, setBatchSize] = useState(() => filteredData.length || 100);

  // Update batchSize when filteredData changes
  useEffect(() => {
    if (filteredData.length > 0) {
      setBatchSize(filteredData.length);
    }
  }, [filteredData.length]);

  const handleStartDetection = () => {
    if (filteredData.length === 0) {
      toast.error('请先导入库存数据');
      return;
    }

    const skus = filteredData.map(item => item.产品代码).slice(0, batchSize);
    onStartDetection(skus);
  };

  const orderStatusOptions = [
    { value: 'completed', label: '已完成' },
    { value: 'processing', label: '处理中' },
    { value: 'pending', label: '待支付' },
    { value: 'on-hold', label: '暂停' },
    { value: 'cancelled', label: '已取消' },
    { value: 'refunded', label: '已退款' },
    { value: 'failed', label: '失败' },
  ];

  const handleStatusChange = (status: string, checked: boolean) => {
    if (checked) {
      onOrderStatusesChange([...orderStatuses, status]);
    } else {
      onOrderStatusesChange(orderStatuses.filter(s => s !== status));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          销量检测设置
        </CardTitle>
        <CardDescription>
          检测产品在WooCommerce中的销量数据
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="sales-detection"
            checked={isEnabled}
            onCheckedChange={onToggle}
          />
          <Label htmlFor="sales-detection">启用销量检测功能</Label>
        </div>

        {isEnabled && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="start-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  开始日期
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="end-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  结束日期
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>订单状态筛选</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {orderStatusOptions.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`status-${option.value}`}
                      checked={orderStatuses.includes(option.value)}
                      onCheckedChange={(checked) => handleStatusChange(option.value, checked as boolean)}
                    />
                    <Label htmlFor={`status-${option.value}`} className="text-sm">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="batch-size">检测数量限制</Label>
              <Select value={batchSize.toString()} onValueChange={(value) => setBatchSize(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">前50个SKU</SelectItem>
                  <SelectItem value="100">前100个SKU</SelectItem>
                  <SelectItem value="200">前200个SKU</SelectItem>
                  <SelectItem value="500">前500个SKU</SelectItem>
                  <SelectItem value={filteredData.length.toString()}>
                    全部 ({filteredData.length}个SKU)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleStartDetection}
              disabled={isLoading || filteredData.length === 0}
              className="w-full"
            >
              {isLoading ? '检测中...' : `开始销量检测 (${Math.min(batchSize, filteredData.length)}个SKU)`}
            </Button>

            {isLoading && progress && (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                {progress}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}