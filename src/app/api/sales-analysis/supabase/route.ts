import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { createH3YunClient } from '@/lib/h3yun/client';
import { buildMappingIndex, getWooCommerceSkus, type MappingIndex } from '@/lib/h3yun/mapping-service';
import type { H3YunConfig } from '@/lib/h3yun/types';
import { env } from '@/env';
import { h3yunSchemaConfig } from '@/config/h3yun.config';

interface SalesData {
  orderCount: number;
  salesQuantity: number;
  orderCountDaysN: number;
  salesQuantityDaysN: number;
  lastOrderDate?: string;
  siteName?: string;
}

// SKU映射缓存（内存缓存，避免每次请求都加载）
let skuMappingCache: {
  index: MappingIndex | null;
  loadedAt: number;
  ttl: number; // 缓存有效期（毫秒）
} = {
  index: null,
  loadedAt: 0,
  ttl: 5 * 60 * 1000, // 5分钟缓存
};

/**
 * 获取SKU映射索引（带缓存）
 */
async function getSkuMappingIndex(): Promise<MappingIndex | null> {
  const now = Date.now();

  // 检查缓存是否有效
  if (skuMappingCache.index && (now - skuMappingCache.loadedAt) < skuMappingCache.ttl) {
    console.log('[SKU Mapping] 使用缓存的映射索引');
    return skuMappingCache.index;
  }

  try {
    console.log('[SKU Mapping] 加载氚云SKU映射表...');

    // 检查配置是否完整
    if (!env.H3YUN_ENGINE_CODE || !env.H3YUN_ENGINE_SECRET) {
      console.log('[SKU Mapping] 氚云配置不完整，跳过SKU映射');
      return null;
    }

    const config: H3YunConfig = {
      engineCode: env.H3YUN_ENGINE_CODE,
      engineSecret: env.H3YUN_ENGINE_SECRET,
      schemaCode: h3yunSchemaConfig.inventorySchemaCode,
      skuMappingSchemaCode: h3yunSchemaConfig.skuMappingSchemaCode,
    };

    const client = createH3YunClient(config);
    const mappingData = await client.fetchSkuMappings(500);

    if (mappingData.length === 0) {
      console.log('[SKU Mapping] 映射表为空，跳过SKU映射');
      return null;
    }

    const index = buildMappingIndex(mappingData);

    // 更新缓存
    skuMappingCache = {
      index,
      loadedAt: now,
      ttl: 5 * 60 * 1000,
    };

    console.log(`[SKU Mapping] 映射索引加载完成: ${index.h3yunToWoo.size} 个氚云SKU`);
    return index;
  } catch (error) {
    console.error('[SKU Mapping] 加载映射索引失败:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now(); // Track processing time

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
      salesDetectionDays, // 销量检测弹窗选择的天数（用于 orderCount/salesQuantity）
      strictMatch = false, // 是否使用严格匹配
      useSkuMapping = true // 新增：是否使用SKU映射（默认启用）
    } = body;

    // salesDetectionDays 默认等于 daysBack，如果没有单独指定
    const detectionDays = salesDetectionDays || daysBack;

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

    // 优化策略选择：
    // - SKU ≤ 2000: 使用批量查询（每批 100 SKU，精确匹配）
    // - SKU > 2000: 使用全表查询+内存过滤（需要更长的数据库超时）
    const OPTIMIZATION_THRESHOLD = 2000; // 优化阈值（从 100 提高到 2000，避免过早触发全表查询）
    const useOptimization = skus.length > OPTIMIZATION_THRESHOLD;

    if (useOptimization) {
      infoLog(`🚀 [OPTIMIZED] Processing large batch (${skus.length} SKUs) - using direct query strategy`);
      infoLog(`   Expected performance: Single query with in-memory filtering`);
    } else {
      infoLog(`📊 Processing ${skus.length} SKUs using batch query strategy`);
    }
    
    // 标准化SKU格式（去除空格，可选转大写）
    let normalizedSkus = strictMatch
      ? skus.map(sku => sku.trim()) // 严格模式：只去除空格
      : skus.map(sku => sku.trim().toUpperCase()); // 宽松模式：转大写

    // ============ SKU 映射处理 ============
    // 将 ERP SKU (如 SU-06) 转换为 WooCommerce SKU (如 VS5-1116)
    let skuMappingIndex: MappingIndex | null = null;
    const erpToWooMapping = new Map<string, string[]>(); // ERP SKU -> WooCommerce SKU[]
    const wooToErpMapping = new Map<string, string>();   // WooCommerce SKU -> ERP SKU

    if (useSkuMapping) {
      skuMappingIndex = await getSkuMappingIndex();

      if (skuMappingIndex) {
        infoLog(`[SKU Mapping] 启用SKU映射，氚云SKU数: ${skuMappingIndex.h3yunToWoo.size}`);

        // 遍历所有输入的 SKU，查找对应的 WooCommerce SKU
        const expandedSkus: string[] = [];
        let mappedCount = 0;
        let unmappedCount = 0;

        for (const erpSku of normalizedSkus) {
          const wooSkus = getWooCommerceSkus(erpSku, skuMappingIndex);

          if (wooSkus.length > 0) {
            // 找到映射，使用 WooCommerce SKU
            erpToWooMapping.set(erpSku, wooSkus);
            for (const wooSku of wooSkus) {
              expandedSkus.push(wooSku);
              wooToErpMapping.set(wooSku.toUpperCase(), erpSku);
            }
            mappedCount++;
          } else {
            // 没有映射，使用原始 SKU
            expandedSkus.push(erpSku);
            unmappedCount++;
          }
        }

        infoLog(`[SKU Mapping] 映射结果: ${mappedCount} 个有映射, ${unmappedCount} 个无映射`);

        if (expandedSkus.length !== normalizedSkus.length) {
          infoLog(`[SKU Mapping] SKU扩展: ${normalizedSkus.length} -> ${expandedSkus.length}`);
        }

        // 使用扩展后的 SKU 列表进行查询
        normalizedSkus = [...new Set(expandedSkus)]; // 去重

        // 打印一些映射示例
        if (isDev && mappedCount > 0) {
          const sampleMappings = Array.from(erpToWooMapping.entries()).slice(0, 3);
          debugLog('[SKU Mapping] 映射示例:', sampleMappings.map(([erp, woo]) => `${erp} -> ${woo.join(', ')}`));
        }
      } else {
        debugLog('[SKU Mapping] 未能加载映射索引，使用原始SKU');
      }
    } else {
      debugLog('[SKU Mapping] SKU映射已禁用');
    }

    if (isDev && skus.length <= 10) {
      debugLog('Normalized SKUs:', normalizedSkus);
    } else if (isDev) {
      debugLog('Sample normalized SKUs (first 5):', normalizedSkus.slice(0, 5));
    }

    // 优化：如果SKU数量太多，使用不同的查询策略
    let allOrderItems: any[] = [];

    // 使用优化策略时的配置
    const batchSize = useOptimization ? 1000 : 100; // 增大批次大小
    
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
    
    if (useOptimization) {
      // 对于大量SKU，直接查询所有订单，然后在内存中过滤
      infoLog(`🔄 Using optimized query for ${skus.length} SKUs - fetching all orders and filtering in memory`);

      // 构建基础查询
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
        .in('orders.status', statuses);

      // 添加站点筛选
      if (siteIds && siteIds.length > 0) {
        query = query.in('orders.site_id', siteIds);
      }

      // 添加日期筛选
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - daysBack);
      query = query.gte('orders.date_created', thirtyDaysAgo.toISOString());

      if (dateEnd) {
        query = query.lte('orders.date_created', dateEnd);
      }

      // 使用分页获取所有数据
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;
      let pageCount = 0;

      // 对于超大批量（>1000 SKUs），显示进度
      const showProgress = skus.length > 1000;
      if (showProgress) {
        infoLog(`   📥 Fetching orders from database...`);
      }

      while (hasMore) {
        const paginatedQuery = query.range(offset, offset + pageSize - 1);
        const { data: pageItems, error: pageError } = await paginatedQuery;

        if (pageError) {
          console.error(`Page ${Math.floor(offset/pageSize) + 1} error:`, pageError);
          return NextResponse.json({
            error: 'Failed to fetch sales data from Supabase',
            details: pageError.message
          }, { status: 500 });
        }

        if (pageItems && pageItems.length > 0) {
          allOrderItems = allOrderItems.concat(pageItems);
          pageCount++;

          if (showProgress && pageCount % 5 === 0) {
            infoLog(`   📄 Loaded ${allOrderItems.length} order items...`);
          }

          if (pageItems.length < pageSize) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
        } else {
          hasMore = false;
        }
      }

      infoLog(`   ✅ Fetched ${allOrderItems.length} order items, now filtering for requested SKUs`);

      // 在内存中过滤出需要的SKU - 使用优化的查找
      const filterStartTime = Date.now();
      const skuSet = new Set(normalizedSkus);
      const originalSkuSet = new Set(skus);

      // 创建多个查找集合以提高匹配效率
      const skuLookupSets = {
        normalized: skuSet,
        original: originalSkuSet,
        trimmed: new Set(skus.map(s => s.trim()))
      };

      const filteredItems = [];
      for (const item of allOrderItems) {
        const itemSku = item.sku?.trim();
        if (!itemSku) continue;

        const itemSkuUpper = itemSku.toUpperCase();

        // 快速查找
        if (skuLookupSets.normalized.has(itemSkuUpper) ||
            skuLookupSets.original.has(itemSku) ||
            skuLookupSets.trimmed.has(itemSku)) {
          filteredItems.push(item);
        }
      }

      allOrderItems = filteredItems;
      const filterTime = ((Date.now() - filterStartTime) / 1000).toFixed(3);
      infoLog(`   🔍 Filtered to ${allOrderItems.length} relevant items in ${filterTime}s`);

    } else if (normalizedSkus.length > batchSize) {
      // 原有的分批查询逻辑（用于少量SKU）
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

    // 双时间判断：
    // - daysBackAgo: 用于 orderCountDaysN/salesQuantityDaysN（动态天数，可在表头修改）
    // - detectionDaysAgo: 用于 orderCount/salesQuantity（销量检测弹窗配置的天数）
    const daysBackAgo = new Date();
    daysBackAgo.setDate(daysBackAgo.getDate() - daysBack);

    const detectionDaysAgo = new Date();
    detectionDaysAgo.setDate(detectionDaysAgo.getDate() - detectionDays);

    // 创建SKU映射表（标准化SKU -> 原始SKU）和（原始SKU -> 原始SKU）
    const skuMapping = new Map<string, string>();
    skus.forEach((sku, index) => {
      const originalNormalized = strictMatch ? sku.trim() : sku.trim().toUpperCase();
      // 支持标准化和原始两种格式的映射
      skuMapping.set(originalNormalized, sku);
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
      let mappedItems = 0; // 通过SKU映射匹配的数量

      orderItems.forEach((item: any) => {
        const dbSku = item.sku?.trim(); // 保留原始大小写，只去除空格
        const dbSkuUpper = dbSku?.toUpperCase(); // 大写版本用于备用匹配
        const quantity = Number(item.quantity) || 0;
        const order = item.orders;
        const siteId = order.site_id;
        const siteName = order.wc_sites.name;
        const orderDate = new Date(order.date_created);
        const isWithinDaysBack = orderDate >= daysBackAgo;         // 动态天数（表头）
        const isWithinDetectionDays = orderDate >= detectionDaysAgo; // 弹窗配置天数

        // 尝试多种方式找到对应的原始SKU
        let originalSku = skuMapping.get(dbSku) || skuMapping.get(dbSkuUpper);

        // 如果直接映射找不到，尝试通过 WooCommerce -> ERP 映射查找
        if (!originalSku && wooToErpMapping.size > 0) {
          const erpSku = wooToErpMapping.get(dbSkuUpper);
          if (erpSku) {
            originalSku = erpSku;
            mappedItems++;
          }
        }

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
            orderCountDaysN: 0,
            salesQuantityDaysN: 0,
            siteName: siteName,
            lastOrderDate: order.date_created
          };
          skuData.set(siteId, siteData);
        }

        // ============ 双时间判断统计 ============
        // orderCount / salesQuantity: 使用 detectionDays（销量检测弹窗配置的天数）
        // orderCountDaysN / salesQuantityDaysN: 使用 daysBack（动态天数，可在表头修改）

        // 检测天数内的数据（用于 orderCount/salesQuantity）
        if (isWithinDetectionDays) {
          siteData.salesQuantity += quantity;

          // 计算订单数（每个订单只计算一次）
          const orderKeyDetection = `${orderKey}-detection`;
          if (!processedOrders.has(orderKeyDetection)) {
            siteData.orderCount += 1;
            processedOrders.add(orderKeyDetection);
          }
        }

        // 动态天数内的数据（用于 orderCountDaysN/salesQuantityDaysN）
        if (isWithinDaysBack) {
          siteData.salesQuantityDaysN += quantity;

          const orderKeyDaysBack = `${orderKey}-daysback`;
          if (!processedOrders.has(orderKeyDaysBack)) {
            siteData.orderCountDaysN += 1;
            processedOrders.add(orderKeyDaysBack);
          }
        }

        // 更新最后订单日期
        if (!siteData.lastOrderDate || order.date_created > siteData.lastOrderDate) {
          siteData.lastOrderDate = order.date_created;
        }
      });
      
      debugLog(`Matched ${matchedItems} items, unmatched ${unmatchedItems} items`);
      if (mappedItems > 0) {
        infoLog(`[SKU Mapping] 通过映射匹配: ${mappedItems} 条订单记录`);
      }
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
          orderCountDaysN: 0,
          salesQuantityDaysN: 0,
        },
        bySite: {} as Record<string, SalesData>
      };

      // 汇总各站点数据
      siteDataMap.forEach((siteData, siteId) => {
        result[sku].bySite[siteId] = siteData;
        result[sku].total.orderCount += siteData.orderCount;
        result[sku].total.salesQuantity += siteData.salesQuantity;
        result[sku].total.orderCountDaysN += siteData.orderCountDaysN;
        result[sku].total.salesQuantityDaysN += siteData.salesQuantityDaysN;
      });
      
      if (result[sku].total.salesQuantity > 0) {
        skusWithData++;
      } else {
        skusWithoutData++;
      }
    });
    
    // 打印统计信息和性能指标
    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(2);

    if (useOptimization) {
      infoLog(`✅ [OPTIMIZED] Processed ${skus.length} SKUs in ${processingTime}s: ${skusWithData} with sales, ${skusWithoutData} without sales`);
      infoLog(`   📊 Strategy: Direct query with in-memory filtering`);
      infoLog(`   📦 Total items processed: ${allOrderItems.length}`);
      infoLog(`   ⚡ Performance gain: ~${Math.round(skus.length/100)}x faster than batch queries`);

      // 对于超大批量，显示内存使用情况
      if (skus.length > 1000 && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        infoLog(`   💾 Memory usage: ${heapUsedMB} MB`);
      }
    } else {
      infoLog(`✅ Processed ${skus.length} SKUs in ${processingTime}s: ${skusWithData} with sales, ${skusWithoutData} without sales`);
      debugLog(`   Strategy: Batch query (${Math.ceil(skus.length/batchSize)} batches)`);
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
      data: result,
      skuMappingUsed: useSkuMapping && erpToWooMapping.size > 0,
      skuMappingStats: erpToWooMapping.size > 0 ? {
        mappedSkus: erpToWooMapping.size,
        totalWooSkus: wooToErpMapping.size,
      } : undefined,
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