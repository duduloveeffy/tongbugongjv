'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Info } from 'lucide-react';
import { PRESET_RULES } from '@/lib/sync-rules';
import type { SyncConfig } from '@/lib/sync-core';

interface SyncModeSelectorProps {
  value: SyncConfig['mode'];
  onChange: (mode: SyncConfig['mode']) => void;
  selectedRule?: string;
  onRuleChange?: (ruleId: string) => void;
  customQuantity?: number;
  onQuantityChange?: (quantity: number | undefined) => void;
  showDescription?: boolean;
  className?: string;
}

export function SyncModeSelector({
  value,
  onChange,
  selectedRule = 'standard',
  onRuleChange,
  customQuantity,
  onQuantityChange,
  showDescription = true,
  className
}: SyncModeSelectorProps) {
  return (
    <div className={className}>
      <Tabs value={value} onValueChange={(v) => onChange(v as SyncConfig['mode'])}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="status">状态同步</TabsTrigger>
          <TabsTrigger value="quantity">数量同步</TabsTrigger>
          <TabsTrigger value="smart">智能同步</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-2">
          {showDescription && (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground">
                仅同步库存状态（有货/无货），不同步具体数量。
                系统会根据净库存自动判断：净库存&gt;0为有货，≤0为无货。
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="quantity" className="space-y-2">
          {showDescription && (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground">
                同步具体库存数量到线上，可以选择使用实际库存或自定义数量。
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>同步数量</Label>
            <Select
              value={customQuantity === undefined ? 'actual' : 'custom'}
              onValueChange={(v) => {
                if (onQuantityChange) {
                  onQuantityChange(v === 'actual' ? undefined : 0);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="actual">使用实际库存</SelectItem>
                <SelectItem value="custom">自定义数量</SelectItem>
              </SelectContent>
            </Select>

            {customQuantity !== undefined && (
              <Input
                type="number"
                placeholder="输入数量"
                value={customQuantity}
                onChange={(e) => {
                  if (onQuantityChange) {
                    onQuantityChange(Number(e.target.value));
                  }
                }}
                min={0}
                className="mt-2"
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="smart" className="space-y-2">
          {showDescription && (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground">
                根据预设规则自动决定同步行为，支持条件判断、数量计算等高级功能。
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>选择规则</Label>
            <Select value={selectedRule} onValueChange={onRuleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESET_RULES.map(rule => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {showDescription && (
              <p className="text-xs text-muted-foreground mt-1">
                {PRESET_RULES.find(r => r.id === selectedRule)?.description}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}