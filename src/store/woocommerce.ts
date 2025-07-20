import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { env } from '@/env';

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
  setTransitOrders: (transitOrders: TransitOrderItem[]) => void;
  
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
  
  fetchSalesAnalysis: (params: {
    skus: string[];
    statuses?: string[];
    startDate?: string;
    endDate?: string;
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
      setTransitOrders: (transitOrders) => set({ transitOrders }),
      
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

      // 优化后的销量检测方法
      fetchSalesAnalysis: async (params: { skus: string[], statuses?: string[], startDate?: string, endDate?: string, onProgress?: (progress: { current: number, total: number, message: string }) => void }) => {
        const { settings } = get();
        const { skus, statuses = ['completed', 'processing'], startDate, endDate, onProgress } = params;
        
        if (!settings.consumerKey || !settings.consumerSecret || !settings.siteUrl) {
          throw new Error('WooCommerce API credentials not configured');
        }

        if (!skus || skus.length === 0) {
          throw new Error('No SKUs provided');
        }

        try {
          // 分批处理SKU，避免URL过长和内存问题
          const batchSize = 50;
          const batches = [];
          for (let i = 0; i < skus.length; i += batchSize) {
            batches.push(skus.slice(i, i + batchSize));
          }

          let allSalesData: Record<string, any> = {};
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

            const response = await fetch('/api/wc-sales-analysis', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                siteUrl: settings.siteUrl,
                consumerKey: settings.consumerKey,
                consumerSecret: settings.consumerSecret,
                skus: batch,
                statuses: statuses.join(','),
                dateStart: startDate ? `${startDate}T00:00:00` : undefined,
                dateEnd: endDate ? `${endDate}T23:59:59` : undefined,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(`API Error: ${response.status} ${errorData.error || response.statusText}`);
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

          return allSalesData;

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
        const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total || '0'), 0);
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
              existing.revenue += parseFloat(item.total || '0');
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
          existing.revenue += parseFloat(order.total || '0');
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
        set({ transitOrders: [] });
      },
    }),
    {
      name: 'woocommerce-store',
      partialize: (state) => ({ settings: state.settings, transitOrders: state.transitOrders }),
    }
  )
); 