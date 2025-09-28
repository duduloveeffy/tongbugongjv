import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { withAuth, logAuditEvent } from '@/lib/auth/middleware';
import type { User } from '@/lib/auth/types';
import { Permissions, ProtectionLevel } from '@/lib/auth/types';

// Protected sales analysis endpoint
export const POST = withAuth(
  async (request: NextRequest, user: User) => {
    const startTime = Date.now();

    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return NextResponse.json({
          error: 'Database not configured'
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
        strictMatch = false
      } = body;

      if (!skus || !Array.isArray(skus) || skus.length === 0) {
        return NextResponse.json({
          error: 'No SKUs provided'
        }, { status: 400 });
      }

      // Log the access with user context
      await logAuditEvent(user.id, 'SALES_ANALYSIS', 'orders', {
        sku_count: skus.length,
        site_ids: siteIds,
        date_range: { start: dateStart, end: dateEnd },
        days_back: daysBack,
        user_role: user.role,
        ip_address: request.headers.get('x-forwarded-for'),
        user_agent: request.headers.get('user-agent'),
      });

      // Check if user has permission to view sales from specific sites
      let authorizedSiteIds = siteIds;

      // If user is not admin, they might have restricted site access
      if (user.role !== 'admin') {
        // Check user's authorized sites from database
        const { data: userSites } = await supabase
          .from('user_site_access')
          .select('site_id')
          .eq('user_id', user.id);

        if (userSites && userSites.length > 0) {
          const allowedSites = userSites.map(s => s.site_id);

          // Filter to only authorized sites
          if (siteIds && siteIds.length > 0) {
            authorizedSiteIds = siteIds.filter(id => allowedSites.includes(id));

            if (authorizedSiteIds.length === 0) {
              return NextResponse.json({
                error: 'You do not have access to the requested sites'
              }, { status: 403 });
            }
          } else {
            // If no specific sites requested, use only user's authorized sites
            authorizedSiteIds = allowedSites;
          }
        }
      }

      // Normalize SKUs for matching
      const normalizedSkus = strictMatch
        ? skus.map(sku => sku.trim())
        : skus.map(sku => sku.trim().toUpperCase());

      // Build query
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

      // Apply site filter with authorization
      if (authorizedSiteIds && authorizedSiteIds.length > 0) {
        query = query.in('orders.site_id', authorizedSiteIds);
      }

      // Apply date filters
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - daysBack);
      query = query.gte('orders.date_created', thirtyDaysAgo.toISOString());

      if (dateEnd) {
        query = query.lte('orders.date_created', dateEnd);
      }

      // Execute query with pagination for large datasets
      let allOrderItems: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageItems, error } = await query.range(offset, offset + pageSize - 1);

        if (error) {
          console.error(`Query error at offset ${offset}:`, error);
          return NextResponse.json({
            error: 'Failed to fetch sales data',
            details: error.message
          }, { status: 500 });
        }

        if (pageItems && pageItems.length > 0) {
          allOrderItems = allOrderItems.concat(pageItems);
          hasMore = pageItems.length === pageSize;
          offset += pageSize;
        } else {
          hasMore = false;
        }
      }

      // Filter for requested SKUs
      const skuSet = new Set(normalizedSkus);
      const filteredItems = allOrderItems.filter(item => {
        const itemSku = strictMatch ? item.sku?.trim() : item.sku?.trim().toUpperCase();
        return skuSet.has(itemSku);
      });

      // Aggregate sales data
      const salesDataMap = new Map<string, any>();

      filteredItems.forEach(item => {
        const sku = item.sku;
        const quantity = Number(item.quantity) || 0;
        const siteId = item.orders.site_id;
        const siteName = item.orders.wc_sites.name;
        const orderDate = new Date(item.orders.date_created);
        const isWithin30Days = orderDate >= thirtyDaysAgo;

        if (!salesDataMap.has(sku)) {
          salesDataMap.set(sku, {
            sku,
            orderCount: 0,
            salesQuantity: 0,
            orderCount30d: 0,
            salesQuantity30d: 0,
            bySite: {}
          });
        }

        const skuData = salesDataMap.get(sku);

        // Initialize site data if needed
        if (!skuData.bySite[siteId]) {
          skuData.bySite[siteId] = {
            siteName,
            orderCount: 0,
            salesQuantity: 0,
            orderCount30d: 0,
            salesQuantity30d: 0
          };
        }

        // Update totals
        skuData.salesQuantity += quantity;
        skuData.orderCount += 1;

        if (isWithin30Days) {
          skuData.salesQuantity30d += quantity;
          skuData.orderCount30d += 1;
        }

        // Update site-specific data
        skuData.bySite[siteId].salesQuantity += quantity;
        skuData.bySite[siteId].orderCount += 1;

        if (isWithin30Days) {
          skuData.bySite[siteId].salesQuantity30d += quantity;
          skuData.bySite[siteId].orderCount30d += 1;
        }
      });

      // Convert map to array
      const salesData = Array.from(salesDataMap.values());

      // Calculate statistics
      const totalSales = salesData.reduce((sum, item) => sum + item.salesQuantity30d, 0);
      const skusWithSales = salesData.filter(item => item.salesQuantity30d > 0).length;

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

      // Log summary for audit
      await logAuditEvent(user.id, 'SALES_ANALYSIS_COMPLETE', 'orders', {
        processing_time: processingTime,
        total_sales: totalSales,
        skus_with_sales: skusWithSales,
        total_skus: skus.length
      });

      return NextResponse.json({
        success: true,
        data: salesData,
        stats: {
          totalSkus: skus.length,
          skusWithSales,
          totalSales30d: totalSales,
          processingTime: `${processingTime}s`
        },
        user: {
          email: user.email,
          role: user.role
        }
      });

    } catch (error: any) {
      console.error('Sales analysis error:', error);

      // Log error for debugging
      await logAuditEvent(user.id, 'SALES_ANALYSIS_ERROR', 'orders', {
        error: error.message,
        stack: error.stack
      });

      return NextResponse.json({
        error: error.message || 'Internal server error',
        success: false
      }, { status: 500 });
    }
  },
  ProtectionLevel.AUTHORIZED,
  [Permissions.SALES_READ] // Requires sales read permission
);