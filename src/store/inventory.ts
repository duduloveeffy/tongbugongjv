import type { InventoryItem } from '@/lib/inventory-utils';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SortField = 
  | '产品代码' 
  | '产品名称' 
  | '净可售库存' 
  | '在途库存' 
  | '30天销售数量' 
  | '预测库存（在途）'
  | '订单数'
  | '销售数量'
  | '30天订单数';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface InventoryStore {
  // 库存数据
  inventoryData: InventoryItem[];
  setInventoryData: (data: InventoryItem[]) => void;
  
  // 选中的SKU用于同步
  selectedSkusForSync: Set<string>;
  setSelectedSkusForSync: (skus: Set<string>) => void;
  
  // 正在同步的SKU
  syncingSkus: Set<string>;
  setSyncingSkus: (skus: Set<string>) => void;
  
  // 筛选状态
  filters: {
    isMergedMode: boolean;
    hideZeroStock: boolean;
    hideNormalStatus: boolean;
    categoryFilter: string;
    skuFilter: string;
  };
  setFilters: (filters: Partial<InventoryStore['filters']>) => void;
  
  // 排序配置
  sortConfig: SortConfig | null;
  setSortConfig: (config: SortConfig | null) => void;
  
  // 功能开关
  isProductDetectionEnabled: boolean;
  setIsProductDetectionEnabled: (enabled: boolean) => void;
  
  isSalesDetectionEnabled: boolean;
  setIsSalesDetectionEnabled: (enabled: boolean) => void;
  
  // 进度状态
  productDetectionProgress: string;
  setProductDetectionProgress: (progress: string) => void;
  
  salesDetectionProgress: string;
  setSalesDetectionProgress: (progress: string) => void;
  
  // 加载状态
  isProductDetectionLoading: boolean;
  setIsProductDetectionLoading: (loading: boolean) => void;
  
  isSalesDetectionLoading: boolean;
  setIsSalesDetectionLoading: (loading: boolean) => void;
  
  // 工具函数
  updateInventoryItem: (sku: string, updates: Partial<InventoryItem>) => void;
  clearInventoryData: () => void;
}

export const useInventoryStore = create<InventoryStore>()(
  persist(
    (set, get) => ({
      // 库存数据
      inventoryData: [],
      setInventoryData: (inventoryData) => set({ inventoryData }),
      
      // 选中的SKU用于同步
      selectedSkusForSync: new Set(),
      setSelectedSkusForSync: (selectedSkusForSync) => set({ selectedSkusForSync }),
      
      // 正在同步的SKU
      syncingSkus: new Set(),
      setSyncingSkus: (syncingSkus) => set({ syncingSkus }),
      
      // 筛选状态
      filters: {
        isMergedMode: true,
        hideZeroStock: false,
        hideNormalStatus: false,
        categoryFilter: '全部',
        skuFilter: '',
      },
      setFilters: (newFilters) => set(state => ({ 
        filters: { ...state.filters, ...newFilters } 
      })),
      
      // 排序配置
      sortConfig: null,
      setSortConfig: (sortConfig) => set({ sortConfig }),
      
      // 功能开关
      isProductDetectionEnabled: false,
      setIsProductDetectionEnabled: (isProductDetectionEnabled) => 
        set({ isProductDetectionEnabled }),
      
      isSalesDetectionEnabled: false,
      setIsSalesDetectionEnabled: (isSalesDetectionEnabled) => 
        set({ isSalesDetectionEnabled }),
      
      // 进度状态
      productDetectionProgress: '',
      setProductDetectionProgress: (productDetectionProgress) => 
        set({ productDetectionProgress }),
      
      salesDetectionProgress: '',
      setSalesDetectionProgress: (salesDetectionProgress) => 
        set({ salesDetectionProgress }),
      
      // 加载状态
      isProductDetectionLoading: false,
      setIsProductDetectionLoading: (isProductDetectionLoading) => 
        set({ isProductDetectionLoading }),
      
      isSalesDetectionLoading: false,
      setIsSalesDetectionLoading: (isSalesDetectionLoading) => 
        set({ isSalesDetectionLoading }),
      
      // 工具函数
      updateInventoryItem: (sku, updates) => {
        const { inventoryData } = get();
        const updatedData = inventoryData.map(item => 
          item.产品代码 === sku ? { ...item, ...updates } : item
        );
        set({ inventoryData: updatedData });
      },
      
      clearInventoryData: () => {
        set({ 
          inventoryData: [],
          selectedSkusForSync: new Set(),
          syncingSkus: new Set(),
          productDetectionProgress: '',
          salesDetectionProgress: '',
          isProductDetectionLoading: false,
          isSalesDetectionLoading: false,
        });
      },
    }),
    {
      name: 'inventory-store',
      partialize: (state) => ({
        inventoryData: state.inventoryData,
        filters: state.filters,
        isProductDetectionEnabled: state.isProductDetectionEnabled,
        isSalesDetectionEnabled: state.isSalesDetectionEnabled,
      }),
    }
  )
);