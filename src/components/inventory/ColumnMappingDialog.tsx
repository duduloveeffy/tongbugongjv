import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useState } from 'react';

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  headers: string[];
  previewRows: any[][];
  onConfirm: (mapping: { skuColumn: number; quantityColumn: number; nameColumn?: number }) => void;
}

export function ColumnMappingDialog({
  open,
  onOpenChange,
  fileName,
  headers,
  previewRows,
  onConfirm,
}: ColumnMappingDialogProps) {
  const [skuColumn, setSkuColumn] = useState<string>('0');
  const [quantityColumn, setQuantityColumn] = useState<string>(String(headers.length - 1));
  const [nameColumn, setNameColumn] = useState<string>('-1');

  const handleConfirm = () => {
    onConfirm({
      skuColumn: Number.parseInt(skuColumn),
      quantityColumn: Number.parseInt(quantityColumn),
      nameColumn: Number.parseInt(nameColumn) >= 0 ? Number.parseInt(nameColumn) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>选择列映射 - {fileName}</DialogTitle>
          <DialogDescription>
            请选择包含产品型号（SKU）和数量的列。系统无法自动识别列时需要手动指定。
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          <div className="mb-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="sku-column" className="font-medium text-sm">产品型号（SKU）列 *</label>
                <Select value={skuColumn} onValueChange={setSkuColumn}>
                  <SelectTrigger id="sku-column">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((header, index) => (
                      <SelectItem key={index} value={String(index)}>
                        列{index + 1}: {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label htmlFor="quantity-column" className="font-medium text-sm">数量列 *</label>
                <Select value={quantityColumn} onValueChange={setQuantityColumn}>
                  <SelectTrigger id="quantity-column">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((header, index) => (
                      <SelectItem key={index} value={String(index)}>
                        列{index + 1}: {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label htmlFor="name-column" className="font-medium text-sm">产品名称列（可选）</label>
                <Select value={nameColumn} onValueChange={setNameColumn}>
                  <SelectTrigger id="name-column">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">不选择</SelectItem>
                    {headers.map((header, index) => (
                      <SelectItem key={index} value={String(index)}>
                        列{index + 1}: {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((header, index) => (
                    <TableHead 
                      key={index}
                      className={`
                        ${index === Number.parseInt(skuColumn) ? 'bg-blue-50' : ''}
                        ${index === Number.parseInt(quantityColumn) ? 'bg-green-50' : ''}
                        ${index === Number.parseInt(nameColumn) && Number.parseInt(nameColumn) >= 0 ? 'bg-yellow-50' : ''}
                      `}
                    >
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-xs">列{index + 1}</span>
                        <span>{header}</span>
                        {index === Number.parseInt(skuColumn) && (
                          <span className="text-blue-600 text-xs">SKU</span>
                        )}
                        {index === Number.parseInt(quantityColumn) && (
                          <span className="text-green-600 text-xs">数量</span>
                        )}
                        {index === Number.parseInt(nameColumn) && Number.parseInt(nameColumn) >= 0 && (
                          <span className="text-xs text-yellow-600">名称</span>
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <TableCell 
                        key={cellIndex}
                        className={`
                          ${cellIndex === Number.parseInt(skuColumn) ? 'bg-blue-50' : ''}
                          ${cellIndex === Number.parseInt(quantityColumn) ? 'bg-green-50' : ''}
                          ${cellIndex === Number.parseInt(nameColumn) && Number.parseInt(nameColumn) >= 0 ? 'bg-yellow-50' : ''}
                        `}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={skuColumn === quantityColumn}
          >
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}