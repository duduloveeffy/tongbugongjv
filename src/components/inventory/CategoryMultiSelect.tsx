'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { InventoryItem } from '@/lib/inventory-utils';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';

interface CategoryMultiSelectProps {
  inventoryData: InventoryItem[];
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  placeholder?: string;
}

export function CategoryMultiSelect({
  inventoryData,
  selectedCategories,
  onCategoriesChange,
  placeholder = "选择或输入品类...",
}: CategoryMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // 从库存数据中提取唯一的品类
  const availableCategories = useMemo(() => {
    const categoriesSet = new Set<string>();
    
    inventoryData.forEach(item => {
      // 添加所有三级品类
      if (item.一级品类 && item.一级品类.trim()) {
        categoriesSet.add(item.一级品类.trim());
      }
      if (item.二级品类 && item.二级品类.trim()) {
        categoriesSet.add(item.二级品类.trim());
      }
      if (item.三级品类 && item.三级品类.trim()) {
        categoriesSet.add(item.三级品类.trim());
      }
    });
    
    // 转换为数组并排序
    return Array.from(categoriesSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [inventoryData]);

  // 处理选择品类
  const handleSelect = useCallback((category: string) => {
    const trimmedCategory = category.trim();
    if (!trimmedCategory) return;
    
    if (selectedCategories.includes(trimmedCategory)) {
      // 如果已选择，则移除
      onCategoriesChange(selectedCategories.filter(c => c !== trimmedCategory));
    } else {
      // 如果未选择，则添加
      onCategoriesChange([...selectedCategories, trimmedCategory]);
    }
  }, [selectedCategories, onCategoriesChange]);

  // 处理输入框回车事件 - 支持逗号分隔的多个品类
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      
      // 支持逗号分隔的多个品类
      const newCategories = inputValue
        .split(/[,，]/)
        .map(s => s.trim())
        .filter(s => s && !selectedCategories.includes(s));
      
      if (newCategories.length > 0) {
        onCategoriesChange([...selectedCategories, ...newCategories]);
        setInputValue("");
        setOpen(false);
      }
    }
  }, [inputValue, selectedCategories, onCategoriesChange]);

  // 移除单个品类
  const handleRemoveCategory = useCallback((category: string) => {
    onCategoriesChange(selectedCategories.filter(c => c !== category));
  }, [selectedCategories, onCategoriesChange]);

  // 清空所有选择
  const handleClearAll = useCallback(() => {
    onCategoriesChange([]);
  }, [onCategoriesChange]);

  // 过滤显示的品类选项
  const filteredCategories = useMemo(() => {
    if (!inputValue) return availableCategories;
    
    const searchValue = inputValue.toLowerCase();
    return availableCategories.filter(category => 
      category.toLowerCase().includes(searchValue)
    );
  }, [availableCategories, inputValue]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal"
          >
            <span className={cn(
              "truncate",
              selectedCategories.length === 0 && "text-muted-foreground"
            )}>
              {selectedCategories.length > 0
                ? `已选择 ${selectedCategories.length} 个品类`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder="搜索或输入品类（支持逗号分隔）..."
              value={inputValue}
              onValueChange={setInputValue}
              onKeyDown={handleInputKeyDown}
            />
            <CommandList>
              <CommandEmpty>
                {inputValue ? (
                  <div className="p-2 text-sm">
                    按回车添加 "{inputValue}"
                  </div>
                ) : (
                  "没有找到品类"
                )}
              </CommandEmpty>
              <CommandGroup heading="可选品类">
                {filteredCategories.map((category) => (
                  <CommandItem
                    key={category}
                    value={category}
                    onSelect={() => handleSelect(category)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedCategories.includes(category) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {category}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* 显示已选择的品类 */}
      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCategories.map((category) => (
            <Badge
              key={category}
              variant="secondary"
              className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => handleRemoveCategory(category)}
            >
              {category}
              <X className="ml-1 h-3 w-3" />
            </Badge>
          ))}
          {selectedCategories.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-6 px-2 text-xs"
            >
              清空所有
            </Button>
          )}
        </div>
      )}
    </div>
  );
}