import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET: Verify webhook endpoint (for plugin setup)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const challenge = searchParams.get('challenge');
  const siteUrl = searchParams.get('site_url');

  if (challenge) {
    // Return challenge for webhook verification
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({
    service: 'WooCommerce Realtime Sync Webhook',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      orders: '/api/webhook/orders',
      products: '/api/webhook/products', 
      batch: '/api/webhook/batch',
    },
    site_url: siteUrl || 'unknown',
  });
}

// POST: Test webhook connectivity
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const body = await request.json();
    const { site_url, test_data } = body;

    // Log test webhook
    console.log('Test webhook received from:', site_url);

    // Find site if URL is provided
    let siteInfo = null;
    if (site_url) {
      const { data: site } = await supabase
        .from('wc_sites')
        .select('id, name, enabled')
        .eq('url', site_url)
        .single();

      siteInfo = site;
    }

    // Log the test event
    if (siteInfo) {
      await supabase
        .from('webhook_events')
        .insert({
          site_id: siteInfo.id,
          event_type: 'test.webhook',
          object_id: null,
          object_type: 'test',
          processing_time_ms: 1,
          status: 'success',
          received_at: new Date().toISOString(),
          metadata: {
            test_data: test_data,
            user_agent: request.headers.get('user-agent'),
          },
        });
    }

    return NextResponse.json({
      success: true,
      message: 'Test webhook received successfully',
      timestamp: new Date().toISOString(),
      site: siteInfo ? {
        id: siteInfo.id,
        name: siteInfo.name,
        enabled: siteInfo.enabled,
      } : null,
      received_data: {
        site_url,
        test_data,
        headers: {
          'user-agent': request.headers.get('user-agent'),
          'content-type': request.headers.get('content-type'),
          'x-wc-source': request.headers.get('x-wc-source'),
        },
      },
    });

  } catch (error: any) {
    console.error('Test webhook error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}