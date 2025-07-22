import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { FileSpreadsheet, Hash, Package, Trash2 } from 'lucide-react';

interface TransitFile {
  id: string;
  fileName: string;
  uploadTime: string;
  items: any[];
  skuCount: number;
  totalQuantity: number;
}

interface TransitFilesListProps {
  files: TransitFile[];
  onRemoveFile: (fileId: string) => void;
}

export function TransitFilesList({ files, onRemoveFile }: TransitFilesListProps) {
  if (files.length === 0) {
    return null;
  }

  // 计算总计
  const totalSKUs = files.reduce((sum, file) => sum + file.skuCount, 0);
  const totalQuantity = files.reduce((sum, file) => sum + file.totalQuantity, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          已导入的在途订单文件
        </CardTitle>
        <CardDescription>
          管理已上传的在途订单文件，查看每个文件的统计信息
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文件名</TableHead>
                <TableHead>上传时间</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Hash className="h-4 w-4" />
                    SKU数量
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Package className="h-4 w-4" />
                    总数量
                  </div>
                </TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium">{file.fileName}</TableCell>
                  <TableCell>
                    {format(new Date(file.uploadTime), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700 text-xs">
                      {file.skuCount} 个SKU
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 font-medium text-green-700 text-xs">
                      {file.totalQuantity.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`确定要删除文件 "${file.fileName}" 吗？\n这将从统计中移除该文件的所有数据。`)) {
                          onRemoveFile(file.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot>
              <tr className="border-t bg-gray-50">
                <td colSpan={2} className="px-6 py-3 font-medium">
                  总计
                </td>
                <td className="px-6 py-3 text-center">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-800 text-sm">
                    {totalSKUs} 个SKU
                  </span>
                </td>
                <td className="px-6 py-3 text-center">
                  <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 font-medium text-green-800 text-sm">
                    {totalQuantity.toLocaleString()}
                  </span>
                </td>
                <td />
              </tr>
            </tfoot>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}