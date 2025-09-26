'use client';

import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

interface SyncProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  showCurrent?: boolean;
  current?: number;
  total?: number;
  isIndeterminate?: boolean;
  className?: string;
}

export function SyncProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  showCurrent = false,
  current,
  total,
  isIndeterminate = false,
  className
}: SyncProgressBarProps) {
  const percentage = Math.round((value / max) * 100);

  if (isIndeterminate) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{label || '处理中...'}</span>
          </div>
        </div>
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          {showCurrent && current !== undefined && total !== undefined && (
            <span className="text-muted-foreground">
              {current} / {total}
            </span>
          )}
          {showPercentage && (
            <span className="font-medium">{percentage}%</span>
          )}
        </div>
      </div>
      <Progress value={value} max={max} className="h-2" />
    </div>
  );
}