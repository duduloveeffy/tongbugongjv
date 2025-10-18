import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

interface PaymentMethodStats {
  method: string;
  title: string;
  count: number;
  percentage: number;
  sampleOrder: {
    id: string;
    site: string;
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return NextResponse.json({
        error: 'Supabase not configured'
      }, { status: 503 });
    }

    // 获取所有启用的站点
    const { data: sites, error: sitesError } = await supabase
      .from('wc_sites')
      .select('id, name, url, api_key, api_secret')
      .eq('enabled', true);

    if (sitesError || !sites || sites.length === 0) {
      console.error('Failed to fetch sites:', sitesError);
      return NextResponse.json({
        error: 'No enabled sites found'
      }, { status: 404 });
    }

    console.log(`\n========== 支付方式统计 ==========`);
    console.log(`找到 ${sites.length} 个启用的站点\n`);

    // 统计所有支付方式 - key格式: "method|||title"
    const paymentMethodsMap = new Map<string, {
      method: string;
      title: string;
      count: number;
      sampleOrder: { id: string; site: string };
    }>();
    let totalOrders = 0;

    // 获取所有站点的所有订单
    for (const site of sites) {
      try {
        console.log(`\n📍 正在获取 ${site.name} 的订单...`);

        const auth = Buffer.from(`${site.api_key}:${site.api_secret}`).toString('base64');
        const baseUrl = site.url.replace(/\/$/, '');

        let page = 1;
        let hasMore = true;
        let siteOrderCount = 0;

        // 分页获取所有订单
        while (hasMore) {
          const response = await fetch(
            `${baseUrl}/wp-json/wc/v3/orders?per_page=100&page=${page}&orderby=date&order=desc&_fields=id,payment_method,payment_method_title`,
            {
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              signal: AbortSignal.timeout(30000), // 30秒超时
            }
          );

          if (!response.ok) {
            if (response.status === 400) {
              // 没有更多页面
              hasMore = false;
              break;
            }
            console.error(`   ❌ HTTP ${response.status} on page ${page}`);
            break;
          }

          const orders = await response.json();

          if (!orders || orders.length === 0) {
            hasMore = false;
            break;
          }

          // 处理每个订单
          orders.forEach((order: any) => {
            const method = order.payment_method || 'unknown';
            const title = order.payment_method_title || '未知支付方式';
            const key = `${method}|||${title}`;

            const existing = paymentMethodsMap.get(key);
            if (existing) {
              existing.count++;
            } else {
              // 第一次遇到这种支付方式，记录示例订单
              paymentMethodsMap.set(key, {
                method,
                title,
                count: 1,
                sampleOrder: {
                  id: order.id,
                  site: site.name
                }
              });
            }
            totalOrders++;
            siteOrderCount++;
          });

          console.log(`   - 第 ${page} 页: ${orders.length} 个订单`);

          // 检查是否还有更多页面
          const totalPages = response.headers.get('X-WP-TotalPages');
          if (totalPages && parseInt(totalPages) <= page) {
            hasMore = false;
          } else if (orders.length < 100) {
            hasMore = false;
          } else {
            page++;
          }
        }

        console.log(`   ✅ ${site.name} 总计: ${siteOrderCount} 个订单`);

      } catch (error: any) {
        console.error(`❌ ${site.name}: ${error.message}`);
      }
    }

    // 计算百分比并按使用次数排序
    const sortedMethods: PaymentMethodStats[] = Array.from(paymentMethodsMap.values())
      .map(stat => ({
        method: stat.method,
        title: stat.title,
        count: stat.count,
        percentage: parseFloat(((stat.count / totalOrders) * 100).toFixed(2)),
        sampleOrder: stat.sampleOrder
      }))
      .sort((a, b) => b.count - a.count);

    // 输出详细统计结果
    console.log(`\n========== 汇总统计 ==========`);
    console.log(`总订单数: ${totalOrders}`);
    console.log(`支付方式种类: ${sortedMethods.length}`);
    console.log(`\n支付方式分布:`);
    console.log(`${'方法'.padEnd(30)} | ${'名称'.padEnd(30)} | ${'次数'.padEnd(8)} | ${'比例'.padEnd(8)} | 示例订单`);
    console.log('-'.repeat(100));

    sortedMethods.forEach(stat => {
      console.log(
        `${stat.method.padEnd(30)} | ${stat.title.padEnd(30)} | ${stat.count.toString().padEnd(8)} | ${(stat.percentage + '%').padEnd(8)} | #${stat.sampleOrder.id} (${stat.sampleOrder.site})`
      );
    });

    console.log(`\n========== 完成 ==========\n`);

    // 返回结果
    return NextResponse.json({
      success: true,
      message: '支付方式统计完成，请查看控制台输出',
      summary: {
        totalSites: sites.length,
        totalOrders,
        totalPaymentMethods: sortedMethods.length,
        paymentMethods: sortedMethods
      }
    });

  } catch (error: any) {
    console.error('Payment methods test error:', error);
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}