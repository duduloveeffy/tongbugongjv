import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  console.log('🔍 Session check requested');

  try {
    // Check Supabase configuration
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('❌ Supabase not configured');
      return NextResponse.json(
        { error: 'Authentication service not configured' },
        { status: 503 }
      );
    }

    // Create Supabase client with proper cookie handling
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name: string) {
            const value = request.cookies.get(name)?.value;
            console.log(`  Reading cookie ${name}: ${value ? 'found' : 'not found'}`);
            return value;
          },
          set(name: string, value: string, options: CookieOptions) {
            // Session check doesn't need to set cookies
            console.log(`  Supabase trying to set cookie: ${name}`);
          },
          remove(name: string, options: CookieOptions) {
            // Session check doesn't need to remove cookies
            console.log(`  Supabase trying to remove cookie: ${name}`);
          },
        },
      }
    );

    // Get current session
    // Log all cookies for debugging
    const allCookies = request.cookies.getAll();
    console.log('🍪 All cookies:', allCookies.map(c => c.name));

    // Check for Supabase auth cookies with the correct project ID
    const projectId = 'evcmuhykdcmyvgbyluds';
    const authCookie = request.cookies.get(`sb-${projectId}-auth-token`);
    console.log('🔑 Auth cookie status:', authCookie ? 'present' : 'missing');

    const { data: { session }, error } = await supabase.auth.getSession();

    console.log('📋 Session check result:', {
      hasSession: !!session,
      error: error?.message || null,
      userId: session?.user?.id || null,
      email: session?.user?.email || null,
    });

    if (error || !session) {
      console.error('❌ No active session found');
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      );
    }

    // Get user role from database
    const { getSupabaseClient } = await import('@/lib/supabase');
    const adminSupabase = getSupabaseClient();

    let userRole = 'viewer';
    if (adminSupabase) {
      const { data: userData } = await adminSupabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (userData) {
        userRole = userData.role;
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: userRole,
      },
      session: {
        access_token: session.access_token,
        expires_at: session.expires_at,
      },
    });

  } catch (error: any) {
    console.error('Session check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}