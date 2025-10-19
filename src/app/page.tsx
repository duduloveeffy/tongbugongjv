'use client';

import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInventoryStore } from '@/store/inventory';
import { useMultiSiteStore } from '@/store/multisite';
import { useWooCommerceStore } from '@/store/woocommerce';
import { useEffect } from 'react';
import Link from 'next/link';
import {
  Package,
  TrendingUp,
  RefreshCw,
  Globe,
  Webhook,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  BarChart3
} from 'lucide-react';

export default function DashboardPage() {
  const { inventoryData, selectedSkusForSync } = useInventoryStore();
  const { sites, fetchSites } = useMultiSiteStore();
  const { settings } = useWooCommerceStore();

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Calculate statistics
  const totalProducts = inventoryData.length;
  const lowStockProducts = inventoryData.filter(item => {
    const netStock = (item.可售库存 || 0) - (item.缺货占用库存 || 0);
    return netStock > 0 && netStock <= 10;
  }).length;
  const outOfStockProducts = inventoryData.filter(item => {
    const netStock = (item.可售库存 || 0) - (item.缺货占用库存 || 0);
    return netStock <= 0;
  }).length;
  const enabledSites = sites.filter(site => site.enabled).length;

  const quickActions = [
    {
      title: '库存分析',
      description: '同步并分析库存数据',
      icon: Package,
      href: '/inventory',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      stats: totalProducts ? `${totalProducts} 个产品` : '未同步数据',
    },
    {
      title: '库存同步',
      description: '同步库存到WooCommerce',
      icon: RefreshCw,
      href: '/sync',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      stats: selectedSkusForSync.size ? `${selectedSkusForSync.size} 待同步` : '无待同步项',
    },
    {
      title: '销量检测',
      description: '分析产品销量趋势',
      icon: TrendingUp,
      href: '/sales',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      stats: '多站点聚合',
    },
    {
      title: '站点管理',
      description: '配置WooCommerce站点',
      icon: Globe,
      href: '/sites',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      stats: `${enabledSites} 个活跃站点`,
    },
  ];

  const statusCards = [
    {
      title: '库存状态',
      value: totalProducts,
      label: '总产品数',
      icon: Package,
      color: 'text-blue-600',
    },
    {
      title: '低库存',
      value: lowStockProducts,
      label: '需要关注',
      icon: AlertCircle,
      color: 'text-yellow-600',
    },
    {
      title: '缺货',
      value: outOfStockProducts,
      label: '需要补货',
      icon: AlertCircle,
      color: 'text-red-600',
    },
    {
      title: '站点',
      value: sites.length,
      label: `${enabledSites} 个启用`,
      icon: Globe,
      color: 'text-green-600',
    },
  ];

  return (
    <PageLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ERP 库存管理系统</h1>
          <p className="text-muted-foreground mt-2">
            集成WooCommerce的库存分析与同步平台
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statusCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <Card key={index}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {card.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {card.label}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">快速操作</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Link key={index} href={action.href}>
                  <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <CardHeader>
                      <div className={`inline-flex p-3 rounded-lg ${action.bgColor} mb-2`}>
                        <Icon className={`h-6 w-6 ${action.color}`} />
                      </div>
                      <CardTitle className="text-lg">{action.title}</CardTitle>
                      <CardDescription>{action.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{action.stats}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>系统状态</CardTitle>
            <CardDescription>
              当前系统配置和运行状态
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                {settings.siteUrl ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">WooCommerce API 已配置</p>
                      <p className="text-xs text-muted-foreground">{settings.siteUrl}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium">WooCommerce API 未配置</p>
                      <Link href="/sites" className="text-xs text-blue-600 hover:underline">
                        立即配置 →
                      </Link>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center space-x-4">
                {inventoryData.length > 0 ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">库存数据已同步</p>
                      <p className="text-xs text-muted-foreground">
                        {totalProducts} 个产品，{outOfStockProducts} 个缺货
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Clock className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">等待同步库存数据</p>
                      <Link href="/inventory" className="text-xs text-blue-600 hover:underline">
                        同步数据 →
                      </Link>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center space-x-4">
                {enabledSites > 0 ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">多站点已配置</p>
                      <p className="text-xs text-muted-foreground">
                        {enabledSites} 个站点已启用
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium">未配置站点</p>
                      <Link href="/sites" className="text-xs text-blue-600 hover:underline">
                        添加站点 →
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              使用提示
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• 首次使用请先在<Link href="/sites" className="text-blue-600 hover:underline">站点管理</Link>配置WooCommerce API</li>
              <li>• 在<Link href="/inventory" className="text-blue-600 hover:underline">库存分析</Link>从氚云ERP同步库存数据</li>
              <li>• 使用<Link href="/sync" className="text-blue-600 hover:underline">库存同步</Link>检测产品状态并批量同步</li>
              <li>• 通过<Link href="/sales" className="text-blue-600 hover:underline">销量检测</Link>分析多站点销售数据</li>
              <li>• 系统支持多仓库合并显示和批量操作</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}