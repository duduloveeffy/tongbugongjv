/**
 * 测试脚本：查询vapsolo*站点的订单平均价格
 *
 * 功能：
 * - 查询所有vapsolo*站点（包括vapsolo-co-wholesale）
 * - 统计已完成和处理中订单的平均价格
 * - 按站点和货币分组统计
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'node:path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ 缺少Supabase环境变量');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface OrderStats {
  site_id: string;
  site_name: string;
  currency: string;
  order_count: number;
  total_amount: number;
  avg_price: number;
  min_price: number;
  max_price: number;
}

async function analyzeVapsoloOrders() {
  console.log('\n========================================');
  console.log('Vapsolo* 站点订单平均价格分析');
  console.log('========================================\n');

  try {
    // 1. 查询所有vapsolo*站点
    console.log('📊 查询vapsolo*站点信息...\n');
    const { data: sites, error: sitesError } = await supabase
      .from('wc_sites')
      .select('id, name, url, enabled')
      .ilike('name', 'vapsolo%')
      .order('name');

    if (sitesError) {
      console.error('❌ 查询站点失败:', sitesError);
      return;
    }

    if (!sites || sites.length === 0) {
      console.log('⚠️  未找到vapsolo*站点');
      return;
    }

    console.log(`🏪 找到 ${sites.length} 个vapsolo*站点:\n`);
    sites.forEach((site, index) => {
      const status = site.enabled ? '✅' : '❌';
      console.log(`  ${index + 1}. ${status} ${site.name} - ${site.url}`);
    });

    const siteIds = sites.map(s => s.id);
    const siteNameMap = new Map(sites.map(s => [s.id, s.name]));

    // 2. 查询订单统计（使用分页获取所有数据）
    console.log('\n📈 查询订单统计数据...\n');
    console.log('筛选条件:');
    console.log('  - 订单状态: completed, processing');
    console.log('  - 时间范围: 全部历史订单\n');

    // 分页查询所有订单
    let allOrders: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    console.log('正在分页获取订单数据...');

    while (hasMore) {
      const { data: ordersPage, error: ordersError } = await supabase
        .from('orders')
        .select('site_id, status, currency, total')
        .in('site_id', siteIds)
        .in('status', ['completed', 'processing'])
        .range(offset, offset + pageSize - 1)
        .order('date_created', { ascending: false });

      if (ordersError) {
        console.error('❌ 查询订单失败:', ordersError);
        return;
      }

      if (!ordersPage || ordersPage.length === 0) {
        hasMore = false;
      } else {
        allOrders = [...allOrders, ...ordersPage];
        offset += pageSize;
        console.log(`  已获取 ${allOrders.length} 条订单...`);

        // 如果返回的数据少于pageSize，说明已经是最后一页了
        if (ordersPage.length < pageSize) {
          hasMore = false;
        }
      }
    }

    const orders = allOrders;

    if (orders.length === 0) {
      console.log('⚠️  未找到符合条件的订单');
      return;
    }

    console.log(`\n✅ 成功获取 ${orders.length} 条订单记录\n`);

    // 3. 计算总体统计
    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, order) => sum + (parseFloat(order.total as string) || 0), 0);
    const avgPrice = totalAmount / totalOrders;
    const prices = orders.map(o => parseFloat(o.total as string) || 0).filter(p => p > 0);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);

    console.log('========================================');
    console.log('📊 总体统计');
    console.log('========================================\n');
    console.log(`  总订单数:      ${totalOrders.toLocaleString()}`);
    console.log(`  订单总金额:    €${totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  平均订单价格:  €${avgPrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  最高订单金额:  €${maxPrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  最低订单金额:  €${minPrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    // 4. 按站点统计
    console.log('\n========================================');
    console.log('📊 按站点统计');
    console.log('========================================\n');

    const statsBySite = new Map<string, { count: number; total: number; currencies: Set<string> }>();

    orders.forEach(order => {
      const siteId = order.site_id;
      if (!statsBySite.has(siteId)) {
        statsBySite.set(siteId, { count: 0, total: 0, currencies: new Set() });
      }
      const stats = statsBySite.get(siteId)!;
      stats.count++;
      stats.total += parseFloat(order.total as string) || 0;
      stats.currencies.add(order.currency || 'EUR');
    });

    // 按订单数排序
    const sortedSites = Array.from(statsBySite.entries())
      .map(([siteId, stats]) => ({
        siteId,
        siteName: siteNameMap.get(siteId) || siteId,
        count: stats.count,
        total: stats.total,
        avg: stats.total / stats.count,
        currencies: Array.from(stats.currencies).join(', ')
      }))
      .sort((a, b) => b.total - a.total);

    sortedSites.forEach((site, index) => {
      console.log(`${index + 1}. ${site.siteName}`);
      console.log(`   订单数:      ${site.count.toLocaleString()}`);
      console.log(`   总金额:      €${site.total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`   平均价格:    €${site.avg.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`   占比:        ${(site.total / totalAmount * 100).toFixed(1)}%`);
      console.log(`   货币:        ${site.currencies}`);
      console.log('');
    });

    // 5. 按货币统计
    console.log('========================================');
    console.log('💰 按货币统计');
    console.log('========================================\n');

    const statsByCurrency = new Map<string, { count: number; total: number }>();

    orders.forEach(order => {
      const currency = order.currency || 'EUR';
      if (!statsByCurrency.has(currency)) {
        statsByCurrency.set(currency, { count: 0, total: 0 });
      }
      const stats = statsByCurrency.get(currency)!;
      stats.count++;
      stats.total += parseFloat(order.total as string) || 0;
    });

    const sortedCurrencies = Array.from(statsByCurrency.entries())
      .map(([currency, stats]) => ({
        currency,
        count: stats.count,
        total: stats.total,
        avg: stats.total / stats.count
      }))
      .sort((a, b) => b.count - a.count);

    sortedCurrencies.forEach((curr, index) => {
      console.log(`${index + 1}. ${curr.currency}`);
      console.log(`   订单数:      ${curr.count.toLocaleString()} (${(curr.count / totalOrders * 100).toFixed(1)}%)`);
      console.log(`   总金额:      ${curr.currency} ${curr.total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`   平均价格:    ${curr.currency} ${curr.avg.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log('');
    });

    // 6. 按订单状态统计
    console.log('========================================');
    console.log('📦 按订单状态统计');
    console.log('========================================\n');

    const statsByStatus = new Map<string, { count: number; total: number }>();

    orders.forEach(order => {
      const status = order.status;
      if (!statsByStatus.has(status)) {
        statsByStatus.set(status, { count: 0, total: 0 });
      }
      const stats = statsByStatus.get(status)!;
      stats.count++;
      stats.total += parseFloat(order.total as string) || 0;
    });

    statsByStatus.forEach((stats, status) => {
      const statusLabel = status === 'completed' ? '已完成' : status === 'processing' ? '处理中' : status;
      console.log(`${statusLabel}:`);
      console.log(`   订单数:      ${stats.count.toLocaleString()} (${(stats.count / totalOrders * 100).toFixed(1)}%)`);
      console.log(`   总金额:      €${stats.total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`   平均价格:    €${(stats.total / stats.count).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log('');
    });

    console.log('========================================');
    console.log('✅ 分析完成');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ 发生错误:', error);
  }
}

// 执行分析
analyzeVapsoloOrders()
  .then(() => {
    console.log('✨ 脚本执行完成\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
