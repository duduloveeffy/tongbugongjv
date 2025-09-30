import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    // Test 1: Check if orders table exists and get its structure
    const { data: ordersTest, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .limit(1);

    // Test 2: Check if wc_sites table exists
    const { data: sitesTest, error: sitesError } = await supabase
      .from('wc_sites')
      .select('id, name')
      .eq('enabled', true);

    // Test 3: Get column names from orders table
    let columns = [];
    if (ordersTest && ordersTest.length > 0) {
      columns = Object.keys(ordersTest[0]);
    }

    return NextResponse.json({
      success: true,
      tests: {
        orders: {
          exists: !ordersError,
          error: ordersError?.message,
          sampleData: ordersTest?.[0],
          columns: columns
        },
        sites: {
          exists: !sitesError,
          error: sitesError?.message,
          count: sitesTest?.length || 0,
          data: sitesTest
        }
      }
    });

  } catch (error: any) {
    console.error('Test API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}