'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatQuarter, isFutureQuarter, getDefaultQuarter } from '@/lib/quarter-utils';

interface QuarterPickerProps {
  value?: { year: number; quarter: number };
  onChange?: (value: { year: number; quarter: number }) => void;
  className?: string;
}

const QUARTERS = [
  { value: 1, label: 'Q1', months: '1-3月' },
  { value: 2, label: 'Q2', months: '4-6月' },
  { value: 3, label: 'Q3', months: '7-9月' },
  { value: 4, label: 'Q4', months: '10-12月' },
];

export function QuarterPicker({ value, onChange, className }: QuarterPickerProps) {
  const [open, setOpen] = useState(false);
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();

  // 默认值为上一个完整季度
  const defaultValue = getDefaultQuarter();
  const selectedYear = value?.year || defaultValue.year;
  const selectedQuarter = value?.quarter || defaultValue.quarter;

  // 生成年份列表（最近5年）
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const handleSelect = (year: number, quarter: number) => {
    onChange?.({ year, quarter });
    setOpen(false);
  };

  const formatDisplay = () => {
    return formatQuarter(selectedYear, selectedQuarter);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-start text-left font-normal min-w-[160px]', className)}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {formatDisplay()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          {/* 年份选择 */}
          <div>
            <div className="text-sm font-medium mb-2 text-muted-foreground">选择年份</div>
            <div className="grid grid-cols-5 gap-2">
              {years.map((year) => (
                <Button
                  key={year}
                  variant={year === selectedYear ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSelect(year, selectedQuarter)}
                  className="w-full"
                >
                  {year}
                </Button>
              ))}
            </div>
          </div>

          {/* 季度选择 */}
          <div>
            <div className="text-sm font-medium mb-2 text-muted-foreground">选择季度</div>
            <div className="grid grid-cols-2 gap-2">
              {QUARTERS.map((q) => {
                const isSelected = selectedYear === currentYear
                  ? q.value === selectedQuarter && selectedYear === currentYear
                  : q.value === selectedQuarter;

                // 禁用未来季度
                const isFuture = isFutureQuarter(selectedYear, q.value);

                return (
                  <Button
                    key={q.value}
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSelect(selectedYear, q.value)}
                    disabled={isFuture}
                    className="w-full flex flex-col items-start h-auto py-2"
                  >
                    <span className="font-semibold">{q.label}</span>
                    <span className="text-xs text-muted-foreground">{q.months}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* 快捷选择 */}
          <div className="pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const { year, quarter } = getDefaultQuarter();
                handleSelect(year, quarter);
              }}
              className="w-full text-xs"
            >
              选择上一季度
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
