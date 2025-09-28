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

    // Create response first for cookie handling
    const cookieStore = {
      cookies: [] as Array<{ name: string; value: string; options: CookieOptions }>,
    };

    // Create Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            // Store cookies to be set on response later
            cookieStore.cookies.push({ name, value, options });
          },
          remove(name: string, options: CookieOptions) {
            // Store removal cookies
            cookieStore.cookies.push({ name, value: '', options: { ...options, maxAge: 0 } });
          },
        },
      }
    );

    // Attempt login
    console.log('🔐 Login attempt for:', cleanEmail);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    console.log('🔍 Supabase auth response:', {
      hasUser: !!data?.user,
      hasSession: !!data?.session,
      error: error?.message || null,
      userId: data?.user?.id || null,
      email: data?.user?.email || null,
    });

    if (error) {
      console.error('❌ Supabase auth error:', error);
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
      console.error('❌ No user in response');
      return NextResponse.json(
        { error: 'Login failed' },
        { status: 401 }
      );
    }

    console.log('✅ Login successful for user:', data.user.id);

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
    const responseData = {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || 'viewer',
      },
      session: data.session,
    };

    console.log('📦 Sending response:', {
      success: responseData.success,
      userId: responseData.user.id,
      hasSession: !!responseData.session,
      sessionAccessToken: responseData.session?.access_token ? 'present' : 'missing',
    });

    const response = NextResponse.json(responseData);

    // Apply all cookies that Supabase set during authentication
    console.log(`🍪 Setting ${cookieStore.cookies.length} cookies from Supabase`);
    for (const cookie of cookieStore.cookies) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    // Log what cookies Supabase wants to set
    console.log('🔍 Cookies from Supabase:', cookieStore.cookies.map(c => c.name));

    console.log('✅ Login API completed successfully');
    return response;

  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}