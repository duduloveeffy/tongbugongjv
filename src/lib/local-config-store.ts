import { createClient } from '@supabase/supabase-js';

// Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 默认自动同步配置
export const DEFAULT_AUTO_SYNC_CONFIG = {
  id: 'local-default',
  name: 'default',
  enabled: false,
  site_ids: [] as string[],
  filters: {
    isMergedMode: true,
    hideZeroStock: false,
    hideNormalStatus: false,
    showNeedSync: false,
    categoryFilter: '全部',
    categoryFilters: [] as string[],
    skuFilter: '',
    excludeSkuPrefixes: '',
    excludeWarehouses: '',
  },
  sync_to_instock: true,
  sync_to_outofstock: true,
  wechat_webhook_url: null as string | null,
  notify_on_success: true,
  notify_on_failure: true,
  notify_on_no_changes: false,
  cron_expression: '0 * * * *',
  last_run_at: null as string | null,
  last_run_status: null as string | null,
  last_run_summary: null as Record<string, number> | null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export type AutoSyncConfig = typeof DEFAULT_AUTO_SYNC_CONFIG;

export interface AutoSyncLog {
  id: string;
  config_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  total_skus_checked: number;
  skus_synced_to_instock: number;
  skus_synced_to_outofstock: number;
  skus_failed: number;
  sites_processed: Record<string, unknown> | null;
  error_message: string | null;
  notification_sent: boolean;
  notification_error: string | null;
  created_at: string;
}

// 获取自动同步配置（异步）
export async function getAutoSyncConfigAsync(): Promise<AutoSyncConfig> {
  try {
    const { data, error } = await supabase
      .from('auto_sync_config')
      .select('*')
      .eq('name', 'default')
      .single();

    if (error) {
      console.error('[ConfigStore] 读取配置失败:', error.message);
      return { ...DEFAULT_AUTO_SYNC_CONFIG };
    }

    return { ...DEFAULT_AUTO_SYNC_CONFIG, ...data };
  } catch (error) {
    console.error('[ConfigStore] 读取配置异常:', error);
    return { ...DEFAULT_AUTO_SYNC_CONFIG };
  }
}

// 保留同步版本用于兼容（返回默认配置，实际应使用异步版本）
export function getAutoSyncConfig(): AutoSyncConfig {
  console.warn('[ConfigStore] 同步方法已废弃，请使用 getAutoSyncConfigAsync');
  return { ...DEFAULT_AUTO_SYNC_CONFIG };
}

// 保存自动同步配置（异步）
export async function saveAutoSyncConfigAsync(config: Partial<AutoSyncConfig>): Promise<AutoSyncConfig> {
  try {
    const { data: existing } = await supabase
      .from('auto_sync_config')
      .select('id')
      .eq('name', 'default')
      .single();

    const updatedConfig = {
      ...config,
      name: 'default',
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      // 更新现有配置
      const { data, error } = await supabase
        .from('auto_sync_config')
        .update(updatedConfig)
        .eq('name', 'default')
        .select()
        .single();

      if (error) {
        console.error('[ConfigStore] 更新配置失败:', error.message);
        throw error;
      }

      console.log('[ConfigStore] 配置已更新');
      return { ...DEFAULT_AUTO_SYNC_CONFIG, ...data };
    } else {
      // 插入新配置
      const { data, error } = await supabase
        .from('auto_sync_config')
        .insert(updatedConfig)
        .select()
        .single();

      if (error) {
        console.error('[ConfigStore] 插入配置失败:', error.message);
        throw error;
      }

      console.log('[ConfigStore] 配置已创建');
      return { ...DEFAULT_AUTO_SYNC_CONFIG, ...data };
    }
  } catch (error) {
    console.error('[ConfigStore] 保存配置异常:', error);
    throw error;
  }
}

// 保留同步版本用于兼容
export function saveAutoSyncConfig(config: Partial<AutoSyncConfig>): AutoSyncConfig {
  console.warn('[ConfigStore] 同步方法已废弃，请使用 saveAutoSyncConfigAsync');
  // 异步执行保存，但返回合并后的配置
  saveAutoSyncConfigAsync(config).catch(err => {
    console.error('[ConfigStore] 异步保存失败:', err);
  });
  return { ...DEFAULT_AUTO_SYNC_CONFIG, ...config, updated_at: new Date().toISOString() };
}

// 获取自动同步日志（异步）
export async function getAutoSyncLogsAsync(limit = 20): Promise<AutoSyncLog[]> {
  try {
    const { data, error } = await supabase
      .from('auto_sync_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[ConfigStore] 读取日志失败:', error.message);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[ConfigStore] 读取日志异常:', error);
    return [];
  }
}

// 保留同步版本用于兼容
export function getAutoSyncLogs(_limit = 20): AutoSyncLog[] {
  console.warn('[ConfigStore] 同步方法已废弃，请使用 getAutoSyncLogsAsync');
  return [];
}

// 添加自动同步日志（异步）
export async function addAutoSyncLogAsync(log: Omit<AutoSyncLog, 'id' | 'created_at'>): Promise<AutoSyncLog> {
  try {
    const { data, error } = await supabase
      .from('auto_sync_logs')
      .insert({
        config_id: log.config_id,
        started_at: log.started_at,
        completed_at: log.completed_at,
        status: log.status,
        total_skus_checked: log.total_skus_checked,
        skus_synced_to_instock: log.skus_synced_to_instock,
        skus_synced_to_outofstock: log.skus_synced_to_outofstock,
        skus_failed: log.skus_failed,
        sites_processed: log.sites_processed,
        error_message: log.error_message,
        notification_sent: log.notification_sent,
        notification_error: log.notification_error,
      })
      .select()
      .single();

    if (error) {
      console.error('[ConfigStore] 添加日志失败:', error.message);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[ConfigStore] 添加日志异常:', error);
    throw error;
  }
}

// 保留同步版本用于兼容
export function addAutoSyncLog(log: Omit<AutoSyncLog, 'id' | 'created_at'>): AutoSyncLog {
  console.warn('[ConfigStore] 同步方法已废弃，请使用 addAutoSyncLogAsync');
  // 异步执行添加
  addAutoSyncLogAsync(log).catch(err => {
    console.error('[ConfigStore] 异步添加日志失败:', err);
  });
  return {
    ...log,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
}

// 更新日志（异步）
export async function updateAutoSyncLogAsync(logId: string, updates: Partial<AutoSyncLog>): Promise<AutoSyncLog | null> {
  try {
    const { data, error } = await supabase
      .from('auto_sync_logs')
      .update(updates)
      .eq('id', logId)
      .select()
      .single();

    if (error) {
      console.error('[ConfigStore] 更新日志失败:', error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[ConfigStore] 更新日志异常:', error);
    return null;
  }
}

// 保留同步版本用于兼容
export function updateAutoSyncLog(logId: string, updates: Partial<AutoSyncLog>): AutoSyncLog | null {
  console.warn('[ConfigStore] 同步方法已废弃，请使用 updateAutoSyncLogAsync');
  // 异步执行更新
  updateAutoSyncLogAsync(logId, updates).catch(err => {
    console.error('[ConfigStore] 异步更新日志失败:', err);
  });
  return null;
}