import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { WarehouseMapping } from '@/lib/h3yun/types';

/**
 * 氚云 ERP 状态管理
 * 注意：配置信息（Engine Code/Secret/Schema Code）已迁移到环境变量
 * 此 Store 仅存储运行时状态和用户自定义数据
 */
interface H3YunStore {
  // 仓库映射（用户自定义，可选）
  warehouseMappings: WarehouseMapping[];
  setWarehouseMappings: (mappings: WarehouseMapping[]) => void;
  addWarehouseMapping: (mapping: WarehouseMapping) => void;
  removeWarehouseMapping: (id: string) => void;

  // SKU映射开关
  enableSkuMapping: boolean;
  setEnableSkuMapping: (enabled: boolean) => void;

  // 同步状态
  isSyncing: boolean;
  setIsSyncing: (syncing: boolean) => void;

  syncProgress: {
    current: number;
    total: number;
    status: string;
  };
  setSyncProgress: (progress: H3YunStore['syncProgress']) => void;

  // 最后同步时间
  lastSyncTime: string | null;
  setLastSyncTime: (time: string) => void;

  // 清除所有数据
  clearAll: () => void;
}

export const useH3YunStore = create<H3YunStore>()(
  persist(
    (set) => ({
      // 仓库映射
      warehouseMappings: [],
      setWarehouseMappings: (warehouseMappings) => set({ warehouseMappings }),
      addWarehouseMapping: (mapping) =>
        set((state) => ({
          warehouseMappings: [...state.warehouseMappings, mapping],
        })),
      removeWarehouseMapping: (id) =>
        set((state) => ({
          warehouseMappings: state.warehouseMappings.filter(
            (m) => m.id !== id
          ),
        })),

      // SKU映射开关
      enableSkuMapping: false,
      setEnableSkuMapping: (enableSkuMapping) => set({ enableSkuMapping }),

      // 同步状态
      isSyncing: false,
      setIsSyncing: (isSyncing) => set({ isSyncing }),

      syncProgress: {
        current: 0,
        total: 0,
        status: '',
      },
      setSyncProgress: (syncProgress) => set({ syncProgress }),

      // 最后同步时间
      lastSyncTime: null,
      setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),

      // 清除所有数据
      clearAll: () =>
        set({
          warehouseMappings: [],
          lastSyncTime: null,
          enableSkuMapping: false,
        }),
    }),
    {
      name: 'h3yun-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        warehouseMappings: state.warehouseMappings,
        lastSyncTime: state.lastSyncTime,
        enableSkuMapping: state.enableSkuMapping,
      }),
    }
  )
);
