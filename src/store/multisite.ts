import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WCSite, MultiSiteSalesData } from '@/lib/supabase';
import { toast } from 'sonner';
import { authFetch } from './auth';

interface SyncStatus {
  status: 'idle' | 'syncing' | 'error';
  progress: number;
  message: string;
  lastSync: Date | null;
}

interface MultiSiteStore {
  // Sites management
  sites: WCSite[];
  activeSiteIds: string[];
  isLoadingSites: boolean;
  
  // Sales data cache
  salesData: Map<string, MultiSiteSalesData>;
  
  // Sync status per site
  syncStatus: Map<string, SyncStatus>;
  
  // Global sync state
  isGlobalSyncing: boolean;
  globalSyncMessage: string;
  
  // Actions - Sites
  fetchSites: () => Promise<void>;
  addSite: (site: Omit<WCSite, 'id' | 'created_at' | 'updated_at'>) => Promise<WCSite | null>;
  updateSite: (id: string, updates: Partial<WCSite>) => Promise<boolean>;
  deleteSite: (id: string) => Promise<boolean>;
  testSiteConnection: (url: string, apiKey: string, apiSecret: string) => Promise<boolean>;
  toggleSiteActive: (siteId: string) => void;
  selectAllSites: () => void;
  deselectAllSites: () => void;
  
  // Actions - Sales Data
  fetchMultiSiteSales: (skus: string[], forceRefresh?: boolean) => Promise<void>;
  clearSalesData: () => void;
  
  // Actions - Sync
  triggerManualSync: (siteIds: string[], skus: string[]) => Promise<void>;
  updateSyncStatus: (siteId: string, status: Partial<SyncStatus>) => void;
}

export const useMultiSiteStore = create<MultiSiteStore>()(
  persist(
    (set, get) => ({
      // Initial state
      sites: [],
      activeSiteIds: [],
      isLoadingSites: false,
      salesData: new Map(),
      syncStatus: new Map(),
      isGlobalSyncing: false,
      globalSyncMessage: '',
      
      // Fetch all sites from Supabase
      fetchSites: async () => {
        set({ isLoadingSites: true });

        try {
          const response = await authFetch('/api/sites');
          const data = await response.json();
          
          if (data.success) {
            const sites = data.sites || [];
            set({ 
              sites,
              // Auto-select all enabled sites
              activeSiteIds: sites.filter((s: WCSite) => s.enabled).map((s: WCSite) => s.id),
            });
            
            // Initialize sync status for each site
            const syncStatus = new Map<string, SyncStatus>();
            sites.forEach((site: WCSite) => {
              syncStatus.set(site.id, {
                status: 'idle',
                progress: 0,
                message: '',
                lastSync: site.last_sync_at ? new Date(site.last_sync_at) : null,
              });
            });
            set({ syncStatus });
          } else {
            console.error('Failed to fetch sites:', data.error);
            toast.error('获取站点列表失败');
          }
        } catch (error) {
          console.error('Failed to fetch sites:', error);
          toast.error('获取站点列表失败');
        } finally {
          set({ isLoadingSites: false });
        }
      },
      
      // Add a new site
      addSite: async (siteData) => {
        try {
          const response = await authFetch('/api/sites', {
            method: 'POST',
            body: JSON.stringify({
              name: siteData.name,
              url: siteData.url,
              apiKey: siteData.api_key,
              apiSecret: siteData.api_secret,
            }),
          });
          
          const data = await response.json();
          
          if (data.success && data.site) {
            const { sites, syncStatus } = get();
            const newSites = [...sites, data.site];
            
            // Add sync status for new site
            const newSyncStatus = new Map(syncStatus);
            newSyncStatus.set(data.site.id, {
              status: 'idle',
              progress: 0,
              message: '',
              lastSync: null,
            });
            
            set({ 
              sites: newSites,
              syncStatus: newSyncStatus,
              activeSiteIds: [...get().activeSiteIds, data.site.id],
            });
            
            toast.success(`站点 "${data.site.name}" 添加成功`);
            return data.site;
          } else {
            toast.error(data.error || '添加站点失败');
            return null;
          }
        } catch (error) {
          console.error('Failed to add site:', error);
          toast.error('添加站点失败');
          return null;
        }
      },
      
      // Update a site
      updateSite: async (id, updates) => {
        try {
          const response = await authFetch('/api/sites', {
            method: 'PUT',
            body: JSON.stringify({ id, ...updates }),
          });
          
          const data = await response.json();
          
          if (data.success && data.site) {
            const { sites } = get();
            const updatedSites = sites.map(s => s.id === id ? data.site : s);
            set({ sites: updatedSites });
            toast.success('站点更新成功');
            return true;
          } else {
            // 提供更详细的错误信息
            let errorMessage = data.error || '更新站点失败';
            if (data.details) {
              errorMessage += `\n详情: ${data.details}`;
            }
            if (data.hint) {
              errorMessage += `\n提示: ${data.hint}`;
            }
            
            toast.error(errorMessage, {
              duration: 5000,
            });
            
            console.error('Update site failed:', data);
            return false;
          }
        } catch (error) {
          console.error('Failed to update site:', error);
          toast.error('更新站点失败：网络错误');
          return false;
        }
      },
      
      // Delete a site
      deleteSite: async (id) => {
        try {
          const response = await authFetch(`/api/sites?id=${id}`, {
            method: 'DELETE',
          });
          
          const data = await response.json();
          
          if (data.success) {
            const { sites, activeSiteIds, syncStatus } = get();
            const newSites = sites.filter(s => s.id !== id);
            const newActiveSiteIds = activeSiteIds.filter(sid => sid !== id);
            
            // Remove sync status
            const newSyncStatus = new Map(syncStatus);
            newSyncStatus.delete(id);
            
            set({ 
              sites: newSites,
              activeSiteIds: newActiveSiteIds,
              syncStatus: newSyncStatus,
            });
            
            toast.success('站点删除成功');
            return true;
          } else {
            toast.error(data.error || '删除站点失败');
            return false;
          }
        } catch (error) {
          console.error('Failed to delete site:', error);
          toast.error('删除站点失败');
          return false;
        }
      },
      
      // Test site connection
      testSiteConnection: async (url, apiKey, apiSecret) => {
        try {
          const response = await authFetch('/api/sites/test', {
            method: 'POST',
            body: JSON.stringify({ url, apiKey, apiSecret }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            toast.success('连接测试成功');
            if (data.storeInfo) {
              console.log('Store info:', data.storeInfo);
            }
            return true;
          } else {
            // 提供更详细的错误信息
            if (data.hint) {
              toast.error(`${data.error}\n${data.hint}`, {
                duration: 5000,
              });
            } else {
              toast.error(data.error || '连接测试失败');
            }
            
            // 如果有预览内容，在控制台显示
            if (data.preview) {
              console.error('Response preview:', data.preview);
            }
            return false;
          }
        } catch (error) {
          console.error('Connection test failed:', error);
          toast.error('连接测试失败：网络错误');
          return false;
        }
      },
      
      // Toggle site active status
      toggleSiteActive: (siteId) => {
        const { activeSiteIds } = get();
        const isActive = activeSiteIds.includes(siteId);
        
        if (isActive) {
          set({ activeSiteIds: activeSiteIds.filter(id => id !== siteId) });
        } else {
          set({ activeSiteIds: [...activeSiteIds, siteId] });
        }
      },
      
      // Select all sites
      selectAllSites: () => {
        const { sites } = get();
        set({ activeSiteIds: sites.filter(s => s.enabled).map(s => s.id) });
      },
      
      // Deselect all sites
      deselectAllSites: () => {
        set({ activeSiteIds: [] });
      },
      
      // Fetch multi-site sales data
      fetchMultiSiteSales: async (skus, forceRefresh = false) => {
        const { activeSiteIds } = get();
        
        if (activeSiteIds.length === 0) {
          toast.error('请先选择要查询的站点');
          return;
        }
        
        set({ isGlobalSyncing: true, globalSyncMessage: '正在获取销量数据...' });
        
        try {
          const response = await authFetch('/api/sales/multi-site', {
            method: 'POST',
            body: JSON.stringify({
              skus,
              siteIds: activeSiteIds,
              forceRefresh,
            }),
          });
          
          const data = await response.json();
          
          if (response.status === 503 && data.fallbackMode) {
            // Supabase not configured, fall back to single-site mode
            toast.warning('多站点功能未配置，使用单站点模式');
            return;
          }
          
          if (data.success) {
            // Update sales data
            const salesData = new Map<string, MultiSiteSalesData>();
            Object.entries(data.data).forEach(([sku, skuData]) => {
              salesData.set(sku, skuData as MultiSiteSalesData);
            });
            
            set({ salesData });
            
            // Show sync status
            if (data.syncTriggered) {
              const message = data.missingSkus.length > 0 
                ? `正在后台同步 ${data.missingSkus.length} 个新SKU的数据`
                : `正在后台更新 ${data.staleSkus.length} 个SKU的数据`;
              toast.info(message);
            }
            
            toast.success(`成功获取 ${skus.length} 个SKU的销量数据`);
          } else {
            toast.error(data.error || '获取销量数据失败');
          }
        } catch (error) {
          console.error('Failed to fetch sales data:', error);
          toast.error('获取销量数据失败');
        } finally {
          set({ isGlobalSyncing: false, globalSyncMessage: '' });
        }
      },
      
      // Clear sales data
      clearSalesData: () => {
        set({ salesData: new Map() });
      },
      
      // Trigger manual sync
      triggerManualSync: async (siteIds, skus) => {
        set({ isGlobalSyncing: true, globalSyncMessage: '正在同步数据...' });
        
        try {
          // Create sync tasks for each site
          const promises = siteIds.map(siteId =>
            authFetch('/api/sales/sync', {
              method: 'POST',
              body: JSON.stringify({ siteId, skus }),
            })
          );
          
          const results = await Promise.allSettled(promises);
          
          const successful = results.filter(r => r.status === 'fulfilled').length;
          const failed = results.filter(r => r.status === 'rejected').length;
          
          if (successful > 0) {
            toast.success(`${successful} 个站点同步成功`);
            
            // Refresh sales data
            await get().fetchMultiSiteSales(skus);
          }
          
          if (failed > 0) {
            toast.error(`${failed} 个站点同步失败`);
          }
          
        } catch (error) {
          console.error('Manual sync failed:', error);
          toast.error('同步失败');
        } finally {
          set({ isGlobalSyncing: false, globalSyncMessage: '' });
        }
      },
      
      // Update sync status for a site
      updateSyncStatus: (siteId, status) => {
        const { syncStatus } = get();
        const newSyncStatus = new Map(syncStatus);
        const current = newSyncStatus.get(siteId) || {
          status: 'idle',
          progress: 0,
          message: '',
          lastSync: null,
        };
        
        newSyncStatus.set(siteId, { ...current, ...status });
        set({ syncStatus: newSyncStatus });
      },
    }),
    {
      name: 'multisite-storage',
      partialize: (state) => ({
        activeSiteIds: state.activeSiteIds,
      }),
    }
  )
);