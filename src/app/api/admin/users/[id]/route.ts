import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';

// PUT: Update user
export async function PUT(
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
    const body = await request.json();

    // Build update object
    const updates: any = {};
    if ('role' in body) {
      if (!['admin', 'manager', 'viewer'].includes(body.role)) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }
      updates.role = body.role;
    }
    if ('is_active' in body) {
      updates.is_active = body.is_active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      );
    }

    // Update user
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', targetUserId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update user:', updateError);
      return NextResponse.json(
        { error: 'Failed to update user' },
        { status: 500 }
      );
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'UPDATE_USER',
        entity_type: 'user',
        entity_id: targetUserId,
        details: updates,
      });

    return NextResponse.json({
      success: true,
      user: updatedUser
    });

  } catch (error: any) {
    console.error('Update user API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Delete user
export async function DELETE(
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

    // Prevent self-deletion
    if (targetUserId === userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Get user info before deletion
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

    // Delete from database first
    const { error: deleteDbError } = await supabase
      .from('users')
      .delete()
      .eq('id', targetUserId);

    if (deleteDbError) {
      console.error('Failed to delete user from database:', deleteDbError);
      return NextResponse.json(
        { error: 'Failed to delete user' },
        { status: 500 }
      );
    }

    // Delete from Supabase Auth
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
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

      const { error: authDeleteError } = await authClient.auth.admin.deleteUser(targetUserId);
      if (authDeleteError) {
        console.error('Failed to delete auth user:', authDeleteError);
        // Continue anyway since DB record is already deleted
      }
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'DELETE_USER',
        entity_type: 'user',
        entity_id: targetUserId,
        details: {
          email: targetUser.email,
        },
      });

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete user API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}