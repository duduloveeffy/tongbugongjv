import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET: Fetch webhook events with pagination and filtering
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const siteId = searchParams.get('site_id');
    const eventType = searchParams.get('event_type');
    const status = searchParams.get('status');
    const daysBack = parseInt(searchParams.get('days_back') || '7');

    // Build query
    let query = supabase
      .from('webhook_events')
      .select(`
        *,
        wc_sites(name, url)
      `);

    // Apply filters
    if (siteId) {
      query = query.eq('site_id', siteId);
    }

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    if (status) {
      query = query.eq('status', status);
    }

    // Filter by date range
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - daysBack);
    query = query.gte('received_at', dateThreshold.toISOString());

    // Apply pagination and ordering
    query = query
      .order('received_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: events, error, count } = await query;

    if (error) {
      console.error('Failed to fetch webhook events:', error);
      // If webhook_events table doesn't exist yet, return empty results
      if (error.code === '42P01') { // relation does not exist
        return NextResponse.json({
          success: true,
          events: [],
          pagination: { limit, offset, total: 0, hasMore: false },
          summary: { total: 0, successful: 0, failed: 0, partial: 0, byEventType: {} },
          filters: { site_id: siteId, event_type: eventType, status, days_back: daysBack },
        });
      }
      
      return NextResponse.json({ 
        error: 'Failed to fetch webhook events',
        details: error.message 
      }, { status: 500 });
    }


    // Format the data to match the WebhookManager interface
    const formattedEvents = events?.map(event => ({
      id: event.id,
      site_id: event.site_id,
      site_name: event.wc_sites?.name || 'Unknown Site',
      event_type: event.event_type,
      object_id: event.object_id,
      object_type: event.object_type,
      processing_time_ms: event.processing_time_ms,
      status: event.status,
      error_message: event.error_message,
      received_at: event.received_at,
      metadata: event.metadata,
    })) || [];

    // Get summary statistics
    const { data: stats } = await supabase
      .from('webhook_events')
      .select('status, event_type')
      .gte('received_at', dateThreshold.toISOString());

    const summary = {
      total: stats?.length || 0,
      successful: stats?.filter(s => s.status === 'success').length || 0,
      failed: stats?.filter(s => s.status === 'error').length || 0,
      partial: stats?.filter(s => s.status === 'partial').length || 0,
      byEventType: {} as Record<string, number>,
    };

    // Group by event type
    stats?.forEach(stat => {
      summary.byEventType[stat.event_type] = (summary.byEventType[stat.event_type] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      events: formattedEvents,
      pagination: {
        limit,
        offset,
        total: count || formattedEvents.length,
        hasMore: formattedEvents.length === limit,
      },
      summary,
      filters: {
        site_id: siteId,
        event_type: eventType,
        status,
        days_back: daysBack,
      },
    });

  } catch (error: any) {
    console.error('GET webhook events error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// DELETE: Clean up old webhook events
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const daysToKeep = parseInt(searchParams.get('days_to_keep') || '30');

    if (daysToKeep < 1 || daysToKeep > 365) {
      return NextResponse.json({ 
        error: 'days_to_keep must be between 1 and 365' 
      }, { status: 400 });
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // Delete old events
    const { data, error } = await supabase
      .from('webhook_events')
      .delete()
      .lt('received_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      console.error('Failed to cleanup webhook events:', error);
      return NextResponse.json({ 
        error: 'Failed to cleanup webhook events' 
      }, { status: 500 });
    }

    const deletedCount = data?.length || 0;

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${deletedCount} old webhook events`,
      deleted_count: deletedCount,
      cutoff_date: cutoffDate.toISOString(),
    });

  } catch (error: any) {
    console.error('DELETE webhook events error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}