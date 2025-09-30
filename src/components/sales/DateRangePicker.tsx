'use client';

import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';

interface DateRangePickerProps {
  onDateRangeChange: (dateRange: {
    start: string;
    end: string;
    compareStart?: string;
    compareEnd?: string;
  }) => void;
  groupBy: 'day' | 'week' | 'month';
  onGroupByChange: (groupBy: 'day' | 'week' | 'month') => void;
  enableComparison?: boolean;
}

export function DateRangePicker({
  onDateRangeChange,
  groupBy,
  onGroupByChange,
  enableComparison = true,
}: DateRangePickerProps) {
  const [preset, setPreset] = useState('yesterday');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [compareEnabled, setCompareEnabled] = useState(false);

  // Helper functions for date calculations
  // 注意：这些函数返回本地日期字符串（YYYY-MM-DD）
  // API会将其转换为正确的UTC时间范围
  const getYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    // 使用本地日期，不是UTC
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getToday = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getThisWeekStart = () => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date.toISOString().split('T')[0];
  };

  const getLastWeekStart = () => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day - 6;
    date.setDate(diff);
    return date.toISOString().split('T')[0];
  };

  const getLastWeekEnd = () => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day;
    date.setDate(diff);
    return date.toISOString().split('T')[0];
  };

  const getThisMonthStart = () => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split('T')[0];
  };

  const getLastMonthStart = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  };

  const getLastMonthEnd = () => {
    const date = new Date();
    date.setDate(0);
    return date.toISOString().split('T')[0];
  };

  const getLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  const getLast30Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  // Calculate date range based on preset
  const calculateDateRange = () => {
    let start = '';
    let end = '';
    let compareStart = '';
    let compareEnd = '';

    switch (preset) {
      case 'today':
        start = end = getToday();
        if (compareEnabled) {
          compareStart = compareEnd = getYesterday();
        }
        break;
      case 'yesterday':
        start = end = getYesterday();
        if (compareEnabled) {
          const twoDaysAgo = new Date();
          twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
          compareStart = compareEnd = twoDaysAgo.toISOString().split('T')[0];
        }
        break;
      case 'thisWeek':
        start = getThisWeekStart();
        end = getToday();
        if (compareEnabled) {
          compareStart = getLastWeekStart();
          compareEnd = getLastWeekEnd();
        }
        break;
      case 'lastWeek':
        start = getLastWeekStart();
        end = getLastWeekEnd();
        if (compareEnabled) {
          const twoWeeksAgoStart = new Date(start);
          twoWeeksAgoStart.setDate(twoWeeksAgoStart.getDate() - 7);
          const twoWeeksAgoEnd = new Date(end);
          twoWeeksAgoEnd.setDate(twoWeeksAgoEnd.getDate() - 7);
          compareStart = twoWeeksAgoStart.toISOString().split('T')[0];
          compareEnd = twoWeeksAgoEnd.toISOString().split('T')[0];
        }
        break;
      case 'thisMonth':
        start = getThisMonthStart();
        end = getToday();
        if (compareEnabled) {
          compareStart = getLastMonthStart();
          compareEnd = getLastMonthEnd();
        }
        break;
      case 'lastMonth':
        start = getLastMonthStart();
        end = getLastMonthEnd();
        if (compareEnabled) {
          const twoMonthsAgo = new Date(start);
          twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 1);
          compareStart = new Date(twoMonthsAgo.getFullYear(), twoMonthsAgo.getMonth(), 1).toISOString().split('T')[0];
          compareEnd = new Date(twoMonthsAgo.getFullYear(), twoMonthsAgo.getMonth() + 1, 0).toISOString().split('T')[0];
        }
        break;
      case 'last7Days':
        const last7 = getLast7Days();
        start = last7.start;
        end = last7.end;
        if (compareEnabled) {
          const compareStart7 = new Date(start);
          compareStart7.setDate(compareStart7.getDate() - 7);
          const compareEnd7 = new Date(end);
          compareEnd7.setDate(compareEnd7.getDate() - 7);
          compareStart = compareStart7.toISOString().split('T')[0];
          compareEnd = compareEnd7.toISOString().split('T')[0];
        }
        break;
      case 'last30Days':
        const last30 = getLast30Days();
        start = last30.start;
        end = last30.end;
        if (compareEnabled) {
          const compareStart30 = new Date(start);
          compareStart30.setDate(compareStart30.getDate() - 30);
          const compareEnd30 = new Date(end);
          compareEnd30.setDate(compareEnd30.getDate() - 30);
          compareStart = compareStart30.toISOString().split('T')[0];
          compareEnd = compareEnd30.toISOString().split('T')[0];
        }
        break;
      case 'custom':
        start = customStart;
        end = customEnd;
        if (compareEnabled && start && end) {
          const daysDiff = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const compareEndDate = new Date(start);
          compareEndDate.setDate(compareEndDate.getDate() - 1);
          const compareStartDate = new Date(compareEndDate);
          compareStartDate.setDate(compareStartDate.getDate() - daysDiff + 1);
          compareStart = compareStartDate.toISOString().split('T')[0];
          compareEnd = compareEndDate.toISOString().split('T')[0];
        }
        break;
    }

    return { start, end, compareStart, compareEnd };
  };

  // Update date range when preset or comparison changes
  useEffect(() => {
    const dateRange = calculateDateRange();
    if (dateRange.start && dateRange.end) {
      onDateRangeChange({
        start: dateRange.start,
        end: dateRange.end,
        ...(compareEnabled && dateRange.compareStart && dateRange.compareEnd
          ? { compareStart: dateRange.compareStart, compareEnd: dateRange.compareEnd }
          : {}),
      });
    }
  }, [preset, customStart, customEnd, compareEnabled]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label>时间范围</Label>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">今天</SelectItem>
              <SelectItem value="yesterday">昨天</SelectItem>
              <SelectItem value="thisWeek">本周</SelectItem>
              <SelectItem value="lastWeek">上周</SelectItem>
              <SelectItem value="thisMonth">本月</SelectItem>
              <SelectItem value="lastMonth">上月</SelectItem>
              <SelectItem value="last7Days">最近7天</SelectItem>
              <SelectItem value="last30Days">最近30天</SelectItem>
              <SelectItem value="custom">自定义</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <Label>统计维度</Label>
          <Select value={groupBy} onValueChange={(value) => onGroupByChange(value as 'day' | 'week' | 'month')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">按天</SelectItem>
              <SelectItem value="week">按周</SelectItem>
              <SelectItem value="month">按月</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {enableComparison && (
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="compare"
              checked={compareEnabled}
              onChange={(e) => setCompareEnabled(e.target.checked)}
              className="rounded border-gray-300"
            />
            <Label htmlFor="compare">对比前期</Label>
          </div>
        )}
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Label>开始日期</Label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <Label>结束日期</Label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </div>
        </div>
      )}

      {compareEnabled && (
        <div className="text-sm text-muted-foreground">
          {(() => {
            const range = calculateDateRange();
            if (range.compareStart && range.compareEnd) {
              return `对比期间: ${range.compareStart} 至 ${range.compareEnd}`;
            }
            return null;
          })()}
        </div>
      )}
    </div>
  );
}