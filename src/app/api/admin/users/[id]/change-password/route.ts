import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/auth/middleware';

// POST: Change user password (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;

    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Authentication service not configured' },
        { status: 503 }
      );
    }

    // Create Supabase client for auth check
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {},
          remove(name: string, options: CookieOptions) {},
        },
      }
    );

    // Check current user's authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get current user's role
    const adminSupabase = getSupabaseClient();

    if (!adminSupabase) {
      return NextResponse.json(
        { error: 'Database connection error' },
        { status: 503 }
      );
    }

    const { data: currentUser } = await adminSupabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    // Check if user is admin
    if (!currentUser || currentUser.role !== 'admin') {
      await logAuditEvent(user.id, 'UNAUTHORIZED_ACCESS', 'admin/users/change-password', {
        attempted_action: 'change_user_password',
        target_user: userId,
      });

      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Get the new password from request body
    const body = await request.json();
    const { newPassword } = body;

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Check if target user exists
    const { data: targetUser } = await adminSupabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Use Supabase Admin API to update the user's password
    // Note: This requires SUPABASE_SERVICE_ROLE_KEY for admin operations
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // If service role key is not available, use a different approach
      // We'll use the auth.admin.updateUserById method which requires service role
      return NextResponse.json(
        { error: 'Service role key not configured. Cannot change passwords.' },
        { status: 503 }
      );
    }

    // Create admin client with service role
    const adminAuthClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {},
          remove(name: string, options: CookieOptions) {},
        },
      }
    );

    // Update the user's password
    const { error: updateError } = await adminAuthClient.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Failed to update password:', updateError);
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    // Log the password change
    await logAuditEvent(user.id, 'USER_PASSWORD_CHANGED', 'admin/users', {
      admin_id: user.id,
      admin_email: user.email,
      target_user_id: userId,
      target_user_email: targetUser.email,
    });

    // Log to database
    if (adminSupabase) {
      await adminSupabase
        .from('audit_logs')
        .insert({
          user_id: user.id,
          action: 'admin_password_change',
          resource: `users/${userId}`,
          details: {
            target_user_email: targetUser.email,
            changed_by: user.email,
            timestamp: new Date().toISOString(),
          }
        });
    }

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error: any) {
    console.error('Change password API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}