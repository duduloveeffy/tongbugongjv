import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET: Fetch all sites
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured',
        sites: [] 
      }, { status: 200 });
    }

    // SECURITY: Never expose API keys - use safe view or select specific fields
    const { data: sites, error } = await supabase
      .from('wc_sites')
      .select('id, name, url, enabled, created_at, updated_at, last_sync_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch sites:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch sites',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      sites: sites || [] 
    });

  } catch (error: any) {
    console.error('Sites API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// POST: Create a new site
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    const { name, url, apiKey, apiSecret } = body;

    // Validate required fields
    if (!name || !url || !apiKey || !apiSecret) {
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

    // Test WooCommerce connection
    const testResult = await testWooCommerceConnection(url, apiKey, apiSecret);
    if (!testResult.success) {
      return NextResponse.json({ 
        error: 'Failed to connect to WooCommerce',
        details: testResult.error 
      }, { status: 400 });
    }

    // SECURITY WARNING: API keys should be encrypted before storage
    // This is a temporary implementation - use the protected endpoint instead
    console.warn('⚠️ WARNING: Using unprotected API endpoint. API keys will be stored in plain text!');

    // Insert site into database
    const { data: site, error } = await supabase
      .from('wc_sites')
      .insert({
        name,
        url: url.replace(/\/$/, ''), // Remove trailing slash
        api_key: apiKey,  // TODO: Encrypt before storing
        api_secret: apiSecret,  // TODO: Encrypt before storing
        enabled: true,
      })
      .select('id, name, url, enabled, created_at')  // Don't return API keys
      .single();

    if (error) {
      // Check for duplicate name
      if (error.code === '23505') {
        return NextResponse.json({ 
          error: 'Site name already exists' 
        }, { status: 409 });
      }
      
      console.error('Failed to create site:', error);
      return NextResponse.json({ 
        error: 'Failed to create site',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      site 
    }, { status: 201 });

  } catch (error: any) {
    console.error('Create site API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// PUT: Update a site
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const body = await request.json();
    // 支持两种命名格式：驼峰命名和下划线命名
    const { 
      id, 
      name, 
      url, 
      apiKey, 
      apiSecret, 
      api_key,  // 也接受下划线格式
      api_secret, // 也接受下划线格式
      enabled, 
      skipConnectionTest = false 
    } = body;
    
    // 使用提供的值，优先使用下划线格式（前端实际发送的格式）
    const finalApiKey = api_key !== undefined ? api_key : apiKey;
    const finalApiSecret = api_secret !== undefined ? api_secret : apiSecret;
    
    // 调试日志
    console.log('Update site request received:', {
      id,
      name,
      url,
      hasApiKey: !!finalApiKey,
      hasApiSecret: !!finalApiSecret,
      enabled,
      skipConnectionTest
    });

    if (!id) {
      return NextResponse.json({ 
        error: 'Site ID is required' 
      }, { status: 400 });
    }

    // Build update object
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url.replace(/\/$/, '');
    if (finalApiKey !== undefined) updateData.api_key = finalApiKey;
    if (finalApiSecret !== undefined) updateData.api_secret = finalApiSecret;
    if (enabled !== undefined) updateData.enabled = enabled;

    // If API credentials changed, test connection (unless explicitly skipped)
    if (!skipConnectionTest && (url || finalApiKey || finalApiSecret)) {
      // Get current site data to fill in missing fields
      const { data: currentSite } = await supabase
        .from('wc_sites')
        .select('url, api_key, api_secret')
        .eq('id', id)
        .single();

      if (currentSite) {
        const testUrl = url || currentSite.url;
        const testKey = finalApiKey || currentSite.api_key;
        const testSecret = finalApiSecret || currentSite.api_secret;
        
        console.log('Testing WooCommerce connection during update...');
        const testResult = await testWooCommerceConnection(testUrl, testKey, testSecret);
        if (!testResult.success) {
          console.error('Connection test failed during update:', testResult.error);
          return NextResponse.json({ 
            error: 'Failed to connect to WooCommerce',
            details: testResult.error,
            hint: 'The connection test failed. If you are sure the credentials are correct, you may need to check the WooCommerce API settings or try again later.'
          }, { status: 400 });
        }
        console.log('Connection test passed during update');
      }
    }

    // Update site
    const { data: site, error } = await supabase
      .from('wc_sites')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update site:', error);
      return NextResponse.json({ 
        error: 'Failed to update site',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      site 
    });

  } catch (error: any) {
    console.error('Update site API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// DELETE: Delete a site
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Supabase not configured' 
      }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ 
        error: 'Site ID is required' 
      }, { status: 400 });
    }

    // Delete site (will cascade delete related records)
    const { error } = await supabase
      .from('wc_sites')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete site:', error);
      return NextResponse.json({ 
        error: 'Failed to delete site',
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true 
    });

  } catch (error: any) {
    console.error('Delete site API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// Helper function to test WooCommerce connection
async function testWooCommerceConnection(
  siteUrl: string, 
  consumerKey: string, 
  consumerSecret: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = siteUrl.replace(/\/$/, '');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(`${baseUrl}/wp-json/wc/v3/system_status`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid API credentials' };
      }
      if (response.status === 404) {
        return { success: false, error: 'WooCommerce API not found at this URL' };
      }
      return { success: false, error: `API returned status ${response.status}` };
    }

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Try to get response text to check if it's HTML
      const text = await response.text();
      const isHTML = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
      
      if (isHTML) {
        console.error('WooCommerce API returned HTML instead of JSON. URL may be incorrect.');
        return { 
          success: false, 
          error: 'API returned HTML instead of JSON. Please check the URL format.' 
        };
      }
      
      return { 
        success: false, 
        error: 'API returned non-JSON response' 
      };
    }

    return { success: true };

  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Connection timeout' };
    }
    return { success: false, error: error.message || 'Connection failed' };
  }
}