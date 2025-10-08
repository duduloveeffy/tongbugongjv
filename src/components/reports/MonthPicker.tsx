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

interface MonthPickerProps {
  value?: { year: number; month: number };
  onChange?: (value: { year: number; month: number }) => void;
  className?: string;
}

const MONTHS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月'
];

export function MonthPicker({ value, onChange, className }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  // 默认值为上个月
  const selectedYear = value?.year || (currentMonth === 1 ? currentYear - 1 : currentYear);
  const selectedMonth = value?.month || (currentMonth === 1 ? 12 : currentMonth - 1);

  // 生成年份列表（最近5年）
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const handleSelect = (year: number, month: number) => {
    onChange?.({ year, month });
    setOpen(false);
  };

  const formatDisplay = () => {
    return `${selectedYear}年 ${selectedMonth}月`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-start text-left font-normal', className)}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {formatDisplay()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          {/* 年份选择 */}
          <div className="grid grid-cols-5 gap-2">
            {years.map((year) => (
              <Button
                key={year}
                variant={year === selectedYear ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSelect(year, selectedMonth)}
                className="w-full"
              >
                {year}
              </Button>
            ))}
          </div>

          {/* 月份选择 */}
          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((monthLabel, index) => {
              const month = index + 1;
              const isSelected = selectedYear === currentYear
                ? month === selectedMonth && selectedYear === currentYear
                : month === selectedMonth;

              // 禁用未来月份
              const isFuture = selectedYear > currentYear ||
                (selectedYear === currentYear && month > currentMonth);

              return (
                <Button
                  key={month}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSelect(selectedYear, month)}
                  disabled={isFuture}
                  className="w-full"
                >
                  {monthLabel}
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
