'use client';

import { Button } from '@/components/ui/button';
import { SiteManager } from '@/components/sites/SiteManager';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export default function SitesPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回主页
          </Button>
        </Link>
      </div>
      
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">WooCommerce 站点管理</h1>
          <p className="text-muted-foreground">
            配置和管理多个WooCommerce站点，实现多站点销量数据统一查询
          </p>
        </div>
        
        <SiteManager />
        
        <div className="mt-8 p-4 bg-muted/50 rounded-lg">
          <h3 className="font-medium mb-2">使用说明</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• 添加多个WooCommerce站点，每个站点需要独立的API密钥</li>
            <li>• 测试连接确保API配置正确</li>
            <li>• 启用的站点将参与销量检测</li>
            <li>• 销量数据会自动缓存到Supabase，提升查询速度</li>
            <li>• 返回主页后，在"销量检测"页面可以查看多站点聚合数据</li>
          </ul>
        </div>
      </div>
    </div>
  );
}