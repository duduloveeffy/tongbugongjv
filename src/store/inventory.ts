import type { InventoryItem } from '@/lib/inventory-utils';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import LZString from 'lz-string';

// 自定义存储，处理压缩
const compressedStorage = {
  getItem: (name: string) => {
    const str = localStorage.getItem(name);
    if (!str) return null;
    
    try {
      const parsed = JSON.parse(str);
      
      // 如果有压缩的库存数据，解压它
      if (parsed.state?.compressedInventoryData) {
        try {
          const decompressed = LZString.decompressFromUTF16(parsed.state.compressedInventoryData);
          if (decompressed) {
            parsed.state.inventoryData = JSON.parse(decompressed);
            console.log(`✅ Restored ${parsed.state.inventoryData.length} inventory items from compressed storage`);
          }
        } catch (e) {
          console.error('Failed to decompress inventory data:', e);
        }
        delete parsed.state.compressedInventoryData;
      }
      
      return JSON.stringify(parsed);
    } catch (e) {
      console.error('Failed to parse stored data:', e);
      return str;
    }
  },
  
  setItem: (name: string, value: string) => {
    try {
      const parsed = JSON.parse(value);
      
      // 如果有库存数据，压缩它
      if (parsed.state?.inventoryData && parsed.state.inventoryData.length > 0) {
        try {
          const compressed = LZString.compressToUTF16(JSON.stringify(parsed.state.inventoryData));
          parsed.state.compressedInventoryData = compressed;
          console.log(`💾 Persisting ${parsed.state.inventoryData.length} inventory items (compressed: ${(compressed.length / 1024).toFixed(2)}KB)`);
          delete parsed.state.inventoryData; // 删除原始数据，只保存压缩版本
        } catch (e) {
          console.error('Failed to compress inventory data:', e);
        }
      }
      
      const finalStr = JSON.stringify(parsed);
      console.log(`Total storage size: ${(finalStr.length / 1024).toFixed(2)}KB`);
      localStorage.setItem(name, finalStr);
    } catch (e) {
      console.error('Failed to save data:', e);
      localStorage.setItem(name, value);
    }
  },
  
  removeItem: (name: string) => {
    localStorage.removeItem(name);
  },
};

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
  setInventoryData: (data: InventoryItem[] | ((prev: InventoryItem[]) => InventoryItem[])) => void;

  // 选中的SKU用于同步
  selectedSkusForSync: Set<string>;
  setSelectedSkusForSync: (skus: Set<string>) => void;

  // 正在同步的SKU
  syncingSkus: Set<string>;
  setSyncingSkus: (skus: Set<string>) => void;

  // 单站点同步选中的站点
  selectedSiteForSync: string | null;
  setSelectedSiteForSync: (siteId: string | null) => void;
  
  // 筛选状态
  filters: {
    isMergedMode: boolean;
    hideZeroStock: boolean;
    hideNormalStatus: boolean;
    showNeedSync: boolean;  // 新增：只显示需要同步的产品
    categoryFilter: string;  // 保留单个品类筛选以兼容
    categoryFilters: string[];  // 新增：多个品类筛选
    skuFilter: string;
    excludeSkuPrefixes: string;
    excludeWarehouses: string;  // 新增：要排除的仓库列表（合并前生效）
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
  
  // 销量检测数据
  salesData: Record<string, any>;
  setSalesData: (data: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  salesLoadingProgress: { current: number; total: number };
  setSalesLoadingProgress: (progress: { current: number; total: number }) => void;
  salesDetectionSites: string[];
  setSalesDetectionSites: (sites: string[]) => void;
  salesDaysBack: number;  // 销量统计天数
  setSalesDaysBack: (days: number) => void;
  
  // 筛选后的数据（用于销量检测页面）
  filteredData: InventoryItem[];
  setFilteredData: (data: InventoryItem[]) => void;
  processedInventoryData: InventoryItem[];
  setProcessedInventoryData: (data: InventoryItem[]) => void;
  
  // 工具函数
  updateInventoryItem: (sku: string, updates: Partial<InventoryItem>) => void;
  clearInventoryData: () => void;
  clearSalesData: () => void;
}

export const useInventoryStore = create<InventoryStore>()(
  persist(
    (set, get) => ({
      // 库存数据
      inventoryData: [],
      setInventoryData: (dataOrUpdater) => 
        set((state) => ({
          inventoryData: typeof dataOrUpdater === 'function' 
            ? dataOrUpdater(state.inventoryData)
            : dataOrUpdater
        })),
      
      // 选中的SKU用于同步
      selectedSkusForSync: new Set(),
      setSelectedSkusForSync: (selectedSkusForSync) => set({ selectedSkusForSync }),

      // 正在同步的SKU
      syncingSkus: new Set(),
      setSyncingSkus: (syncingSkus) => set({ syncingSkus }),

      // 单站点同步选中的站点
      selectedSiteForSync: null,
      setSelectedSiteForSync: (selectedSiteForSync) => set({ selectedSiteForSync }),

      // 筛选状态
      filters: {
        isMergedMode: true,
        hideZeroStock: false,
        hideNormalStatus: false,
        showNeedSync: false,
        categoryFilter: '全部',
        categoryFilters: [],  // 新增：多个品类筛选
        skuFilter: '',
        excludeSkuPrefixes: '',
        excludeWarehouses: '',  // 新增：要排除的仓库列表
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
      
      isSalesDetectionEnabled: true,
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
      
      // 销量检测数据
      salesData: {},
      setSalesData: (dataOrUpdater) => {
        set((state) => ({
          salesData: typeof dataOrUpdater === 'function' 
            ? dataOrUpdater(state.salesData)
            : dataOrUpdater
        }));
      },
      salesLoadingProgress: { current: 0, total: 0 },
      setSalesLoadingProgress: (salesLoadingProgress) => set({ salesLoadingProgress }),
      salesDetectionSites: [],
      setSalesDetectionSites: (salesDetectionSites) => set({ salesDetectionSites }),
      salesDaysBack: 30,
      setSalesDaysBack: (salesDaysBack) => set({ salesDaysBack }),
      
      // 筛选后的数据
      filteredData: [],
      setFilteredData: (filteredData) => set({ filteredData }),
      processedInventoryData: [],
      setProcessedInventoryData: (processedInventoryData) => set({ processedInventoryData }),
      
      // 工具函数
      updateInventoryItem: (sku, updates) => {
        const { inventoryData } = get();
        const updatedData = inventoryData.map(item => {
          if (item.产品代码 === sku) {
            // 如果更新包含multiSiteProductData，合并而不是替换
            if (updates.multiSiteProductData && item.multiSiteProductData) {
              return {
                ...item,
                ...updates,
                multiSiteProductData: {
                  ...item.multiSiteProductData,
                  ...updates.multiSiteProductData
                }
              };
            }
            return { ...item, ...updates };
          }
          return item;
        });
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
          salesData: {},
          filteredData: [],
          processedInventoryData: [],
        });
      },
      
      clearSalesData: () => {
        set({ 
          salesData: {},
          salesLoadingProgress: { current: 0, total: 0 },
        });
      },
    }),
    {
      name: 'inventory-storage',
      storage: createJSONStorage(() => compressedStorage),
      partialize: (state) => ({
        inventoryData: state.inventoryData,
        salesData: state.salesData,
        salesDetectionSites: state.salesDetectionSites,
        salesDaysBack: state.salesDaysBack,
        filters: state.filters,
        sortConfig: state.sortConfig,
        isProductDetectionEnabled: state.isProductDetectionEnabled,
        selectedSiteForSync: state.selectedSiteForSync,
      }),
    }
  )
);