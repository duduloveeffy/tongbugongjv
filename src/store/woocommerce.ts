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
        siteUrl: 'https://jnrpuff.fr',
        consumerKey: 'ck_7ca4e98dd6acc394dbcdc6e2917b1a1b3f757dea',
        consumerSecret: 'cs_93c59b8daf2296c42ca3ae23f746e6a759d41f00',
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
          queryParams.append('skus', ''); // Empty for general order fetching
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
            throw new Error(`API Error: ${response.status} ${errorData.error || response.statusText}`);
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
      
      analyzeSales: () => {
        const { orders } = get();
        
        if (orders.length === 0) {
          set({ salesAnalysis: null });
          return;
        }
        
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total), 0);
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
              const existing = productStats.get(key) || { name: item.name, quantity: 0, revenue: 0 };
              existing.quantity += item.quantity;
              existing.revenue += parseFloat(item.total);
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
          const date = order.date_created.split('T')[0];
          const existing = dailyStats.get(date) || { orders: 0, revenue: 0 };
          existing.orders += 1;
          existing.revenue += parseFloat(order.total);
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