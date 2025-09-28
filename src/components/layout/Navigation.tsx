'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Layers,
  TrendingUp,
  RefreshCw,
  Globe,
  Webhook,
  BarChart3,
  Home,
  Package,
  User,
  LogOut,
  Shield
} from 'lucide-react';

const navigationItems = [
  {
    name: '首页',
    href: '/',
    icon: Home,
    description: '系统概览'
  },
  {
    name: '库存分析',
    href: '/inventory',
    icon: Package,
    description: '库存数据分析与管理'
  },
  {
    name: '库存同步',
    href: '/sync',
    icon: RefreshCw,
    description: '产品检测与同步'
  },
  {
    name: '销量检测',
    href: '/sales',
    icon: TrendingUp,
    description: '销量数据分析'
  },
  {
    name: '站点管理',
    href: '/sites',
    icon: Globe,
    description: 'WooCommerce站点配置'
  },
  {
    name: 'Webhook',
    href: '/webhook',
    icon: Webhook,
    description: 'Webhook管理'
  }
];

export function Navigation() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo/Title */}
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span className="text-xl font-semibold">ERP库存系统</span>
          </div>

          {/* Navigation Items */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-1">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href ||
                              (item.href !== '/' && pathname.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive && "bg-accent text-accent-foreground"
                    )}
                    title={item.description}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{item.name}</span>
                  </Link>
                );
              })}
            </div>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span className="hidden md:inline">
                    {user?.email || 'User'}
                  </span>
                  {user?.role === 'admin' && (
                    <Shield className="h-3 w-3 text-primary" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>我的账户</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <User className="mr-2 h-4 w-4" />
                  {user?.email || 'Unknown User'}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Shield className="mr-2 h-4 w-4" />
                  角色: {user?.role === 'admin' ? '管理员' :
                        user?.role === 'manager' ? '经理' : '查看者'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}