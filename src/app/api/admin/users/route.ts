import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import bcrypt from 'bcryptjs';

// GET: Fetch all users
export async function GET(request: NextRequest) {
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

    // Fetch all users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, role, is_active, created_at, last_login')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch users:', error);
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      users: users || []
    });

  } catch (error: any) {
    console.error('Users API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create new user
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { email, password, role = 'viewer', is_active = true } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Validate role
    if (!['admin', 'manager', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Check if user already exists in our database
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Create Supabase auth client
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 503 }
      );
    }

    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get: () => null,
          set: () => {},
          remove: () => {},
        },
      }
    );

    // Create user using regular signUp (doesn't require Service Role Key)
    const { data: authData, error: authError } = await authClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: undefined, // Don't send confirmation email
        data: {
          role: role,
        }
      }
    });

    if (authError) {
      console.error('Failed to create auth user:', authError);
      if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
        return NextResponse.json(
          { error: 'Email already registered' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: authError.message || 'Failed to create user' },
        { status: 500 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user - no user returned' },
        { status: 500 }
      );
    }

    // Check if the user was actually created or already existed
    // signUp doesn't error if user exists, it just returns the existing user
    const { data: authUserCheck } = await authClient.auth.getUser();

    // Use upsert to handle the case where auth user exists but not in our users table
    const { data: newUser, error: dbError } = await supabase
      .from('users')
      .upsert({
        id: authData.user.id,
        email,
        role,
        is_active,
      }, {
        onConflict: 'id',
        ignoreDuplicates: false // Update if exists
      })
      .select()
      .single();

    if (dbError) {
      console.error('Failed to create/update user record:', dbError);
      return NextResponse.json(
        { error: 'Failed to create user record' },
        { status: 500 }
      );
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'CREATE_USER',
        entity_type: 'user',
        entity_id: newUser.id,
        details: {
          email: newUser.email,
          role: newUser.role,
        },
      });

    return NextResponse.json({
      success: true,
      user: newUser
    }, { status: 201 });

  } catch (error: any) {
    console.error('Create user API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}