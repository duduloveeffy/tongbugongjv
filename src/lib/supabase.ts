import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';

// Database types (will be generated from Supabase CLI later)
export interface Database {
  public: {
    Tables: {
      wc_sites: {
        Row: {
          id: string;
          name: string;
          url: string;
          api_key: string;
          api_secret: string;
          enabled: boolean;
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
          // 站点级过滤配置
          sku_filter: string | null;
          exclude_sku_prefixes: string | null;
          category_filters: string[] | null;
          exclude_warehouses: string | null;
        };
        Insert: Omit<Database['public']['Tables']['wc_sites']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['wc_sites']['Insert']>;
      };
      sales_cache: {
        Row: {
          id: string;
          sku: string;
          site_id: string;
          order_count: number;
          sales_quantity: number;
          order_count_30d: number;
          sales_quantity_30d: number;
          date_range_start: string | null;
          date_range_end: string | null;
          cache_expires_at: string | null;
          last_updated: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sales_cache']['Row'], 'id' | 'created_at' | 'last_updated'>;
        Update: Partial<Database['public']['Tables']['sales_cache']['Insert']>;
      };
      sync_tasks: {
        Row: {
          id: string;
          site_id: string;
          task_type: 'full' | 'incremental' | 'sku_batch';
          sku_list: string[] | null;
          priority: number;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          retry_count: number;
          error_message: string | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['sync_tasks']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['sync_tasks']['Insert']>;
      };
      sync_checkpoints: {
        Row: {
          site_id: string;
          last_order_id: number | null;
          last_order_date: string | null;
          last_sync_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sync_checkpoints']['Row'], 'updated_at'>;
        Update: Partial<Database['public']['Tables']['sync_checkpoints']['Insert']>;
      };
      sync_metrics: {
        Row: {
          id: string;
          site_id: string;
          date: string;
          total_syncs: number;
          successful_syncs: number;
          failed_syncs: number;
          avg_duration_ms: number | null;
          total_skus_synced: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sync_metrics']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['sync_metrics']['Insert']>;
      };
      products_cache: {
        Row: {
          id: string;
          site_id: string;
          product_id: number | null;
          sku: string;
          name: string | null;
          description: string | null;
          price: number | null;
          regular_price: number | null;
          sale_price: number | null;
          stock_quantity: number;
          stock_status: string | null;
          manage_stock: boolean;
          status: string | null;
          product_type: string | null;
          product_url: string | null;
          image_url: string | null;
          categories: any | null;
          attributes: any | null;
          last_updated: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['products_cache']['Row'], 'id' | 'created_at' | 'last_updated'>;
        Update: Partial<Database['public']['Tables']['products_cache']['Insert']>;
      };
      stock_history: {
        Row: {
          id: string;
          site_id: string;
          sku: string;
          product_name: string | null;
          stock_before: number | null;
          stock_after: number | null;
          change_amount: number | null;
          change_type: string | null;
          change_reason: string | null;
          recorded_at: string;
        };
        Insert: Omit<Database['public']['Tables']['stock_history']['Row'], 'id' | 'recorded_at'>;
        Update: Partial<Database['public']['Tables']['stock_history']['Insert']>;
      };
      webhook_endpoints: {
        Row: {
          id: string;
          site_id: string;
          endpoint_type: string;
          webhook_url: string;
          secret_key: string | null;
          enabled: boolean;
          events: any | null;
          last_test_at: string | null;
          last_test_status: string | null;
          last_test_response: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['webhook_endpoints']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['webhook_endpoints']['Insert']>;
      };
      webhook_events: {
        Row: {
          id: string;
          site_id: string;
          event_type: string;
          object_id: number | null;
          object_type: string;
          processing_time_ms: number | null;
          status: string;
          error_message: string | null;
          received_at: string;
          metadata: any | null;
        };
        Insert: Omit<Database['public']['Tables']['webhook_events']['Row'], 'id' | 'received_at'>;
        Update: Partial<Database['public']['Tables']['webhook_events']['Insert']>;
      };
      webhook_queue: {
        Row: {
          id: string;
          site_id: string;
          endpoint_url: string;
          event_type: string;
          payload: any;
          signature: string | null;
          attempts: number;
          max_attempts: number;
          status: string;
          scheduled_at: string;
          last_attempt_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['webhook_queue']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['webhook_queue']['Insert']>;
      };
    };
  };
}

// Create Supabase client singleton
let supabaseClient: ReturnType<typeof createClient<Database>> | null = null;

// ========== 测试开关：设为 true 禁用所有 Supabase 连接 ==========
const DISABLE_SUPABASE_FOR_TESTING = false;

export function getSupabaseClient() {
  // 测试模式：禁用 Supabase
  if (DISABLE_SUPABASE_FOR_TESTING) {
    console.log('[Supabase] 已禁用 - 测试模式');
    return null;
  }

  if (!supabaseClient) {
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase credentials not configured. Multi-site features will be disabled.');
      return null;
    }

    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });
  }

  return supabaseClient;
}

// Helper types
export type WCSite = Database['public']['Tables']['wc_sites']['Row'];
export type SalesCache = Database['public']['Tables']['sales_cache']['Row'];
export type SyncTask = Database['public']['Tables']['sync_tasks']['Row'];
export type SyncCheckpoint = Database['public']['Tables']['sync_checkpoints']['Row'];
export type SyncMetrics = Database['public']['Tables']['sync_metrics']['Row'];
export type ProductCache = Database['public']['Tables']['products_cache']['Row'];
export type StockHistory = Database['public']['Tables']['stock_history']['Row'];
export type WebhookEndpoint = Database['public']['Tables']['webhook_endpoints']['Row'];
export type WebhookEvent = Database['public']['Tables']['webhook_events']['Row'];
export type WebhookQueue = Database['public']['Tables']['webhook_queue']['Row'];

// Multi-site sales data structure
export interface MultiSiteSalesData {
  sku: string;
  total: {
    orderCount: number;
    salesQuantity: number;
    orderCount30d: number;
    salesQuantity30d: number;
  };
  sites: {
    [siteName: string]: {
      siteId: string;
      orderCount: number;
      salesQuantity: number;
      orderCount30d: number;
      salesQuantity30d: number;
      lastUpdated: string;
      isFresh: boolean;
    };
  };
}

// Cache freshness helper (in hours)
export function isCacheFresh(lastUpdated: string, hoursThreshold = 2): boolean {
  const updatedTime = new Date(lastUpdated).getTime();
  const now = Date.now();
  const hoursDiff = (now - updatedTime) / (1000 * 60 * 60);
  return hoursDiff <= hoursThreshold;
}

// Calculate cache expiry time
export function getCacheExpiryTime(hours = 6): string {
  const expiryTime = new Date();
  expiryTime.setHours(expiryTime.getHours() + hours);
  return expiryTime.toISOString();
}