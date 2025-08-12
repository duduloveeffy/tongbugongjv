import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// PUT: Update webhook endpoint
export async function PUT(
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
    const body = await request.json();

    // Validate webhook ID
    if (!id) {
      return NextResponse.json({ error: 'Webhook ID is required' }, { status: 400 });
    }

    // Check if webhook exists
    const { data: existingWebhook } = await supabase
      .from('webhook_endpoints')
      .select('id')
      .eq('id', id)
      .single();

    if (!existingWebhook) {
      return NextResponse.json({ error: 'Webhook endpoint not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {};

    if (body.webhook_url !== undefined) {
      // Validate webhook URL format
      try {
        new URL(body.webhook_url);
        updateData.webhook_url = body.webhook_url;
      } catch {
        return NextResponse.json({ 
          error: 'Invalid webhook URL format' 
        }, { status: 400 });
      }
    }

    if (body.secret_key !== undefined) {
      updateData.secret_key = body.secret_key || null;
    }

    if (body.enabled !== undefined) {
      updateData.enabled = Boolean(body.enabled);
    }

    if (body.events !== undefined) {
      updateData.events = JSON.stringify(body.events);
    }

    if (body.endpoint_type !== undefined) {
      updateData.endpoint_type = body.endpoint_type;
    }

    // Update webhook endpoint
    const { data: webhook, error } = await supabase
      .from('webhook_endpoints')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        wc_sites!inner(name)
      `)
      .single();

    if (error) {
      console.error('Failed to update webhook endpoint:', error);
      return NextResponse.json({ 
        error: 'Failed to update webhook endpoint' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook endpoint updated successfully',
      endpoint: {
        ...webhook,
        site_name: webhook.wc_sites?.name,
        events: JSON.parse(webhook.events as string || '[]'),
      },
    });

  } catch (error: any) {
    console.error('PUT webhook endpoint error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// DELETE: Remove webhook endpoint
export async function DELETE(
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

    // Check if webhook exists
    const { data: existingWebhook } = await supabase
      .from('webhook_endpoints')
      .select('id, webhook_url')
      .eq('id', id)
      .single();

    if (!existingWebhook) {
      return NextResponse.json({ error: 'Webhook endpoint not found' }, { status: 404 });
    }

    // Delete webhook endpoint (this will cascade delete related events)
    const { error } = await supabase
      .from('webhook_endpoints')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete webhook endpoint:', error);
      return NextResponse.json({ 
        error: 'Failed to delete webhook endpoint' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook endpoint deleted successfully',
    });

  } catch (error: any) {
    console.error('DELETE webhook endpoint error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}