import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface SalesData {
  orderCount: number;
  salesQuantity: number;
  orderCount30d: number;
  salesQuantity30d: number;
  lastOrderDate?: string;
  siteName?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { 
      skus, 
      siteIds, 
      statuses = ['completed', 'processing'], 
      dateStart, 
      dateEnd,
      daysBack = 30,
      strictMatch = false // 新增：是否使用严格匹配
    } = body;

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ 
        error: 'No SKUs provided' 
      }, { status: 400 });
    }

    // 日志控制：可通过环境变量 LOG_LEVEL 控制
    // LOG_LEVEL=debug 显示所有日志
    // LOG_LEVEL=info 显示重要信息
    // LOG_LEVEL=error 只显示错误
    // 默认：开发环境显示debug，生产环境显示error
    const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'error');
    const isDev = logLevel === 'debug';
    const debugLog = isDev ? console.log : () => {};
    const infoLog = (logLevel === 'debug' || logLevel === 'info') ? console.log : () => {};
    
    debugLog(`Processing ${skus.length} SKUs for sales analysis (strict mode: ${strictMatch})`);
    infoLog(`[FIXED] Using pagination to fetch all records (bypassing 1000 record limit)`);
    
    // 标准化SKU格式（去除空格，可选转大写）
    const normalizedSkus = strictMatch 
      ? skus.map(sku => sku.trim()) // 严格模式：只去除空格
      : skus.map(sku => sku.trim().toUpperCase()); // 宽松模式：转大写
    
    if (isDev && skus.length <= 10) {
      debugLog('Normalized SKUs:', normalizedSkus);
    } else if (isDev) {
      debugLog('Sample normalized SKUs (first 5):', normalizedSkus.slice(0, 5));
    }

    // 如果SKU数量太多，分批查询（Supabase .in() 有限制）
    const batchSize = 30; // 减小批次大小以提高查询成功率
    let allOrderItems: any[] = [];
    
    // 仅在开发环境进行SKU存在性检查
    if (isDev && skus.length <= 50) {
      const { data: existingSkus, error: skuError } = await supabase
        .from('order_items')
        .select('sku')
        .limit(1000);
      
      if (existingSkus) {
        const dbSkuFormats = new Set(existingSkus.map(item => item.sku?.trim().toUpperCase()).filter(Boolean));
        debugLog(`Database has ${dbSkuFormats.size} unique SKUs`);
        
        // 检查有多少查询的SKU在数据库中存在
        const matchingSkus = normalizedSkus.filter(sku => dbSkuFormats.has(sku));
        debugLog(`Found ${matchingSkus.length} matching SKUs out of ${normalizedSkus.length} queried`);
        
        if (matchingSkus.length < normalizedSkus.length) {
          const missingSkus = normalizedSkus.filter(sku => !dbSkuFormats.has(sku));
          debugLog('Sample missing SKUs (first 10):', missingSkus.slice(0, 10));
        }
      }
    }
    
    if (normalizedSkus.length > batchSize) {
      // 分批查询
      for (let i = 0; i < normalizedSkus.length; i += batchSize) {
        const batchSkus = normalizedSkus.slice(i, i + batchSize);
        const batchNumber = Math.floor(i/batchSize) + 1;
        const totalBatches = Math.ceil(normalizedSkus.length/batchSize);
        
        // 仅在开发环境且SKU数量较少时打印详细信息
        if (isDev && totalBatches <= 5) {
          debugLog(`Querying batch ${batchNumber}/${totalBatches}, SKUs: ${batchSkus.length}`);
          if (batchSkus.length <= 10) {
            debugLog('Batch SKUs:', batchSkus);
          }
        } else if (isDev && batchNumber % 10 === 1) {
          // 每10个批次打印一次进度
          debugLog(`Progress: batch ${batchNumber}/${totalBatches}`);
        }
        
        // 使用.in()方法直接匹配原始SKU（保持原始大小写）
        // 同时也尝试匹配标准化的SKU
        const originalBatchSkus = batchSkus.map((normalizedSku, idx) => {
          const originalIdx = i + idx;
          return originalIdx < skus.length ? skus[originalIdx] : normalizedSku;
        });
        
        // 合并原始和标准化的SKU进行查询
        const allSkusToQuery = [...new Set([...originalBatchSkus, ...batchSkus])];
        
        let query = supabase
          .from('order_items')
          .select(`
            sku,
            quantity,
            order_id,
            orders!inner(
              id,
              site_id,
              status,
              date_created,
              wc_sites!inner(
                id,
                name
              )
            )
          `)
          .in('sku', allSkusToQuery)
          .in('orders.status', statuses);
        
        // 添加站点筛选
        if (siteIds && siteIds.length > 0) {
          query = query.in('orders.site_id', siteIds);
        }
        
        // 添加日期筛选
        if (dateStart) {
          query = query.gte('orders.date_created', dateStart);
        }
        if (dateEnd) {
          query = query.lte('orders.date_created', dateEnd);
        }
        
        // 使用分页来获取所有数据（Supabase有硬性1000条限制）
        let batchAllItems: any[] = [];
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
          const paginatedQuery = query.range(offset, offset + pageSize - 1);
          const { data: pageItems, error } = await paginatedQuery;
          
          if (error) {
            console.error(`Batch ${batchNumber} page ${Math.floor(offset/pageSize) + 1} error:`, error);
            hasMore = false;
            continue;
          }
          
          if (pageItems && pageItems.length > 0) {
            batchAllItems = batchAllItems.concat(pageItems);
            if (pageItems.length < pageSize) {
              hasMore = false;
            } else {
              offset += pageSize;
            }
          } else {
            hasMore = false;
          }
        }
        
        const batchItems = batchAllItems;
        
        if (batchItems) {
          allOrderItems = allOrderItems.concat(batchItems);
        }
      }
      
      debugLog(`Total order items found: ${allOrderItems.length} (using pagination)`);
    } else {
      // SKU数量少，一次查询
      // 合并原始和标准化的SKU进行查询
      const allSkusToQuery = [...new Set([...skus, ...normalizedSkus])];
      debugLog(`Single batch query with ${allSkusToQuery.length} SKUs (original + normalized)`);
      
      let query = supabase
        .from('order_items')
        .select(`
          sku,
          quantity,
          order_id,
          orders!inner(
            id,
            site_id,
            status,
            date_created,
            wc_sites!inner(
              id,
              name
            )
          )
        `)
        .in('sku', allSkusToQuery)
        .in('orders.status', statuses);

      // 添加站点筛选
      if (siteIds && siteIds.length > 0) {
        query = query.in('orders.site_id', siteIds);
      }

      // 添加日期筛选
      if (dateStart) {
        query = query.gte('orders.date_created', dateStart);
      }
      if (dateEnd) {
        query = query.lte('orders.date_created', dateEnd);
      }

      // 使用分页来获取所有数据（Supabase有硬性1000条限制）
      let allSingleBatchItems: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const paginatedQuery = query.range(offset, offset + pageSize - 1);
        const { data: pageItems, error: pageError } = await paginatedQuery;
        
        if (pageError) {
          console.error(`Single batch page ${Math.floor(offset/pageSize) + 1} error:`, pageError);
          return NextResponse.json({ 
            error: 'Failed to fetch sales data from Supabase',
            details: pageError.message 
          }, { status: 500 });
        }
        
        if (pageItems && pageItems.length > 0) {
          allSingleBatchItems = allSingleBatchItems.concat(pageItems);
          if (pageItems.length < pageSize) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
        } else {
          hasMore = false;
        }
      }
      
      const orderItems = allSingleBatchItems;
      
      allOrderItems = orderItems || [];
      
      debugLog(`Single batch fetched ${allOrderItems.length} items using pagination`);
    }

    // 使用合并后的数据
    const orderItems = allOrderItems;

    // 计算销量数据
    const salesDataMap = new Map<string, Map<string, SalesData>>();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - daysBack);

    // 创建SKU映射表（标准化SKU -> 原始SKU）和（原始SKU -> 原始SKU）
    const skuMapping = new Map<string, string>();
    skus.forEach((sku, index) => {
      const normalized = normalizedSkus[index];
      // 支持标准化和原始两种格式的映射
      skuMapping.set(normalized, sku);
      skuMapping.set(sku, sku);
      skuMapping.set(sku.trim(), sku); // 也映射去除空格的版本
      salesDataMap.set(sku, new Map());
    });

    // 处理订单数据
    if (orderItems && orderItems.length > 0) {
      debugLog(`Processing ${orderItems.length} order items`);
      // 按SKU和站点分组统计
      const processedOrders = new Set<string>(); // 防止重复计算订单
      let matchedItems = 0;
      let unmatchedItems = 0;

      orderItems.forEach((item: any) => {
        const dbSku = item.sku?.trim(); // 保留原始大小写，只去除空格
        const dbSkuUpper = dbSku?.toUpperCase(); // 大写版本用于备用匹配
        const quantity = Number(item.quantity) || 0;
        const order = item.orders;
        const siteId = order.site_id;
        const siteName = order.wc_sites.name;
        const orderDate = new Date(order.date_created);
        const isWithin30Days = orderDate >= thirtyDaysAgo;
        
        // 尝试多种方式找到对应的原始SKU
        let originalSku = skuMapping.get(dbSku) || skuMapping.get(dbSkuUpper);
        
        if (!originalSku) {
          // 尝试精确匹配原始SKU列表
          originalSku = skus.find(sku => 
            sku === dbSku || 
            sku.trim() === dbSku || 
            sku.toUpperCase() === dbSkuUpper
          );
        }
        
        if (!originalSku) {
          unmatchedItems++;
          if (isDev && unmatchedItems <= 5) {
            debugLog(`Warning: SKU "${dbSku}" not found in mapping`);
          }
          return; // 跳过不在查询列表中的SKU
        }
        
        matchedItems++;
        
        const orderKey = `${originalSku}-${order.id}-${siteId}`;

        // 获取或创建站点数据
        let skuData = salesDataMap.get(originalSku);
        if (!skuData) {
          skuData = new Map();
          salesDataMap.set(originalSku, skuData);
        }

        let siteData = skuData.get(siteId);
        if (!siteData) {
          siteData = {
            orderCount: 0,
            salesQuantity: 0,
            orderCount30d: 0,
            salesQuantity30d: 0,
            siteName: siteName,
            lastOrderDate: order.date_created
          };
          skuData.set(siteId, siteData);
        }

        // 更新销量数据
        siteData.salesQuantity += quantity;

        // 计算订单数（每个订单只计算一次）
        if (!processedOrders.has(orderKey)) {
          siteData.orderCount += 1;
          processedOrders.add(orderKey);
        }

        // 30天内的数据
        if (isWithin30Days) {
          siteData.salesQuantity30d += quantity;
          
          const orderKey30d = `${orderKey}-30d`;
          if (!processedOrders.has(orderKey30d)) {
            siteData.orderCount30d += 1;
            processedOrders.add(orderKey30d);
          }
        }

        // 更新最后订单日期
        if (!siteData.lastOrderDate || order.date_created > siteData.lastOrderDate) {
          siteData.lastOrderDate = order.date_created;
        }
      });
      
      debugLog(`Matched ${matchedItems} items, unmatched ${unmatchedItems} items`);
    } else {
      debugLog('No order items found for the queried SKUs');
    }

    // 转换为响应格式
    const result: Record<string, any> = {};
    let skusWithData = 0;
    let skusWithoutData = 0;
    
    salesDataMap.forEach((siteDataMap, sku) => {
      result[sku] = {
        total: {
          orderCount: 0,
          salesQuantity: 0,
          orderCount30d: 0,
          salesQuantity30d: 0,
        },
        bySite: {} as Record<string, SalesData>
      };

      // 汇总各站点数据
      siteDataMap.forEach((siteData, siteId) => {
        result[sku].bySite[siteId] = siteData;
        result[sku].total.orderCount += siteData.orderCount;
        result[sku].total.salesQuantity += siteData.salesQuantity;
        result[sku].total.orderCount30d += siteData.orderCount30d;
        result[sku].total.salesQuantity30d += siteData.salesQuantity30d;
      });
      
      if (result[sku].total.salesQuantity > 0) {
        skusWithData++;
      } else {
        skusWithoutData++;
      }
    });
    
    // 根据日志级别打印统计信息
    if (skus.length > 100) {
      infoLog(`Processed ${skus.length} SKUs: ${skusWithData} with sales, ${skusWithoutData} without`);
    } else {
      debugLog(`Sales analysis results: ${skusWithData} SKUs with sales, ${skusWithoutData} SKUs without sales`);
    }

    // 获取站点列表信息
    const { data: sites } = await supabase
      .from('wc_sites')
      .select('id, name, url')
      .in('id', siteIds || []);

    return NextResponse.json({
      success: true,
      source: 'supabase',
      processedSkus: skus.length,
      sites: sites || [],
      data: result
    });

  } catch (error: any) {
    console.error('Supabase sales analysis error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      success: false 
    }, { status: 500 });
  }
}

// GET: 获取可用的站点列表
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    // 获取所有启用的站点
    const { data: sites, error } = await supabase
      .from('wc_sites')
      .select('id, name, url, enabled, last_sync_at')
      .eq('enabled', true)
      .order('name');

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to fetch sites',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sites: sites || []
    });

  } catch (error: any) {
    console.error('Get sites error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      success: false 
    }, { status: 500 });
  }
}