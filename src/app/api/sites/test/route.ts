import { type NextRequest, NextResponse } from 'next/server';

// POST: Test WooCommerce connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, apiKey, apiSecret } = body;

    // Validate required fields
    if (!url || !apiKey || !apiSecret) {
      return NextResponse.json({ 
        error: 'Missing required fields' 
      }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ 
        error: 'Invalid URL format' 
      }, { status: 400 });
    }

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const baseUrl = url.replace(/\/$/, '');
    
    // Log the URL being tested (without credentials)
    console.log('Testing WooCommerce connection to:', `${baseUrl}/wp-json/wc/v3/system_status`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const response = await fetch(`${baseUrl}/wp-json/wc/v3/system_status`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'User-Agent': 'WooCommerce-MultiSite-Manager/1.0',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          return NextResponse.json({ 
            success: false,
            error: 'Invalid API credentials' 
          }, { status: 401 });
        }
        if (response.status === 404) {
          return NextResponse.json({ 
            success: false,
            error: 'WooCommerce API not found at this URL' 
          }, { status: 404 });
        }
        return NextResponse.json({ 
          success: false,
          error: `API returned status ${response.status}` 
        }, { status: 400 });
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Try to get the response text to see what was returned
        const text = await response.text();
        const isHTML = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
        
        if (isHTML) {
          return NextResponse.json({ 
            success: false,
            error: 'API returned HTML instead of JSON. This usually means the API endpoint is incorrect or the site requires additional authentication.',
            hint: 'Make sure the URL points to your WooCommerce site root (e.g., https://example.com) without /wp-json or other paths.'
          }, { status: 400 });
        }
        
        return NextResponse.json({ 
          success: false,
          error: 'API returned non-JSON response',
          contentType: contentType,
          preview: text.substring(0, 200)
        }, { status: 400 });
      }
      
      // Get some basic info about the store
      const systemStatus = await response.json();
      
      return NextResponse.json({ 
        success: true,
        message: 'Connection successful',
        storeInfo: {
          version: systemStatus.environment?.version,
          currency: systemStatus.settings?.currency,
          timezone: systemStatus.settings?.timezone_string,
        }
      });

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json({ 
          success: false,
          error: 'Connection timeout - WooCommerce API took too long to respond' 
        }, { status: 408 });
      } else {
        return NextResponse.json({ 
          success: false,
          error: fetchError.message || 'Connection failed' 
        }, { status: 500 });
      }
    }

  } catch (error: any) {
    console.error('Test connection API error:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}