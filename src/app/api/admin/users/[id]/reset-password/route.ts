import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';

// Generate random password
function generatePassword(length = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// POST: Reset user password
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if user is admin
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    // Check if requesting user is admin
    const { data: requestingUser, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || !requestingUser || requestingUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const targetUserId = params.id;

    // Get target user info
    const { data: targetUser, error: fetchError } = await supabase
      .from('users')
      .select('email')
      .eq('id', targetUserId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Generate new password
    const newPassword = generatePassword();

    // Reset password in Supabase Auth
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Password reset service not configured' },
        { status: 503 }
      );
    }

    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        cookies: {
          get: () => null,
          set: () => {},
          remove: () => {},
        },
      }
    );

    const { error: resetError } = await authClient.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    );

    if (resetError) {
      console.error('Failed to reset password:', resetError);
      return NextResponse.json(
        { error: 'Failed to reset password' },
        { status: 500 }
      );
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'RESET_PASSWORD',
        entity_type: 'user',
        entity_id: targetUserId,
        details: {
          email: targetUser.email,
        },
      });

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
      newPassword: newPassword,
      email: targetUser.email
    });

  } catch (error: any) {
    console.error('Reset password API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}