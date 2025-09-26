import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle, XCircle, AlertCircle, Package } from 'lucide-react';
import type { WCSite } from '@/lib/supabase';

interface DetectionResult {
  siteId: string;
  siteName?: string;
  exists: boolean;
  productId?: number;
  name?: string;
  status?: string;
  stockStatus?: string;
  stockQuantity?: number;
  manageStock?: boolean;
  error?: string;
}

interface MultiSiteDetectionTableProps {
  detectionResults: Map<string, DetectionResult[]>;
  sites: WCSite[];
  selectedSitesForSync: Set<string>;
  onSiteSelectionChange: (siteId: string, checked: boolean) => void;
}

export function MultiSiteDetectionTable({
  detectionResults,
  sites,
  selectedSitesForSync,
  onSiteSelectionChange
}: MultiSiteDetectionTableProps) {
  
  // 获取所有检测的站点ID
  const detectedSiteIds = new Set<string>();
  detectionResults.forEach(results => {
    results.forEach(r => detectedSiteIds.add(r.siteId));
  });
  
  // 获取站点名称
  const getSiteName = (siteId: string) => {
    const site = sites.find(s => s.id === siteId);
    return site?.name || siteId;
  };
  
  // 获取库存状态显示
  const getStockStatusDisplay = (result: DetectionResult) => {
    if (!result.exists) {
      return <Badge variant="secondary">未上架</Badge>;
    }
    
    if (result.error) {
      return <Badge variant="destructive">错误</Badge>;
    }
    
    const stockStatus = result.stockStatus;
    const quantity = result.stockQuantity;
    
    if (stockStatus === 'instock') {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="default" className="bg-green-500">有货</Badge>
          {quantity !== undefined && (
            <span className="text-sm text-muted-foreground">({quantity})</span>
          )}
        </div>
      );
    } else if (stockStatus === 'outofstock') {
      return <Badge variant="destructive">无货</Badge>;
    } else if (stockStatus === 'onbackorder') {
      return <Badge variant="outline">预订</Badge>;
    }
    
    return <Badge variant="secondary">未知</Badge>;
  };
  
  // 获取同步建议
  const getSyncSuggestion = (sku: string, siteId: string) => {
    const results = detectionResults.get(sku);
    if (!results) return null;
    
    const result = results.find(r => r.siteId === siteId);
    if (!result || !result.exists) return null;
    
    // 这里可以根据本地库存和线上状态给出建议
    // 暂时返回简单的状态
    return null;
  };
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">SKU</TableHead>
            {Array.from(detectedSiteIds).map(siteId => (
              <TableHead key={siteId} className="text-center">
                <div className="flex flex-col items-center gap-1">
                  <span>{getSiteName(siteId)}</span>
                  <Checkbox
                    checked={selectedSitesForSync.has(siteId)}
                    onCheckedChange={(checked) => onSiteSelectionChange(siteId, checked as boolean)}
                  />
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from(detectionResults.entries()).map(([sku, results]) => (
            <TableRow key={sku}>
              <TableCell className="font-mono font-medium">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  {sku}
                </div>
              </TableCell>
              {Array.from(detectedSiteIds).map(siteId => {
                const result = results.find(r => r.siteId === siteId);
                
                if (!result) {
                  return (
                    <TableCell key={siteId} className="text-center">
                      <Badge variant="secondary">-</Badge>
                    </TableCell>
                  );
                }
                
                return (
                  <TableCell key={siteId} className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            {getStockStatusDisplay(result)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            {result.exists ? (
                              <>
                                <p className="font-semibold">产品信息</p>
                                {result.name && (
                                  <p className="text-sm">名称: {result.name}</p>
                                )}
                                <p className="text-sm">状态: {result.status}</p>
                                <p className="text-sm">库存状态: {result.stockStatus}</p>
                                {result.stockQuantity !== undefined && (
                                  <p className="text-sm">数量: {result.stockQuantity}</p>
                                )}
                                <p className="text-sm">
                                  库存管理: {result.manageStock ? '是' : '否'}
                                </p>
                              </>
                            ) : result.error ? (
                              <>
                                <p className="font-semibold text-red-500">检测错误</p>
                                <p className="text-sm">{result.error}</p>
                              </>
                            ) : (
                              <p className="text-sm">产品未在此站点上架</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      {/* 统计信息 */}
      <div className="p-4 border-t bg-muted/50">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>有货</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span>无货</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertCircle className="h-4 w-4 text-gray-500" />
              <span>未上架</span>
            </div>
          </div>
          <div className="text-muted-foreground">
            已选择 {selectedSitesForSync.size} 个站点进行同步
          </div>
        </div>
      </div>
    </div>
  );
}