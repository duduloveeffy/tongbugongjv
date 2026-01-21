'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SimpleTrendIndicatorProps {
  sku: string;
  salesData?: {
    salesQuantityDaysN?: number;
    orderCountDaysN?: number;
  };
  onClick?: () => void;
  className?: string;
}

export function SimpleTrendIndicator({ 
  sku, 
  salesData, 
  onClick, 
  className 
}: SimpleTrendIndicatorProps) {
  
  // 根据销售数据判断趋势
  const getTrendIcon = () => {
    if (!salesData) {
      return <BarChart2 className="h-4 w-4 text-muted-foreground" />;
    }
    
    const sales = salesData.salesQuantityDaysN || 0;
    
    if (sales > 100) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    } else if (sales > 50) {
      return <TrendingUp className="h-4 w-4 text-blue-500" />;
    } else if (sales > 0) {
      return <Minus className="h-4 w-4 text-gray-500" />;
    } else {
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    }
  };
  
  const getSalesLabel = () => {
    if (!salesData) return '无数据';
    
    const sales = salesData.salesQuantityDaysN || 0;
    const orders = salesData.orderCountDaysN || 0;
    
    if (sales === 0) return '无销售';
    
    return `${sales}件/${orders}单`;
  };
  
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded cursor-pointer",
        "hover:bg-muted/50 transition-colors",
        className
      )}
      onClick={onClick}
      title={`SKU: ${sku}\n点击查看详细趋势`}
    >
      {getTrendIcon()}
      <span className="text-xs text-muted-foreground">
        {getSalesLabel()}
      </span>
    </div>
  );
}