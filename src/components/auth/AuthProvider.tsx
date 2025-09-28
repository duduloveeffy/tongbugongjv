'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const PUBLIC_PATHS = ['/login', '/register'];

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, checkSession } = useAuthStore();

  useEffect(() => {
    // Check session on mount and when pathname changes
    const verifyAuth = async () => {
      await checkSession();
      
      const authState = useAuthStore.getState();
      const isPublicPath = PUBLIC_PATHS.some(path => pathname.startsWith(path));
      
      if (!authState.isAuthenticated && !isPublicPath) {
        router.push('/login');
      } else if (authState.isAuthenticated && isPublicPath) {
        router.push('/');
      }
    };

    verifyAuth();
  }, [pathname, router, checkSession]);

  // Show nothing while checking authentication
  if (!isAuthenticated && !PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-500">验证身份中...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}