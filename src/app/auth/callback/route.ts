import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const error_description = searchParams.get('error_description');

  // Handle errors
  if (error) {
    console.error('Auth callback error:', error, error_description);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error_description || error)}`, request.url)
    );
  }

  if (code) {
    const cookieStore = {
      cookies: [] as Array<{ name: string; value: string; options: CookieOptions }>,
    };

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.cookies.push({ name, value, options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.cookies.push({ name, value: '', options: { ...options, maxAge: 0 } });
          },
        },
      }
    );

    try {
      // Exchange code for session
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('Failed to exchange code for session:', exchangeError);
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent('验证失败，请重试')}`, request.url)
        );
      }

      // Create response with redirect to login success page
      const response = NextResponse.redirect(new URL('/login?verified=true', request.url));

      // Apply cookies
      cookieStore.cookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options as any);
      });

      return response;
    } catch (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent('验证过程出错')}`, request.url)
      );
    }
  }

  // No code or error, redirect to login
  return NextResponse.redirect(new URL('/login', request.url));
}