'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Globe, AlertCircle } from 'lucide-react';
import type { SiteInfo } from '@/lib/sync-core';

interface SiteSelectorProps {
  sites: SiteInfo[];
  mode?: 'single' | 'multiple';
  value?: string | Set<string>;
  onChange?: (value: string | Set<string>) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showStatus?: boolean;
  className?: string;
}

export function SiteSelector({
  sites,
  mode = 'single',
  value,
  onChange,
  label = '选择站点',
  placeholder = '请选择站点',
  disabled = false,
  showStatus = true,
  className
}: SiteSelectorProps) {
  const enabledSites = sites.filter(s => s.enabled);

  if (mode === 'single') {
    // 单选模式
    const selectedValue = value as string | undefined;

    return (
      <div className={`space-y-2 ${className}`}>
        <Label className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          {label}
        </Label>

        <Select
          value={selectedValue}
          onValueChange={(v) => onChange?.(v)}
          disabled={disabled || enabledSites.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {enabledSites.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                没有可用的站点
              </div>
            ) : (
              enabledSites.map(site => (
                <SelectItem key={site.id} value={site.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{site.name}</span>
                    {showStatus && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {new URL(site.url).hostname}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {enabledSites.length === 0 && (
          <p className="text-xs text-muted-foreground">
            请先在站点管理中配置并启用站点
          </p>
        )}
      </div>
    );
  }

  // 多选模式
  const selectedValues = value as Set<string> | undefined || new Set();

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="flex items-center gap-2">
        <Globe className="h-4 w-4" />
        {label}
        {selectedValues.size > 0 && (
          <Badge variant="secondary" className="ml-2">
            已选 {selectedValues.size}
          </Badge>
        )}
      </Label>

      <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3">
        {sites.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            没有可用的站点
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 pb-2 border-b">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                  checked={enabledSites.length > 0 && enabledSites.every(s => selectedValues.has(s.id))}
                  onCheckedChange={(checked) => {
                    if (onChange) {
                      if (checked) {
                        const newSelection = new Set(selectedValues);
                        enabledSites.forEach(s => newSelection.add(s.id));
                        onChange(newSelection);
                      } else {
                        onChange(new Set());
                      }
                    }
                  }}
                  disabled={disabled || enabledSites.length === 0}
                />
                全选
              </label>
              <span className="text-xs text-muted-foreground">
                {enabledSites.length} 个可用
              </span>
            </div>

            {sites.map(site => (
              <div
                key={site.id}
                className={`flex items-center space-x-2 p-2 rounded hover:bg-muted/50 ${
                  !site.enabled ? 'opacity-50' : ''
                }`}
              >
                <Checkbox
                  id={`site-${site.id}`}
                  checked={selectedValues.has(site.id)}
                  onCheckedChange={(checked) => {
                    if (onChange) {
                      const newSelection = new Set(selectedValues);
                      if (checked) {
                        newSelection.add(site.id);
                      } else {
                        newSelection.delete(site.id);
                      }
                      onChange(newSelection);
                    }
                  }}
                  disabled={disabled || !site.enabled}
                />
                <Label
                  htmlFor={`site-${site.id}`}
                  className={`flex-1 cursor-pointer ${!site.enabled ? 'cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span>{site.name}</span>
                    {showStatus && (
                      <div className="flex items-center gap-2">
                        {!site.enabled && (
                          <Badge variant="secondary" className="text-xs">
                            已禁用
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {new URL(site.url).hostname}
                        </Badge>
                      </div>
                    )}
                  </div>
                </Label>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}