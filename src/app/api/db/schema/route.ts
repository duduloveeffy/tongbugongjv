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

    // Query to get all tables in public schema
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_tables_info', {}, { count: 'exact' })
      .select();

    // If the function doesn't exist, try a different approach
    if (tablesError) {
      // Try to get information from information_schema
      const { data: tableInfo, error: schemaError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .like('table_name', '%order%');

      if (schemaError) {
        // Try yet another approach - query actual tables
        const testQueries = [
          { name: 'orders', query: supabase.from('orders').select('*').limit(0) },
          { name: 'wc_orders', query: supabase.from('wc_orders').select('*').limit(0) },
          { name: 'wc_orders_v2', query: supabase.from('wc_orders_v2').select('*').limit(0) },
        ];

        const results: any = {};
        for (const test of testQueries) {
          const { data, error } = await test.query;
          results[test.name] = {
            exists: !error,
            error: error?.message,
            // If table exists and we got data (even empty array), try to get column info
            columns: !error && data !== null ? (data.length > 0 ? Object.keys(data[0]) : 'Table exists but is empty') : null
          };
        }

        // Also test a query with actual data to see columns
        const { data: sampleOrder, error: sampleError } = await supabase
          .from('orders')
          .select('*')
          .limit(1);

        const { data: sites, error: sitesError } = await supabase
          .from('wc_sites')
          .select('id, name')
          .eq('enabled', true);

        return NextResponse.json({
          success: true,
          method: 'direct_query',
          tables: results,
          sample: {
            hasData: sampleOrder && sampleOrder.length > 0,
            columns: sampleOrder && sampleOrder.length > 0 ? Object.keys(sampleOrder[0]) : null,
            error: sampleError?.message
          },
          sites: {
            count: sites?.length || 0,
            data: sites,
            error: sitesError?.message
          }
        });
      }

      return NextResponse.json({
        success: true,
        method: 'information_schema',
        tables: tableInfo
      });
    }

    return NextResponse.json({
      success: true,
      method: 'rpc',
      tables
    });

  } catch (error: any) {
    console.error('Schema API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}