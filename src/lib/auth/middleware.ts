import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { User, Permission } from './types';
import { UserRole, RolePermissions, ProtectionLevel } from './types';

// Create a Supabase client configured for server-side auth
export function createSupabaseServerClient(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: any) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  return { supabase, response };
}

// Check if user has required permissions
export function hasPermission(userRole: UserRole, requiredPermissions: Permission[]): boolean {
  const userPermissions = RolePermissions[userRole] || [];
  return requiredPermissions.every(permission => userPermissions.includes(permission));
}

// Main authentication middleware
export async function authMiddleware(
  request: NextRequest,
  protectionLevel: ProtectionLevel = ProtectionLevel.AUTHENTICATED,
  requiredPermissions?: Permission[]
): Promise<{ user: User | null; response: NextResponse | null; error?: string }> {
  // Public routes don't need authentication
  if (protectionLevel === ProtectionLevel.PUBLIC) {
    return { user: null, response: null };
  }

  // Check if Supabase is configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('Supabase not configured - skipping authentication');
    return {
      user: null,
      response: null,
      error: 'Authentication service not configured'
    };
  }

  try {
    const { supabase, response } = createSupabaseServerClient(request);

    // Get the session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return {
        user: null,
        response: NextResponse.json(
          { error: 'Unauthorized - Please login' },
          { status: 401 }
        ),
        error: 'No valid session'
      };
    }

    // Get user details with role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData) {
      return {
        user: null,
        response: NextResponse.json(
          { error: 'User not found' },
          { status: 401 }
        ),
        error: 'User not found'
      };
    }

    const user: User = {
      id: userData.id,
      email: userData.email,
      role: userData.role || UserRole.VIEWER,
      created_at: userData.created_at,
      last_login: userData.last_login,
    };

    // Check permissions if required
    if (protectionLevel === ProtectionLevel.AUTHORIZED && requiredPermissions) {
      if (!hasPermission(user.role, requiredPermissions)) {
        return {
          user,
          response: NextResponse.json(
            { error: 'Forbidden - Insufficient permissions' },
            { status: 403 }
          ),
          error: 'Insufficient permissions'
        };
      }
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    return { user, response };

  } catch (error: any) {
    console.error('Auth middleware error:', error);
    return {
      user: null,
      response: NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      ),
      error: error.message
    };
  }
}

// Helper to protect API routes
export function withAuth(
  handler: (request: NextRequest, user: User) => Promise<NextResponse>,
  protectionLevel: ProtectionLevel = ProtectionLevel.AUTHENTICATED,
  requiredPermissions?: Permission[]
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const { user, response, error } = await authMiddleware(request, protectionLevel, requiredPermissions);

    if (response) {
      return response; // Return error response if authentication failed
    }

    if (protectionLevel !== ProtectionLevel.PUBLIC && !user) {
      return NextResponse.json(
        { error: error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Call the actual handler with authenticated user
    return handler(request, user as User);
  };
}

// Audit logging helper
export async function logAuditEvent(
  userId: string,
  action: string,
  resource: string,
  details?: any
) {
  try {
    const supabase = (await import('@/lib/supabase')).getSupabaseClient();

    if (!supabase) {
      console.warn('Supabase not configured for audit logging');
      return;
    }

    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      resource,
      details,
      ip_address: details?.ip_address || null,
      user_agent: details?.user_agent || null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}