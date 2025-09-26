'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { formatSyncSummary } from '@/lib/sync-core';
import type { SyncResult } from '@/lib/sync-core';

interface SyncResultSummaryProps {
  results: SyncResult[];
  title?: string;
  showDetails?: boolean;
  className?: string;
}

export function SyncResultSummary({
  results,
  title = '同步结果',
  showDetails = true,
  className
}: SyncResultSummaryProps) {
  const summary = formatSyncSummary(results);

  // 决定显示的图标和颜色
  let Icon = Info;
  let alertVariant: 'default' | 'destructive' = 'default';
  let iconColor = 'text-blue-600';

  if (summary.success === summary.total) {
    Icon = CheckCircle;
    iconColor = 'text-green-600';
  } else if (summary.failed > summary.success) {
    Icon = XCircle;
    alertVariant = 'destructive';
    iconColor = 'text-red-600';
  } else if (summary.failed > 0) {
    Icon = AlertCircle;
    iconColor = 'text-yellow-600';
  }

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Icon className={`h-5 w-5 mt-0.5 ${iconColor}`} />
            <div className="flex-1 space-y-2">
              <h3 className="font-medium">{title}</h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">总计：</span>
                  <span className="ml-2 font-medium">{summary.total}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">成功率：</span>
                  <span className="ml-2 font-medium">{summary.successRate}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">成功：</span>
                  <span className="ml-2 font-medium text-green-600">
                    {summary.success}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">失败：</span>
                  <span className="ml-2 font-medium text-red-600">
                    {summary.failed}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {showDetails && summary.failedSkus.length > 0 && (
            <Alert variant={alertVariant}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <div className="font-medium">失败的SKU：</div>
                  <div className="text-sm text-muted-foreground">
                    {summary.failedSkus.join(', ')}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {showDetails && results.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                查看详细结果
              </summary>
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {results.map((result, index) => (
                  <div
                    key={`${result.sku}-${result.siteId}-${index}`}
                    className={`flex items-center justify-between p-2 rounded ${
                      result.success ? 'bg-green-50' : 'bg-red-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle className="h-3 w-3 text-green-600" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-600" />
                      )}
                      <span className="font-mono">{result.sku}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-xs">{result.siteId}</span>
                    </div>
                    {result.error && (
                      <span className="text-xs text-red-600">
                        {result.error}
                      </span>
                    )}
                    {result.updatedStatus && (
                      <span className="text-xs text-muted-foreground">
                        {result.updatedStatus}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}