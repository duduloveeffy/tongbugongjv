import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// 任务处理器 - 应该由定时任务或后台服务调用
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    // 检查是否有正在处理的任务（限制并发）
    const { data: processingTasks } = await supabase
      .from('sync_tasks')
      .select('id')
      .eq('status', 'processing');
    
    const MAX_CONCURRENT = 5; // 增加最大并发数以加快批量同步
    if (processingTasks && processingTasks.length >= MAX_CONCURRENT) {
      return NextResponse.json({
        message: 'Max concurrent tasks reached',
        processing: processingTasks.length
      });
    }

    // 获取下一个待处理任务
    const { data: nextTask, error: fetchError } = await supabase
      .from('sync_tasks')
      .select(`
        *,
        site:wc_sites(*)
      `)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !nextTask) {
      return NextResponse.json({
        message: 'No pending tasks',
        processing: processingTasks?.length || 0
      });
    }

    // 标记任务为处理中
    const { error: updateError } = await supabase
      .from('sync_tasks')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        progress: {
          percentage: 0,
          current: 0,
          total: 0,
          message: '正在初始化...'
        }
      })
      .eq('id', nextTask.id);

    if (updateError) {
      throw updateError;
    }

    // 根据任务类型执行同步
    console.log(`[Processor] 开始处理任务: ${nextTask.id}, 类型: ${nextTask.task_type}, 站点: ${nextTask.site?.name}`);

    try {
      let result;

      switch (nextTask.task_type) {
        case 'full':
          // 全量同步订单和产品
          result = await executeFullSync(supabase, nextTask);
          break;
        
        case 'incremental':
          // 增量同步
          result = await executeIncrementalSync(supabase, nextTask);
          break;
        
        case 'sku_batch':
          // SKU批量同步
          result = await executeSkuBatchSync(supabase, nextTask);
          break;
        
        default:
          throw new Error(`Unknown task type: ${nextTask.task_type}`);
      }

      // 更新站点的最后同步时间
      if (nextTask.site?.id) {
        await supabase
          .from('wc_sites')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', nextTask.site.id);
      }

      // 更新任务为完成状态
      await supabase
        .from('sync_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress: {
            percentage: 100,
            current: result.total,
            total: result.total,
            message: '同步完成'
          },
          metadata: {
            ...nextTask.metadata,
            result
          }
        })
        .eq('id', nextTask.id);

      return NextResponse.json({
        success: true,
        taskId: nextTask.id,
        result
      });

    } catch (syncError: any) {
      console.error('Sync execution error:', syncError);

      // 即使失败也更新站点的最后同步时间（记录尝试时间）
      if (nextTask.site?.id) {
        await supabase
          .from('wc_sites')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', nextTask.site.id);
      }

      // 更新任务为失败状态
      await supabase
        .from('sync_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: syncError.message,
          progress: {
            percentage: 0,
            current: 0,
            total: 0,
            message: `错误: ${syncError.message}`
          }
        })
        .eq('id', nextTask.id);

      return NextResponse.json({
        success: false,
        taskId: nextTask.id,
        error: syncError.message
      });
    }

  } catch (error: any) {
    console.error('Queue processor error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// 执行全量同步
async function executeFullSync(supabase: any, task: any) {
  const { site } = task;
  const results = {
    orders: { synced: 0, failed: 0 },
    products: { synced: 0, failed: 0 },
    total: 0
  };

  // 更新进度：开始同步订单
  await updateTaskProgress(supabase, task.id, {
    percentage: 10,
    message: '正在同步订单...'
  });

  // 同步订单
  try {
    const orderResult = await syncOrders(site, 'full', async (progress) => {
      // 更新进度回调
      await updateTaskProgress(supabase, task.id, {
        percentage: 10 + Math.floor(progress * 0.4), // 10-50%
        message: `正在同步订单... ${progress}%`
      });
    });
    results.orders = orderResult;
  } catch (error: any) {
    console.error('Order sync error:', error);
    results.orders.failed = -1;
  }

  // 更新进度：开始同步产品
  await updateTaskProgress(supabase, task.id, {
    percentage: 50,
    message: '正在同步产品...'
  });

  // 同步产品
  try {
    const productResult = await syncProducts(site, 'full', async (progress) => {
      // 更新进度回调
      await updateTaskProgress(supabase, task.id, {
        percentage: 50 + Math.floor(progress * 0.4), // 50-90%
        message: `正在同步产品... ${progress}%`
      });
    });
    results.products = productResult;
  } catch (error: any) {
    console.error('Product sync error:', error);
    results.products.failed = -1;
  }

  // 更新进度：完成
  await updateTaskProgress(supabase, task.id, {
    percentage: 100,
    message: '同步完成'
  });

  results.total = results.orders.synced + results.products.synced;
  return results;
}

// 执行增量同步
async function executeIncrementalSync(supabase: any, task: any) {
  const { site } = task;

  console.log(`[Incremental Sync] 开始执行增量同步，站点: ${site?.name}, 有API密钥: ${!!site?.api_key}`);

  const results = {
    orders: { synced: 0, failed: 0 },
    products: { synced: 0, failed: 0 },
    productCache: { synced: 0, failed: 0 },
    total: 0
  };

  // 步骤1：先全量刷新产品缓存（解决数据断层问题）
  await updateTaskProgress(supabase, task.id, {
    percentage: 5,
    message: '正在全量刷新产品缓存...'
  });

  try {
    const cacheResult = await refreshProductCache(site);
    results.productCache = cacheResult;
    console.log(`[Incremental Sync] 产品缓存刷新完成: ${cacheResult.synced} 个产品`);
  } catch (error: any) {
    console.error('Product cache refresh error:', error);
    results.productCache.failed = -1;
    // 缓存刷新失败不阻断后续流程，继续执行
  }

  // 步骤2：增量同步订单
  await updateTaskProgress(supabase, task.id, {
    percentage: 30,
    message: '正在增量同步订单...'
  });

  try {
    const orderResult = await syncOrders(site, 'incremental', async (progress) => {
      await updateTaskProgress(supabase, task.id, {
        percentage: 30 + Math.floor(progress * 0.3),
        message: `增量同步订单... ${progress}%`
      });
    });
    results.orders = orderResult;
  } catch (error: any) {
    console.error('Incremental order sync error:', error);
    results.orders.failed = -1;
  }

  // 步骤3：增量同步产品
  await updateTaskProgress(supabase, task.id, {
    percentage: 60,
    message: '正在增量同步产品...'
  });

  try {
    const productResult = await syncProducts(site, 'incremental', async (progress) => {
      await updateTaskProgress(supabase, task.id, {
        percentage: 60 + Math.floor(progress * 0.35),
        message: `增量同步产品... ${progress}%`
      });
    });
    results.products = productResult;
  } catch (error: any) {
    console.error('Incremental product sync error:', error);
    results.products.failed = -1;
  }

  results.total = results.orders.synced + results.products.synced + results.productCache.synced;
  return results;
}

// 全量刷新产品缓存（调用 /api/sync/products-cache 逻辑）
async function refreshProductCache(site: any): Promise<{ synced: number; failed: number }> {
  console.log(`[RefreshProductCache] 开始刷新站点 ${site.name} 的产品缓存...`);

  const auth = Buffer.from(`${site.api_key}:${site.api_secret}`).toString('base64');
  const baseUrl = site.url.replace(/\/$/, '');

  let syncedCount = 0;
  let failedCount = 0;
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  // 获取 Supabase 客户端
  const { getSupabaseClient } = await import('@/lib/supabase');
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  while (hasMore) {
    try {
      const response = await fetch(
        `${baseUrl}/wp-json/wc/v3/products?page=${page}&per_page=${perPage}&order=asc&orderby=id`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.status}`);
      }

      const products = await response.json();
      const totalPages = parseInt(response.headers.get('x-wp-totalpages') || '1');

      if (products.length === 0) {
        break;
      }

      // 处理并存储产品
      const productsToInsert = products.map((product: any) => ({
        site_id: site.id,
        product_id: product.id,
        sku: product.sku || `product-${product.id}`,
        name: product.name,
        type: product.type,
        status: product.status,
        stock_status: product.stock_status,
        stock_quantity: product.stock_quantity,
        manage_stock: product.manage_stock,
        price: parseFloat(product.price || '0'),
        regular_price: parseFloat(product.regular_price || '0'),
        sale_price: parseFloat(product.sale_price || '0'),
        categories: product.categories || [],
        attributes: product.attributes || [],
        variations: product.variations || [],
        images: product.images || [],
        permalink: product.permalink,
        synced_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('products')
        .upsert(productsToInsert, {
          onConflict: 'site_id,product_id'
        });

      if (insertError) {
        console.error(`[RefreshProductCache] 插入批次 ${page} 失败:`, insertError);
        failedCount += products.length;
      } else {
        syncedCount += products.length;
      }

      // 处理变体产品
      for (const product of products) {
        if (product.type === 'variable' && product.variations && product.variations.length > 0) {
          try {
            const variations = await fetchVariationsForCache(baseUrl, auth, product.id);

            if (variations.length > 0) {
              const variationsToInsert = variations.map((variation: any) => ({
                site_id: site.id,
                product_id: variation.id,
                sku: variation.sku || `variation-${variation.id}`,
                name: `${product.name} - ${variation.attributes?.map((a: any) => a.option).join(', ') || variation.id}`,
                type: 'variation',
                status: variation.status,
                stock_status: variation.stock_status,
                stock_quantity: variation.stock_quantity,
                manage_stock: variation.manage_stock,
                price: parseFloat(variation.price || '0'),
                regular_price: parseFloat(variation.regular_price || '0'),
                sale_price: parseFloat(variation.sale_price || '0'),
                categories: product.categories || [],
                attributes: variation.attributes || [],
                variations: [],
                images: variation.image ? [variation.image] : [],
                permalink: variation.permalink || product.permalink,
                parent_id: product.id,
                synced_at: new Date().toISOString(),
              }));

              const { error: variationError } = await supabase
                .from('products')
                .upsert(variationsToInsert, {
                  onConflict: 'site_id,product_id'
                });

              if (!variationError) {
                syncedCount += variations.length;
              }
            }
          } catch (varError) {
            console.warn(`[RefreshProductCache] 获取变体失败 (产品 ${product.id}):`, varError);
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      hasMore = page < totalPages;
      page++;

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`[RefreshProductCache] 获取页面 ${page} 失败:`, error);
      failedCount++;
      page++;
      hasMore = page <= 50;
    }
  }

  console.log(`[RefreshProductCache] 完成: 同步 ${syncedCount} 个，失败 ${failedCount} 个`);
  return { synced: syncedCount, failed: failedCount };
}

// 获取产品变体（用于缓存刷新）
async function fetchVariationsForCache(baseUrl: string, auth: string, productId: number): Promise<any[]> {
  const allVariations: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      const response = await fetch(
        `${baseUrl}/wp-json/wc/v3/products/${productId}/variations?page=${page}&per_page=${perPage}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        if (response.status === 404) return allVariations;
        throw new Error(`WooCommerce API error: ${response.status}`);
      }

      const variations = await response.json();
      if (variations.length === 0) break;

      allVariations.push(...variations);
      if (variations.length < perPage) break;

      page++;
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      break;
    }
  }

  return allVariations;
}

// 执行SKU批量同步
async function executeSkuBatchSync(supabase: any, task: any) {
  // TODO: 实现SKU批量同步逻辑
  return {
    synced: 0,
    failed: 0,
    total: 0
  };
}

// 同步订单（调用现有API）
async function syncOrders(site: any, mode: string, progressCallback?: (progress: number) => Promise<void>) {
  // 导入处理函数
  const { POST: syncOrdersHandler } = await import('@/app/api/sync/orders/incremental/route');

  console.log(`Syncing orders for site ${site.id} in ${mode} mode`);

  // 创建模拟的 NextRequest 对象（URL 只是占位符，不会实际访问）
  const mockRequest = new Request('http://internal/api/sync/orders/incremental', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      siteId: site.id,
      mode,
      batchSize: 50
    })
  });

  // 直接调用处理函数
  const response = await syncOrdersHandler(mockRequest as any);

  console.log(`Order sync response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Order sync error: ${response.status} - ${errorText}`);
    throw new Error(`Order sync failed: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    synced: result.results?.syncedOrders || 0,
    failed: result.results?.failedOrders || 0
  };
}

// 同步产品（调用现有API）
async function syncProducts(site: any, mode: string, progressCallback?: (progress: number) => Promise<void>) {
  // 导入处理函数
  const { POST: syncProductsHandler } = await import('@/app/api/sync/products/incremental/route');

  console.log(`Syncing products for site ${site.id} in ${mode} mode`);

  // 创建模拟的 NextRequest 对象（URL 只是占位符，不会实际访问）
  const mockRequest = new Request('http://internal/api/sync/products/incremental', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      siteId: site.id,
      mode,
      includeVariations: true
    })
  });

  // 直接调用处理函数
  const response = await syncProductsHandler(mockRequest as any);

  console.log(`Product sync response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Product sync error: ${response.status} - ${errorText}`);
    throw new Error(`Product sync failed: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    synced: result.results?.syncedProducts || 0,
    failed: result.results?.failedProducts || 0
  };
}

// 更新任务进度
async function updateTaskProgress(supabase: any, taskId: string, progress: any) {
  try {
    await supabase
      .from('sync_tasks')
      .update({
        progress: {
          percentage: progress.percentage || 0,
          current: progress.current || 0,
          total: progress.total || 0,
          message: progress.message || ''
        }
      })
      .eq('id', taskId);
  } catch (error) {
    console.error('Failed to update task progress:', error);
  }
}
