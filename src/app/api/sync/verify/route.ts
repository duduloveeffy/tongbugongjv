import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// POST: Verify sync completeness
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { siteId } = body;

    if (!siteId) {
      return NextResponse.json({ 
        error: 'Site ID is required' 
      }, { status: 400 });
    }

    // Get site configuration
    const { data: site, error: siteError } = await supabase
      .from('wc_sites')
      .select('*')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ 
        error: 'Site not found' 
      }, { status: 404 });
    }

    console.log(`Starting verification for site: ${site.name}`);

    // 1. Check WooCommerce totals
    const wcStats = await getWooCommerceStats(site);
    
    // 2. Check database totals
    const dbStats = await getDatabaseStats(supabase, siteId);
    
    // 3. Check for missing orders (sample check)
    const missingData = await checkMissingData(site, supabase, siteId);
    
    // 4. Get last sync information
    const syncInfo = await getLastSyncInfo(supabase, siteId);

    // 5. Calculate completeness
    const verification = {
      site: {
        id: siteId,
        name: site.name,
        url: site.url
      },
      woocommerce: wcStats,
      database: dbStats,
      comparison: {
        orders: {
          total_wc: wcStats.orders.total,
          total_db: dbStats.orders.total,
          difference: wcStats.orders.total - dbStats.orders.total,
          completeness_percentage: dbStats.orders.total > 0 
            ? Math.round((dbStats.orders.total / wcStats.orders.total) * 100) 
            : 0,
          status: wcStats.orders.total === dbStats.orders.total ? 'complete' : 'incomplete'
        },
        products: {
          total_wc: wcStats.products.total,
          total_db: dbStats.products.total,
          difference: wcStats.products.total - dbStats.products.total,
          completeness_percentage: dbStats.products.total > 0 
            ? Math.round((dbStats.products.total / wcStats.products.total) * 100) 
            : 0,
          status: wcStats.products.total === dbStats.products.total ? 'complete' : 'incomplete'
        }
      },
      missing: missingData,
      lastSync: syncInfo,
      verifiedAt: new Date().toISOString()
    };

    // 6. Generate recommendations
    const recommendations = generateRecommendations(verification);
    verification.recommendations = recommendations;

    return NextResponse.json({
      success: true,
      verification
    });

  } catch (error: any) {
    console.error('Verification error:', error);
    return NextResponse.json({ 
      error: error.message || 'Verification failed' 
    }, { status: 500 });
  }
}

// Get WooCommerce statistics
async function getWooCommerceStats(site: any) {
  const auth = Buffer.from(`${site.api_key}:${site.api_secret}`).toString('base64');
  const baseUrl = site.url.replace(/\/$/, '');
  
  const stats = {
    orders: { total: 0, statuses: {} as Record<string, number> },
    products: { total: 0, variations: 0 },
    customers: { total: 0 }
  };

  try {
    // Get orders count
    const ordersResponse = await fetch(`${baseUrl}/wp-json/wc/v3/orders?per_page=1&page=1`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (ordersResponse.ok) {
      const totalOrders = ordersResponse.headers.get('X-WP-Total');
      stats.orders.total = totalOrders ? parseInt(totalOrders, 10) : 0;
    }

    // Get orders by status
    const statuses = ['pending', 'processing', 'completed', 'cancelled', 'refunded', 'failed', 'on-hold'];
    for (const status of statuses) {
      try {
        const statusResponse = await fetch(
          `${baseUrl}/wp-json/wc/v3/orders?status=${status}&per_page=1`, 
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (statusResponse.ok) {
          const totalStatus = statusResponse.headers.get('X-WP-Total');
          stats.orders.statuses[status] = totalStatus ? parseInt(totalStatus, 10) : 0;
        }
      } catch (err) {
        console.error(`Failed to get ${status} orders count:`, err);
      }
    }

    // Get products count
    const productsResponse = await fetch(`${baseUrl}/wp-json/wc/v3/products?per_page=1&page=1`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (productsResponse.ok) {
      const totalProducts = productsResponse.headers.get('X-WP-Total');
      stats.products.total = totalProducts ? parseInt(totalProducts, 10) : 0;
    }

    // Get variations count (sample from first 10 products)
    const varProductsResponse = await fetch(`${baseUrl}/wp-json/wc/v3/products?type=variable&per_page=10`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (varProductsResponse.ok) {
      const varProducts = await varProductsResponse.json();
      for (const product of varProducts) {
        const varResponse = await fetch(
          `${baseUrl}/wp-json/wc/v3/products/${product.id}/variations?per_page=1`,
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (varResponse.ok) {
          const totalVars = varResponse.headers.get('X-WP-Total');
          stats.products.variations += totalVars ? parseInt(totalVars, 10) : 0;
        }
      }
    }

    // Get customers count
    const customersResponse = await fetch(`${baseUrl}/wp-json/wc/v3/customers?per_page=1&page=1`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (customersResponse.ok) {
      const totalCustomers = customersResponse.headers.get('X-WP-Total');
      stats.customers.total = totalCustomers ? parseInt(totalCustomers, 10) : 0;
    }

  } catch (error) {
    console.error('Error fetching WooCommerce stats:', error);
  }

  return stats;
}

// Get database statistics
async function getDatabaseStats(supabase: any, siteId: string) {
  const stats = {
    orders: { 
      total: 0, 
      statuses: {} as Record<string, number>,
      dateRange: { earliest: null as string | null, latest: null as string | null }
    },
    products: { 
      total: 0, 
      variations: 0,
      simpleProducts: 0,
      variableProducts: 0
    },
    orderItems: { total: 0 }
  };

  // Get total orders count
  const { count: ordersCount, data: ordersData } = await supabase
    .from('orders')
    .select('status, date_created', { count: 'exact' })
    .eq('site_id', siteId);
  
  stats.orders.total = ordersCount || 0;

  // Get orders by status
  if (ordersData && ordersData.length > 0) {
    const statusCounts = ordersData.reduce((acc: Record<string, number>, order: any) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});
    stats.orders.statuses = statusCounts;

    // Get date range
    const dates = ordersData
      .map((o: any) => o.date_created)
      .filter((d: any) => d)
      .sort();
    
    if (dates.length > 0) {
      stats.orders.dateRange.earliest = dates[0];
      stats.orders.dateRange.latest = dates[dates.length - 1];
    }
  }

  // Get products count
  const { count: productsCount } = await supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('site_id', siteId);
  
  stats.products.total = productsCount || 0;

  // Get product types
  const { data: productTypes } = await supabase
    .from('products')
    .select('type')
    .eq('site_id', siteId);
  
  if (productTypes) {
    const typeCounts = productTypes.reduce((acc: Record<string, number>, product: any) => {
      acc[product.type] = (acc[product.type] || 0) + 1;
      return acc;
    }, {});
    
    stats.products.simpleProducts = typeCounts['simple'] || 0;
    stats.products.variableProducts = typeCounts['variable'] || 0;
  }

  // Get variations count
  const { count: variationsCount } = await supabase
    .from('product_variations')
    .select('*', { count: 'exact' })
    .eq('site_id', siteId);
  
  stats.products.variations = variationsCount || 0;

  // Get order items count
  // For large datasets, process in batches to avoid query limits
  const { data: siteOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('site_id', siteId)
    .limit(1000); // Limit to avoid too large IN clause
  
  let orderItemsCount = 0;
  if (siteOrders && siteOrders.length > 0) {
    // Process in batches of 100 to avoid query limits
    const batchSize = 100;
    for (let i = 0; i < siteOrders.length; i += batchSize) {
      const batch = siteOrders.slice(i, i + batchSize);
      const orderIds = batch.map(o => o.id);
      const { count } = await supabase
        .from('order_items')
        .select('*', { count: 'exact', head: true })
        .in('order_id', orderIds);
      orderItemsCount += count || 0;
    }
    
    // If we hit the limit, estimate the total
    if (siteOrders.length === 1000) {
      const avgItemsPerOrder = orderItemsCount / siteOrders.length;
      orderItemsCount = Math.round(avgItemsPerOrder * stats.orders.total);
    }
  }
  
  stats.orderItems.total = orderItemsCount;

  return stats;
}

// Check for missing data (sample check)
async function checkMissingData(site: any, supabase: any, siteId: string) {
  const missing = {
    orders: [] as any[],
    products: [] as any[],
    checkMethod: 'sample',
    sampledRanges: [] as string[]
  };

  const auth = Buffer.from(`${site.api_key}:${site.api_secret}`).toString('base64');
  const baseUrl = site.url.replace(/\/$/, '');

  try {
    // Sample check: Get first and last 10 orders from WooCommerce
    const firstOrdersResponse = await fetch(
      `${baseUrl}/wp-json/wc/v3/orders?per_page=10&order=asc&orderby=id`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const lastOrdersResponse = await fetch(
      `${baseUrl}/wp-json/wc/v3/orders?per_page=10&order=desc&orderby=id`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (firstOrdersResponse.ok && lastOrdersResponse.ok) {
      const firstOrders = await firstOrdersResponse.json();
      const lastOrders = await lastOrdersResponse.json();
      const sampleOrders = [...firstOrders, ...lastOrders];
      
      // Check which orders are missing in database
      for (const order of sampleOrders) {
        const { data: dbOrder } = await supabase
          .from('orders')
          .select('order_id')
          .eq('site_id', siteId)
          .eq('order_id', order.id)
          .single();
        
        if (!dbOrder) {
          missing.orders.push({
            id: order.id,
            number: order.number,
            status: order.status,
            date_created: order.date_created,
            total: order.total
          });
        }
      }
      
      if (firstOrders.length > 0 && lastOrders.length > 0) {
        missing.sampledRanges.push(
          `Orders ${firstOrders[0].id}-${firstOrders[firstOrders.length - 1].id}`,
          `Orders ${lastOrders[lastOrders.length - 1].id}-${lastOrders[0].id}`
        );
      }
    }

    // Sample check: Random 10 products
    const productsResponse = await fetch(
      `${baseUrl}/wp-json/wc/v3/products?per_page=10&orderby=rand`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (productsResponse.ok) {
      const products = await productsResponse.json();
      
      for (const product of products) {
        const { data: dbProduct } = await supabase
          .from('products')
          .select('product_id')
          .eq('site_id', siteId)
          .eq('product_id', product.id)
          .single();
        
        if (!dbProduct) {
          missing.products.push({
            id: product.id,
            name: product.name,
            sku: product.sku,
            type: product.type
          });
        }
      }
    }

  } catch (error) {
    console.error('Error checking missing data:', error);
  }

  return missing;
}

// Get last sync information
async function getLastSyncInfo(supabase: any, siteId: string) {
  // Get last sync task
  const { data: lastTask } = await supabase
    .from('sync_tasks')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Get sync logs
  const { data: syncLogs } = await supabase
    .from('sync_logs')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Get checkpoint
  const { data: checkpoint } = await supabase
    .from('sync_checkpoints_v2')
    .select('*')
    .eq('site_id', siteId)
    .eq('sync_type', 'orders')
    .single();

  return {
    lastTask,
    recentLogs: syncLogs || [],
    checkpoint
  };
}

// Generate recommendations based on verification results
function generateRecommendations(verification: any) {
  const recommendations = [];
  
  // Check orders completeness
  if (verification.comparison.orders.difference > 0) {
    recommendations.push({
      type: 'warning',
      area: 'orders',
      message: `缺少 ${verification.comparison.orders.difference} 个订单`,
      action: '建议执行全量同步以补充缺失的订单'
    });
  }

  // Check products completeness
  if (verification.comparison.products.difference > 0) {
    recommendations.push({
      type: 'warning',
      area: 'products',
      message: `缺少 ${verification.comparison.products.difference} 个产品`,
      action: '建议执行全量产品同步'
    });
  }

  // Check for specific missing orders
  if (verification.missing.orders.length > 0) {
    recommendations.push({
      type: 'error',
      area: 'orders',
      message: `样本检查发现 ${verification.missing.orders.length} 个订单未同步`,
      action: '立即执行全量同步',
      details: verification.missing.orders
    });
  }

  // Check sync age
  if (verification.lastSync?.lastTask) {
    const lastSyncDate = new Date(verification.lastSync.lastTask.created_at);
    const hoursSinceSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceSync > 24) {
      recommendations.push({
        type: 'info',
        area: 'sync',
        message: `距离上次同步已过去 ${Math.round(hoursSinceSync)} 小时`,
        action: '建议执行增量同步以更新最新数据'
      });
    }
  }

  // Check for failed syncs
  if (verification.lastSync?.lastTask?.status === 'failed') {
    recommendations.push({
      type: 'error',
      area: 'sync',
      message: '上次同步失败',
      action: '检查错误日志并重新执行同步',
      error: verification.lastSync.lastTask.error_message
    });
  }

  // Add success message if everything is complete
  if (verification.comparison.orders.difference === 0 && 
      verification.comparison.products.difference === 0 &&
      verification.missing.orders.length === 0) {
    recommendations.push({
      type: 'success',
      area: 'overall',
      message: '数据同步完整',
      action: '所有数据已完全同步'
    });
  }

  return recommendations;
}