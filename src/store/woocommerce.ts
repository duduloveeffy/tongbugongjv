import { env } from '@/env';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WooCommerceSettings {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: string;
  total: string;
  sku: string | undefined;
}

interface WooCommerceOrder {
  id: number;
  status: string;
  date_created: string;
  date_completed: string | null;
  total: string;
  line_items: OrderItem[];
  billing: {
    first_name: string;
    last_name: string;
    email: string;
  };
  currency: string;
}

// 在途订单数据结构
interface TransitOrderItem {
  产品型号: string;
  产品英文名称: string;
  数量: number;
}

// 文件数据结构
interface TransitFile {
  id: string;
  fileName: string;
  uploadTime: string;
  items: TransitOrderItem[];
  skuCount: number;
  totalQuantity: number;
}

interface SalesAnalysis {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  topProducts: Array<{
    sku: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  ordersByStatus: Record<string, number>;
  dailySales: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
}

interface WooCommerceStore {
  // Settings
  settings: WooCommerceSettings;
  setSettings: (settings: WooCommerceSettings) => void;
  
  // Orders data
  orders: WooCommerceOrder[];
  setOrders: (orders: WooCommerceOrder[]) => void;
  
  // 在途订单数据
  transitOrders: TransitOrderItem[];
  transitFiles: TransitFile[];
  setTransitOrders: (transitOrders: TransitOrderItem[]) => void;
  addTransitOrders: (transitOrders: TransitOrderItem[]) => void;
  addTransitFile: (fileName: string, items: TransitOrderItem[]) => void;
  removeTransitFile: (fileId: string) => void;
  
  // Sales analysis
  salesAnalysis: SalesAnalysis | null;
  setSalesAnalysis: (analysis: SalesAnalysis) => void;
  
  // Loading states
  isLoadingOrders: boolean;
  setIsLoadingOrders: (loading: boolean) => void;
  
  // API functions
  fetchOrders: (params: {
    status?: string[];
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
  
  fetchOrdersFromSupabase: (params?: {
    siteIds?: string[];
    status?: string[];
    startDate?: string;
    endDate?: string;
    daysBack?: number;
  }) => Promise<void>;
  
  fetchSalesAnalysis: (params: {
    skus: string[];
    dataSource?: 'supabase' | 'woocommerce';
    siteIds?: string[];  // For Supabase
    siteId?: string;     // For WooCommerce
    statuses?: string[];
    startDate?: string;
    endDate?: string;
    daysBack?: number;
    salesDetectionDays?: number; // 销量检测弹窗配置的天数（用于 orderCount/salesQuantity）
    onProgress?: (progress: { current: number; total: number; message: string }) => void;
  }) => Promise<Record<string, any>>;
  
  analyzeSales: () => void;
  
  // 在途订单相关功能
  getTransitQuantityBySku: (sku: string) => number;
  clearTransitOrders: () => void;
}

export const useWooCommerceStore = create<WooCommerceStore>()(
  persist(
    (set, get) => ({
      // Settings
      settings: {
        siteUrl: env.NEXT_PUBLIC_WOOCOMMERCE_SITE_URL || '',
        consumerKey: env.NEXT_PUBLIC_WOOCOMMERCE_CONSUMER_KEY || '',
        consumerSecret: env.NEXT_PUBLIC_WOOCOMMERCE_CONSUMER_SECRET || '',
      },
      setSettings: (settings) => set({ settings }),
      
      // Orders data
      orders: [],
      setOrders: (orders) => set({ orders }),
      
      // 在途订单数据
      transitOrders: [],
      transitFiles: [],
      setTransitOrders: (transitOrders) => set({ transitOrders }),
      addTransitOrders: (newTransitOrders) => {
        const { transitOrders } = get();
        
        // 创建一个Map来聚合SKU数量
        const aggregatedMap = new Map<string, TransitOrderItem>();
        
        // 先添加现有的在途订单到Map
        transitOrders.forEach(item => {
          const existing = aggregatedMap.get(item.产品型号);
          if (existing) {
            existing.数量 += item.数量;
          } else {
            aggregatedMap.set(item.产品型号, { ...item });
          }
        });
        
        // 添加新的在途订单到Map，自动聚合相同SKU
        newTransitOrders.forEach(item => {
          const existing = aggregatedMap.get(item.产品型号);
          if (existing) {
            existing.数量 += item.数量;
            // 如果产品英文名称为空，尝试使用新的名称
            if (!existing.产品英文名称 && item.产品英文名称) {
              existing.产品英文名称 = item.产品英文名称;
            }
          } else {
            aggregatedMap.set(item.产品型号, { ...item });
          }
        });
        
        // 将Map转换回数组
        const aggregatedOrders = Array.from(aggregatedMap.values());
        
        set({ transitOrders: aggregatedOrders });
      },
      
      addTransitFile: (fileName: string, items: TransitOrderItem[]) => {
        const { transitFiles } = get();
        
        // 计算文件统计信息
        const skuSet = new Set(items.map(item => item.产品型号));
        const totalQuantity = items.reduce((sum, item) => sum + item.数量, 0);
        
        // 创建新文件记录
        const newFile: TransitFile = {
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          fileName,
          uploadTime: new Date().toISOString(),
          items,
          skuCount: skuSet.size,
          totalQuantity,
        };
        
        // 添加文件记录
        set({ transitFiles: [...transitFiles, newFile] });
        
        // 同时更新总的在途订单
        get().addTransitOrders(items);
      },
      
      removeTransitFile: (fileId: string) => {
        const { transitFiles } = get();
        const fileToRemove = transitFiles.find(f => f.id === fileId);
        
        if (!fileToRemove) return;
        
        // 移除文件
        const newFiles = transitFiles.filter(f => f.id !== fileId);
        set({ transitFiles: newFiles });
        
        // 重新计算所有在途订单
        const allItems: TransitOrderItem[] = [];
        newFiles.forEach(file => {
          allItems.push(...file.items);
        });
        
        // 聚合所有订单
        const aggregatedMap = new Map<string, TransitOrderItem>();
        allItems.forEach(item => {
          const existing = aggregatedMap.get(item.产品型号);
          if (existing) {
            existing.数量 += item.数量;
            if (!existing.产品英文名称 && item.产品英文名称) {
              existing.产品英文名称 = item.产品英文名称;
            }
          } else {
            aggregatedMap.set(item.产品型号, { ...item });
          }
        });
        
        set({ transitOrders: Array.from(aggregatedMap.values()) });
      },
      
      // Sales analysis
      salesAnalysis: null,
      setSalesAnalysis: (salesAnalysis) => set({ salesAnalysis }),
      
      // Loading states
      isLoadingOrders: false,
      setIsLoadingOrders: (isLoadingOrders) => set({ isLoadingOrders }),
      
      // API functions
      fetchOrders: async (params) => {
        const { settings } = get();
        set({ isLoadingOrders: true });
        
        try {
          const { status = [], startDate, endDate } = params;
          
          // Check if credentials are configured
          if (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl) {
            throw new Error('WooCommerce API credentials not configured');
          }
          
          // Build query parameters for API route
          const queryParams = new URLSearchParams();
          queryParams.append('siteUrl', settings.siteUrl);
          queryParams.append('consumerKey', settings.consumerKey);
          queryParams.append('consumerSecret', settings.consumerSecret);
          queryParams.append('statuses', status.join(',') || 'completed,processing,pending');
          
          if (startDate) {
            queryParams.append('dateStart', `${startDate}T00:00:00`);
          }
          
          if (endDate) {
            queryParams.append('dateEnd', `${endDate}T23:59:59`);
          }
          
          const response = await fetch(`/api/wc-orders?${queryParams.toString()}`);
          
          if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error || response.statusText;
            
            // Provide user-friendly error messages
            if (response.status === 504 || errorMessage.includes('timeout')) {
              throw new Error('连接超时：无法连接到WooCommerce网站，请检查网站是否在线或稍后重试');
            } else if (response.status === 401) {
              throw new Error('认证失败：请检查API密钥是否正确');
            } else if (response.status === 403) {
              throw new Error('权限不足：请确保API密钥具有读取订单的权限');
            } else {
              throw new Error(`API错误: ${errorMessage}`);
            }
          }
          
          const orders = await response.json();
          set({ orders, isLoadingOrders: false });
          
          // Auto analyze sales after fetching
          get().analyzeSales();
          
        } catch (error) {
          console.error('获取订单失败:', error);
          set({ isLoadingOrders: false });
          throw error;
        }
      },

      // 从Supabase加载订单数据
      fetchOrdersFromSupabase: async (params = {}) => {
        const { siteIds, status = ['completed', 'processing'], startDate, endDate, daysBack = 30 } = params;
        set({ isLoadingOrders: true });
        
        try {
          // 构建查询参数
          const queryParams = new URLSearchParams();
          if (siteIds && siteIds.length > 0) {
            queryParams.append('siteIds', siteIds.join(','));
          }
          queryParams.append('statuses', status.join(','));
          if (startDate) {
            queryParams.append('startDate', startDate);
          }
          if (endDate) {
            queryParams.append('endDate', endDate);
          }
          queryParams.append('limit', '2000'); // 获取更多订单用于分析
          
          const response = await fetch(`/api/orders/supabase?${queryParams.toString()}`);
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch orders from Supabase');
          }
          
          const result = await response.json();
          
          if (result.success && result.orders) {
            set({ orders: result.orders, isLoadingOrders: false });
            
            // 自动分析销量
            get().analyzeSales();
            
            console.log(`Loaded ${result.orders.length} orders from Supabase`);
          } else {
            throw new Error('Invalid response from Supabase');
          }
          
        } catch (error) {
          console.error('Failed to fetch orders from Supabase:', error);
          set({ isLoadingOrders: false });
          throw error;
        }
      },

      // 优化后的销量检测方法 - 支持多数据源
      fetchSalesAnalysis: async (params) => {
        const { settings } = get();
        const {
          skus,
          dataSource = 'woocommerce',
          siteIds,
          siteId,
          statuses = ['completed', 'processing'],
          startDate,
          endDate,
          daysBack = 30,
          salesDetectionDays, // 销量检测弹窗配置的天数
          onProgress
        } = params;

        if (!skus || skus.length === 0) {
          throw new Error('No SKUs provided');
        }

        try {
          // 根据数据源选择不同的API端点
          if (dataSource === 'supabase') {
            // Supabase数据源
            if (onProgress) {
              onProgress({
                current: 0,
                total: skus.length,
                message: `正在查询销量数据...`
              });
            }

            const response = await fetch('/api/sales-analysis/supabase', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                skus,
                siteIds,
                statuses,
                dateStart: startDate,
                dateEnd: endDate,
                daysBack,
                salesDetectionDays, // 弹窗配置的天数（用于 orderCount/salesQuantity）
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(`Supabase API Error: ${response.status} ${errorData.error || response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
              if (onProgress) {
                onProgress({
                  current: skus.length,
                  total: skus.length,
                  message: `✅ 成功从Supabase获取销量数据`
                });
              }
              
              // 转换Supabase数据格式为统一格式
              const salesDataArray: any[] = [];
              Object.keys(result.data).forEach(sku => {
                const skuData = result.data[sku];
                // 如果是多站点数据，使用总计
                const itemData = skuData.total || {
                  orderCount: 0,
                  salesQuantity: 0,
                  orderCountDaysN: 0,
                  salesQuantityDaysN: 0,
                };
                // 添加SKU和销量字段
                salesDataArray.push({
                  sku,
                  orderCount: itemData.orderCount || 0,
                  salesQuantity: itemData.salesQuantity || 0,
                  orderCountDaysN: itemData.orderCountDaysN || 0,
                  salesQuantityDaysN: itemData.salesQuantityDaysN || 0,
                  // 附加站点详细信息
                  bySite: skuData.bySite || null
                });
              });

              return { success: true, data: salesDataArray };
            } else {
              throw new Error(result.error || 'Supabase sales analysis failed');
            }
            
          } else {
            // WooCommerce数据源（原有逻辑，但支持站点选择）
            let apiUrl = settings.siteUrl;
            let apiKey = settings.consumerKey;
            let apiSecret = settings.consumerSecret;
            
            // 如果提供了siteId，尝试从Supabase获取站点配置
            if (siteId) {
              const siteResponse = await fetch(`/api/sales-analysis/woocommerce?siteId=${siteId}`);
              if (siteResponse.ok) {
                const siteData = await siteResponse.json();
                if (siteData.site) {
                  apiUrl = siteData.site.url;
                  apiKey = siteData.site.api_key;
                  apiSecret = siteData.site.api_secret;
                }
              }
            }
            
            // 检查凭证
            if (!apiKey || !apiSecret || !apiUrl) {
              throw new Error('WooCommerce API credentials not configured');
            }

            // 分批处理SKU
            const batchSize = 50;
            const batches = [];
            for (let i = 0; i < skus.length; i += batchSize) {
              batches.push(skus.slice(i, i + batchSize));
            }

            const allSalesData: Record<string, any> = {};
            let totalProcessed = 0;

            for (let i = 0; i < batches.length; i++) {
              const batch = batches[i];
              if (!batch) continue;
              
              if (onProgress) {
                onProgress({
                  current: totalProcessed,
                  total: skus.length,
                  message: `正在处理批次 ${i + 1}/${batches.length}，包含 ${batch.length} 个SKU...`
                });
              }

              const response = await fetch('/api/sales-analysis/woocommerce', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  siteId,
                  siteUrl: apiUrl,
                  consumerKey: apiKey,
                  consumerSecret: apiSecret,
                  skus: batch,
                  statuses: statuses.join(','),
                  dateStart: startDate ? `${startDate}T00:00:00` : undefined,
                  dateEnd: endDate ? `${endDate}T23:59:59` : undefined,
                  daysBack,
                }),
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`WooCommerce API Error: ${response.status} ${errorData.error || response.statusText}`);
              }

              const result = await response.json();
              
              if (result.success) {
                // 合并批次结果
                Object.assign(allSalesData, result.data);
                totalProcessed += batch.length;
                
                if (onProgress) {
                  onProgress({
                    current: totalProcessed,
                    total: skus.length,
                    message: `已完成 ${totalProcessed}/${skus.length} 个SKU的销量分析`
                  });
                }
              } else {
                throw new Error(result.error || 'Sales analysis failed');
              }

              // 添加延迟避免API限流
              if (i < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }

            // Convert to array format consistent with Supabase response
            const salesDataArray = Object.entries(allSalesData).map(([sku, data]: [string, any]) => ({
              sku,
              orderCount: data.orderCount || 0,
              salesQuantity: data.salesQuantity || 0,
              orderCountDaysN: data.orderCountDaysN || 0,
              salesQuantityDaysN: data.salesQuantityDaysN || 0
            }));

            return { success: true, data: salesDataArray };
          }

        } catch (error: any) {
          console.error('Sales analysis failed:', error);
          throw error;
        }
      },
      
      analyzeSales: () => {
        const { orders } = get();
        
        if (orders.length === 0) {
          set({ salesAnalysis: null });
          return;
        }
        
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, order) => sum + Number.parseFloat(order.total || '0'), 0);
        const averageOrderValue = totalRevenue / totalOrders;
        
        // Count orders by status
        const ordersByStatus = orders.reduce((acc, order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        // Calculate top products
        const productStats = new Map<string, { name: string; quantity: number; revenue: number }>();
        
        orders.forEach(order => {
          order.line_items.forEach(item => {
            const key = item.sku || item.name;
            if (key) {
              const existing = productStats.get(key) || { name: item.name || 'Unknown', quantity: 0, revenue: 0 };
              existing.quantity += item.quantity || 0;
              existing.revenue += Number.parseFloat(item.total || '0');
              productStats.set(key, existing);
            }
          });
        });
        
        const topProducts = Array.from(productStats.entries())
          .map(([sku, stats]) => ({ sku: sku || 'Unknown', ...stats }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10);
        
        // Calculate daily sales
        const dailyStats = new Map<string, { orders: number; revenue: number }>();
        
        orders.forEach(order => {
          const dateCreated = order.date_created;
          if (!dateCreated) return; // 跳过没有创建日期的订单
          const date = dateCreated.split('T')[0];
          if (!date) return; // 额外的安全检查
          const existing = dailyStats.get(date) || { orders: 0, revenue: 0 };
          existing.orders += 1;
          existing.revenue += Number.parseFloat(order.total || '0');
          dailyStats.set(date, existing);
        });
        
        const dailySales = Array.from(dailyStats.entries())
          .map(([date, stats]) => ({ date, ...stats }))
          .sort((a, b) => a.date.localeCompare(b.date));
        
        const analysis: SalesAnalysis = {
          totalOrders,
          totalRevenue,
          averageOrderValue,
          topProducts,
          ordersByStatus,
          dailySales,
        };
        
        set({ salesAnalysis: analysis });
      },
      
      // 在途订单相关功能
      getTransitQuantityBySku: (sku: string) => {
        const { transitOrders } = get();
        return transitOrders.reduce((sum, item) => {
          return item.产品型号 === sku ? sum + item.数量 : sum;
        }, 0);
      },
      
      clearTransitOrders: () => {
        set({ transitOrders: [], transitFiles: [] });
      },
    }),
    {
      name: 'woocommerce-store',
      partialize: (state) => ({ 
        settings: state.settings, 
        transitOrders: state.transitOrders,
        transitFiles: state.transitFiles,
      }),
    }
  )
); 