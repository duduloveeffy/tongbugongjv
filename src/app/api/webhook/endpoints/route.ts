import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET: Fetch all webhook endpoints
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const { data: endpoints, error } = await supabase
      .from('webhook_endpoints')
      .select(`
        *,
        wc_sites!inner(name),
        webhook_events!webhook_events_site_id_fkey(
          id,
          status,
          received_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch webhook endpoints:', error);
      return NextResponse.json({ error: 'Failed to fetch endpoints' }, { status: 500 });
    }

    // Format the data to match the WebhookManager interface
    const formattedEndpoints = endpoints?.map(endpoint => {
      // Calculate 24h statistics from webhook_events
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const recentEvents = (endpoint.webhook_events || []).filter((event: any) => 
        new Date(event.received_at) >= yesterday
      );
      
      const events_last_24h = recentEvents.length;
      const successful_last_24h = recentEvents.filter((e: any) => e.status === 'success').length;
      const failed_last_24h = recentEvents.filter((e: any) => e.status === 'error').length;

      return {
        id: endpoint.id,
        site_id: endpoint.site_id,
        site_name: endpoint.wc_sites?.name || 'Unknown Site',
        endpoint_type: endpoint.endpoint_type,
        webhook_url: endpoint.webhook_url,
        secret_key: endpoint.secret_key,
        enabled: endpoint.enabled,
        events: endpoint.events ? JSON.parse(endpoint.events as string) : [],
        last_test_at: endpoint.last_test_at,
        last_test_status: endpoint.last_test_status,
        last_test_response: endpoint.last_test_response,
        events_last_24h,
        successful_last_24h,
        failed_last_24h,
        created_at: endpoint.created_at,
        updated_at: endpoint.updated_at,
      };
    }) || [];

    return NextResponse.json({ 
      success: true,
      endpoints: formattedEndpoints 
    });

  } catch (error: any) {
    console.error('GET webhook endpoints error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// POST: Create new webhook endpoint
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const body = await request.json();
    const { 
      site_id, 
      endpoint_type = 'realtime', 
      webhook_url, 
      secret_key, 
      enabled = true, 
      events = [] 
    } = body;

    // Validate required fields
    if (!site_id || !webhook_url) {
      return NextResponse.json({ 
        error: 'Site ID and webhook URL are required' 
      }, { status: 400 });
    }

    // Validate webhook URL format
    try {
      new URL(webhook_url);
    } catch {
      return NextResponse.json({ 
        error: 'Invalid webhook URL format' 
      }, { status: 400 });
    }

    // Check if site exists
    const { data: site } = await supabase
      .from('wc_sites')
      .select('id, name')
      .eq('id', site_id)
      .single();

    if (!site) {
      return NextResponse.json({ 
        error: 'Site not found' 
      }, { status: 404 });
    }

    // Create webhook endpoint
    const { data: endpoint, error } = await supabase
      .from('webhook_endpoints')
      .insert({
        site_id,
        endpoint_type,
        webhook_url,
        secret_key: secret_key || null,
        enabled,
        events: JSON.stringify(events),
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create webhook endpoint:', error);
      
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ 
          error: 'Webhook endpoint already exists for this site and type' 
        }, { status: 409 });
      }

      return NextResponse.json({ 
        error: 'Failed to create webhook endpoint' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook endpoint created successfully',
      endpoint: {
        ...endpoint,
        site_name: site.name,
        events: JSON.parse(endpoint.events as string || '[]'),
      },
    });

  } catch (error: any) {
    console.error('POST webhook endpoint error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}