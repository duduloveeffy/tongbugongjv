'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { startOfWeek, endOfWeek, format, addWeeks, subWeeks, isFuture, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export interface WeekValue {
  year: number;
  week: number; // ISO week number (1-53)
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

interface WeekPickerProps {
  value?: WeekValue;
  onChange?: (value: WeekValue) => void;
  className?: string;
}

// 获取 ISO 周数
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// 获取 ISO 周年
function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

// 根据年份和周数获取该周的起始日期（周一）
function getWeekStartDate(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);
  return weekStart;
}

// 计算该周在月份中是第几周
function getWeekOfMonth(date: Date): number {
  // 获取该日期所在月的第一天
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  // 获取第一天是周几（0=周日，1=周一...）
  const firstDayWeekday = firstDayOfMonth.getDay();
  // 调整为周一开始（周一=0，周二=1...周日=6）
  const adjustedFirstDay = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1;
  // 计算当前日期距离月初的天数
  const dayOfMonth = date.getDate();
  // 计算是第几周
  return Math.ceil((dayOfMonth + adjustedFirstDay) / 7);
}

// 获取默认周（上周）
function getDefaultWeek(): WeekValue {
  const today = new Date();
  const lastWeek = subWeeks(today, 1);
  const weekStart = startOfWeek(lastWeek, { weekStartsOn: 1 }); // 周一开始
  const weekEnd = endOfWeek(lastWeek, { weekStartsOn: 1 }); // 周日结束

  return {
    year: getISOWeekYear(weekStart),
    week: getISOWeek(weekStart),
    startDate: format(weekStart, 'yyyy-MM-dd'),
    endDate: format(weekEnd, 'yyyy-MM-dd'),
  };
}

export function WeekPicker({ value, onChange, className }: WeekPickerProps) {
  const [open, setOpen] = useState(false);
  const defaultWeek = getDefaultWeek();

  const selectedValue = value || defaultWeek;
  const selectedWeekStart = getWeekStartDate(selectedValue.year, selectedValue.week);
  const selectedWeekEnd = endOfWeek(selectedWeekStart, { weekStartsOn: 1 });

  // 切换到上一周
  const handlePrevWeek = () => {
    const prevWeekStart = subWeeks(selectedWeekStart, 1);
    const prevWeekEnd = endOfWeek(prevWeekStart, { weekStartsOn: 1 });

    onChange?.({
      year: getISOWeekYear(prevWeekStart),
      week: getISOWeek(prevWeekStart),
      startDate: format(prevWeekStart, 'yyyy-MM-dd'),
      endDate: format(prevWeekEnd, 'yyyy-MM-dd'),
    });
  };

  // 切换到下一周
  const handleNextWeek = () => {
    const nextWeekStart = addWeeks(selectedWeekStart, 1);
    const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 1 });

    // 不允许选择未来的完整周
    if (isFuture(startOfDay(nextWeekEnd))) {
      return;
    }

    onChange?.({
      year: getISOWeekYear(nextWeekStart),
      week: getISOWeek(nextWeekStart),
      startDate: format(nextWeekStart, 'yyyy-MM-dd'),
      endDate: format(nextWeekEnd, 'yyyy-MM-dd'),
    });
  };

  // 快速选择周
  const handleQuickSelect = (weeksAgo: number) => {
    const targetDate = subWeeks(new Date(), weeksAgo);
    const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 });

    onChange?.({
      year: getISOWeekYear(weekStart),
      week: getISOWeek(weekStart),
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate: format(weekEnd, 'yyyy-MM-dd'),
    });
    setOpen(false);
  };

  // 检查是否可以选择下一周
  const canSelectNextWeek = () => {
    const nextWeekEnd = endOfWeek(addWeeks(selectedWeekStart, 1), { weekStartsOn: 1 });
    return !isFuture(startOfDay(nextWeekEnd));
  };

  const formatDisplay = () => {
    const month = selectedWeekStart.getMonth() + 1;
    const weekOfMonth = getWeekOfMonth(selectedWeekStart);
    const shortYear = selectedValue.year.toString().slice(-2);
    return `${shortYear}年${month}月第${weekOfMonth}周 (${format(selectedWeekStart, 'MM/dd', { locale: zhCN })} - ${format(selectedWeekEnd, 'MM/dd', { locale: zhCN })})`;
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        variant="outline"
        size="icon"
        onClick={handlePrevWeek}
        className="h-9 w-9"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="justify-start text-left font-normal min-w-[260px]"
          >
            <Calendar className="mr-2 h-4 w-4" />
            {formatDisplay()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="space-y-3">
            <div className="text-sm font-medium text-muted-foreground">快速选择</div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickSelect(0)}
                className="w-full"
              >
                本周
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickSelect(1)}
                className="w-full"
              >
                上周
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickSelect(2)}
                className="w-full"
              >
                前两周
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickSelect(3)}
                className="w-full"
              >
                前三周
              </Button>
            </div>

            <div className="border-t pt-3">
              <div className="text-sm font-medium text-muted-foreground mb-2">最近8周</div>
              <div className="grid grid-cols-1 gap-1 max-h-[200px] overflow-y-auto">
                {Array.from({ length: 8 }, (_, i) => i + 1).map((weeksAgo) => {
                  const targetDate = subWeeks(new Date(), weeksAgo);
                  const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 });
                  const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 });
                  const weekNum = getISOWeek(weekStart);
                  const weekYear = getISOWeekYear(weekStart);
                  const isSelected = selectedValue.year === weekYear && selectedValue.week === weekNum;
                  const month = weekStart.getMonth() + 1;
                  const weekOfMonth = getWeekOfMonth(weekStart);
                  const shortYear = weekYear.toString().slice(-2);

                  return (
                    <Button
                      key={weeksAgo}
                      variant={isSelected ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => handleQuickSelect(weeksAgo)}
                      className="w-full justify-start text-left"
                    >
                      <span className="font-medium mr-2">{shortYear}年{month}月第{weekOfMonth}周</span>
                      <span className="text-muted-foreground">
                        {format(weekStart, 'MM/dd')} - {format(weekEnd, 'MM/dd')}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        onClick={handleNextWeek}
        disabled={!canSelectNextWeek()}
        className="h-9 w-9"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
