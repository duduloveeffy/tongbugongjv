import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

interface MultiSiteStatusBadgeProps {
  multiSiteData?: {
    [siteId: string]: {
      siteName?: string;
      isOnline: boolean;
      status: string;
      stockStatus: string;
      stockQuantity?: number;
      manageStock?: boolean;
      productUrl?: string;
      lastSyncAt?: string;
      syncResult?: 'success' | 'failed' | 'skipped';
      syncMessage?: string;
    };
  };
}

export function MultiSiteStatusBadge({ multiSiteData }: MultiSiteStatusBadgeProps) {
  if (!multiSiteData || Object.keys(multiSiteData).length === 0) {
    return null;
  }
  
  const sites = Object.entries(multiSiteData);
  const successCount = sites.filter(([_, data]) => data.syncResult === 'success').length;
  const failedCount = sites.filter(([_, data]) => data.syncResult === 'failed').length;
  const totalCount = sites.length;
  
  // 确定徽章颜色
  let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  let icon = <Clock className="h-3 w-3" />;
  
  if (failedCount > 0) {
    variant = "destructive";
    icon = <XCircle className="h-3 w-3" />;
  } else if (successCount === totalCount) {
    variant = "default";
    icon = <CheckCircle className="h-3 w-3" />;
  } else if (successCount > 0) {
    variant = "outline";
    icon = <AlertCircle className="h-3 w-3" />;
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant} className="cursor-help gap-1">
            {icon}
            {successCount}/{totalCount}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-2">
            <p className="font-semibold mb-2">多站点同步状态</p>
            {sites.map(([siteId, data]) => (
              <div key={siteId} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1">
                  {data.syncResult === 'success' ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : data.syncResult === 'failed' ? (
                    <XCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <Clock className="h-3 w-3 text-gray-500" />
                  )}
                  {data.siteName || siteId}
                </span>
                <span className="text-xs text-muted-foreground">
                  {data.stockStatus === 'instock' ? '有货' : '无货'}
                  {data.stockQuantity !== undefined && ` (${data.stockQuantity})`}
                </span>
              </div>
            ))}
            {sites[0]?.[1]?.lastSyncAt && (
              <div className="text-xs text-muted-foreground border-t pt-2">
                最后同步: {new Date(sites[0][1].lastSyncAt).toLocaleString('zh-CN')}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}