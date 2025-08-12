import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// POST: Test webhook endpoint connectivity
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const params = await props.params;
    const { id } = params;

    // Validate webhook ID
    if (!id) {
      return NextResponse.json({ error: 'Webhook ID is required' }, { status: 400 });
    }

    // Get webhook endpoint details
    const { data: webhook, error: webhookError } = await supabase
      .from('webhook_endpoints')
      .select(`
        *,
        wc_sites!inner(name, url)
      `)
      .eq('id', id)
      .single();

    if (webhookError || !webhook) {
      return NextResponse.json({ error: 'Webhook endpoint not found' }, { status: 404 });
    }

    if (!webhook.enabled) {
      return NextResponse.json({ error: 'Webhook endpoint is disabled' }, { status: 400 });
    }

    const testStartTime = Date.now();
    let testResult: {
      success: boolean;
      status?: number;
      error?: string;
      response?: any;
      execution_time: number;
    };

    try {
      // Create test payload
      const testPayload = {
        event: 'test.webhook',
        timestamp: Math.floor(Date.now() / 1000),
        site_url: webhook.wc_sites?.url,
        test_data: {
          webhook_id: id,
          site_name: webhook.wc_sites?.name,
          endpoint_url: webhook.webhook_url,
          test_timestamp: new Date().toISOString(),
        }
      };

      // Prepare headers
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'User-Agent': 'WooCommerce-Realtime-Sync/1.0',
        'X-WC-Source': webhook.wc_sites?.url || 'unknown',
        'X-WC-Event': 'test.webhook',
      };

      // Add signature if secret key is configured
      if (webhook.secret_key) {
        const payload = JSON.stringify(testPayload);
        const crypto = await import('crypto');
        const signature = 'sha256=' + crypto
          .createHmac('sha256', webhook.secret_key)
          .update(payload)
          .digest('hex');
        headers['X-WC-Signature'] = signature;
      }

      // Send test request
      const response = await fetch(webhook.webhook_url, {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      const execution_time = (Date.now() - testStartTime) / 1000;

      if (response.ok) {
        let responseData: any;
        const contentType = response.headers.get('content-type');
        
        try {
          if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
          } else {
            responseData = await response.text();
          }
        } catch {
          responseData = 'Response received but could not parse';
        }

        testResult = {
          success: true,
          status: response.status,
          response: responseData,
          execution_time,
        };
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        testResult = {
          success: false,
          status: response.status,
          error: `HTTP ${response.status}: ${errorText}`,
          execution_time,
        };
      }

    } catch (error: any) {
      const execution_time = (Date.now() - testStartTime) / 1000;
      
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        testResult = {
          success: false,
          error: 'Request timeout (10 seconds)',
          execution_time,
        };
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        testResult = {
          success: false,
          error: 'Connection failed - check URL and network connectivity',
          execution_time,
        };
      } else {
        testResult = {
          success: false,
          error: `Network error: ${error.message}`,
          execution_time,
        };
      }
    }

    // Update webhook test status
    const testStatus = testResult.success ? 'success' : 'failed';
    const testResponse = testResult.success 
      ? (typeof testResult.response === 'string' ? testResult.response : JSON.stringify(testResult.response))
      : testResult.error;

    await supabase
      .from('webhook_endpoints')
      .update({
        last_test_at: new Date().toISOString(),
        last_test_status: testStatus,
        last_test_response: testResponse,
      })
      .eq('id', id);

    // Log test event
    await supabase
      .from('webhook_events')
      .insert({
        site_id: webhook.site_id,
        event_type: 'test.webhook',
        object_id: null,
        object_type: 'test',
        processing_time_ms: Math.round(testResult.execution_time * 1000),
        status: testStatus,
        error_message: testResult.success ? null : testResult.error,
        received_at: new Date().toISOString(),
        metadata: {
          webhook_id: id,
          webhook_url: webhook.webhook_url,
          test_response: testResult.response,
          http_status: testResult.status,
        },
      });

    if (testResult.success) {
      return NextResponse.json({
        success: true,
        message: 'Webhook test successful',
        execution_time: testResult.execution_time,
        status: testResult.status,
        response: testResult.response,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: testResult.error,
        execution_time: testResult.execution_time,
        status: testResult.status,
      }, { status: 200 }); // Still return 200 since the test API call itself succeeded
    }

  } catch (error: any) {
    console.error('Webhook test error:', error);
    return NextResponse.json({ 
      error: 'Internal server error during webhook test',
      execution_time: 0,
    }, { status: 500 });
  }
}