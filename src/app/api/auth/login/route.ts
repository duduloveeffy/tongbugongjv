import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { checkAccountLockout, recordFailedLogin, clearFailedLoginAttempts } from '@/lib/auth/rate-limit';
import { logAuditEvent } from '@/lib/auth/middleware';
import { sanitizeInput, isValidEmail } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Sanitize and validate email
    const cleanEmail = sanitizeInput(email).toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check account lockout
    const lockoutStatus = await checkAccountLockout(cleanEmail);
    if (lockoutStatus.isLocked) {
      return NextResponse.json(
        {
          error: 'Account temporarily locked',
          message: `Too many failed attempts. Please try again in ${lockoutStatus.remainingTime} seconds`
        },
        { status: 429 }
      );
    }

    // Check Supabase configuration
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Authentication service not configured' },
        { status: 503 }
      );
    }

    // Create Supabase client
    let response = NextResponse.next();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options });
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options });
            response.cookies.set({ name, value: '', ...options });
          },
        },
      }
    );

    // Attempt login
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      // Record failed attempt
      const { attempts, lockout } = await recordFailedLogin(cleanEmail);

      // Log failed login attempt
      await logAuditEvent('anonymous', 'LOGIN_FAILED', 'auth', {
        email: cleanEmail,
        attempts,
        ip_address: request.headers.get('x-forwarded-for'),
        user_agent: request.headers.get('user-agent'),
      });

      if (lockout) {
        return NextResponse.json(
          {
            error: 'Account locked',
            message: 'Too many failed attempts. Account locked for 15 minutes'
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          error: 'Invalid credentials',
          attempts_remaining: 5 - attempts
        },
        { status: 401 }
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { error: 'Login failed' },
        { status: 401 }
      );
    }

    // Clear failed login attempts on success
    await clearFailedLoginAttempts(cleanEmail);

    // Get or create user record in our database
    const { getSupabaseClient } = await import('@/lib/supabase');
    const adminSupabase = getSupabaseClient();

    if (adminSupabase) {
      // Check if user exists in our users table
      const { data: userData, error: userError } = await adminSupabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (userError && userError.code === 'PGRST116') {
        // User doesn't exist, create record
        await adminSupabase
          .from('users')
          .insert({
            id: data.user.id,
            email: data.user.email,
            role: 'viewer', // Default role
            last_login: new Date().toISOString(),
          });
      } else if (userData) {
        // Update last login
        await adminSupabase
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', data.user.id);
      }

      // Log successful login
      await logAuditEvent(data.user.id, 'LOGIN_SUCCESS', 'auth', {
        email: cleanEmail,
        ip_address: request.headers.get('x-forwarded-for'),
        user_agent: request.headers.get('user-agent'),
      });
    }

    // Create response with session
    response = NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || 'viewer',
      },
      session: data.session,
    });

    // Set session cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };

    if (data.session) {
      response.cookies.set('sb-access-token', data.session.access_token, cookieOptions);
      if (data.session.refresh_token) {
        response.cookies.set('sb-refresh-token', data.session.refresh_token, cookieOptions);
      }
    }

    return response;

  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}