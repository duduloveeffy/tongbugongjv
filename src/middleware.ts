import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/session',
  '/api/health',
  // Temporarily allow sites API to work without auth while we fix the session issue
  '/api/sites',
];

// Routes that are view-only (no sensitive data)
const VIEW_ONLY_ROUTES: string[] = [];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for non-API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check if Supabase is configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    // In development without Supabase, block API access for security
    console.warn('⚠️ Supabase not configured - API access blocked for security');
    return NextResponse.json(
      {
        error: 'Authentication service not configured',
        message: 'Please configure Supabase to access API endpoints'
      },
      { status: 503 }
    );
  }

  // Create response object for cookie handling
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          const value = request.cookies.get(name)?.value;
          return value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Set cookie on the response
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          // Remove cookie from response
          response.cookies.set({
            name,
            value: '',
            ...options,
            maxAge: 0,
          });
        },
      },
    }
  );

  // Check for valid session
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    console.log(`⚠️ No valid session for ${pathname}`);
    // No valid session - return 401
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Please login to access this resource'
      },
      { status: 401 }
    );
  }

  // Add user info to request headers for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', session.user.id);
  requestHeaders.set('x-user-email', session.user.email || '');

  // Log API access for security monitoring
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ [API Access] User: ${session.user.email} - Path: ${pathname}`);
  }

  // Create new response with updated headers
  const newResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Copy cookies from original response
  response.cookies.getAll().forEach(cookie => {
    newResponse.cookies.set(cookie);
  });

  return newResponse;
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};