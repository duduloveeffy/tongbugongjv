import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { withAuth, logAuditEvent } from '@/lib/auth/middleware';
import type { User } from '@/lib/auth/types';
import { Permissions, ProtectionLevel } from '@/lib/auth/types';

// GET: Fetch all sites (protected - requires authentication)
export const GET = withAuth(
  async (request: NextRequest, user: User) => {
    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return NextResponse.json({
          error: 'Database not configured',
          sites: []
        }, { status: 503 });
      }

      // Log the access
      await logAuditEvent(user.id, 'VIEW_SITES', 'wc_sites', {
        ip_address: request.headers.get('x-forwarded-for'),
        user_agent: request.headers.get('user-agent'),
      });

      // Use the safe view that doesn't expose API keys
      const { data: sites, error } = await supabase
        .from('wc_sites_safe')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch sites:', error);
        return NextResponse.json({
          error: 'Failed to fetch sites',
          details: error.message
        }, { status: 500 });
      }

      // If user is admin or manager, include sync status
      if (user.role === 'admin' || user.role === 'manager') {
        // Get additional sync information
        const { data: syncData } = await supabase
          .from('sync_checkpoints')
          .select('site_id, last_sync_at')
          .in('site_id', sites?.map(s => s.id) || []);

        // Merge sync data with sites
        const sitesWithSync = sites?.map(site => ({
          ...site,
          last_sync_at: syncData?.find(s => s.site_id === site.id)?.last_sync_at || null
        }));

        return NextResponse.json({
          success: true,
          sites: sitesWithSync || [],
          user: {
            email: user.email,
            role: user.role
          }
        });
      }

      return NextResponse.json({
        success: true,
        sites: sites || [],
        user: {
          email: user.email,
          role: user.role
        }
      });

    } catch (error: any) {
      console.error('Sites API error:', error);
      return NextResponse.json({
        error: error.message || 'Internal server error'
      }, { status: 500 });
    }
  },
  ProtectionLevel.AUTHENTICATED // Requires authentication
);

// POST: Create a new site (protected - requires manager or admin role)
export const POST = withAuth(
  async (request: NextRequest, user: User) => {
    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return NextResponse.json({
          error: 'Database not configured'
        }, { status: 503 });
      }

      const body = await request.json();
      const { name, url, api_key, api_secret } = body;

      if (!name || !url || !api_key || !api_secret) {
        return NextResponse.json({
          error: 'Missing required fields'
        }, { status: 400 });
      }

      // Encrypt API credentials before storing
      const { encrypt_text } = await import('@/lib/crypto');

      // Store encrypted API keys separately
      const { data: apiKey, error: apiKeyError } = await supabase
        .from('api_keys')
        .insert({
          encrypted_key: await encrypt_text(api_key),
          encrypted_secret: await encrypt_text(api_secret),
          created_by: user.id
        })
        .select()
        .single();

      if (apiKeyError) {
        console.error('Failed to store API keys:', apiKeyError);
        return NextResponse.json({
          error: 'Failed to store API credentials'
        }, { status: 500 });
      }

      // Create the site
      const { data: site, error: siteError } = await supabase
        .from('wc_sites')
        .insert({
          name,
          url,
          api_key_id: apiKey.id,
          enabled: true,
          created_by: user.id,
          updated_by: user.id
        })
        .select()
        .single();

      if (siteError) {
        // Rollback API key creation if site creation fails
        await supabase.from('api_keys').delete().eq('id', apiKey.id);

        console.error('Failed to create site:', siteError);
        return NextResponse.json({
          error: 'Failed to create site',
          details: siteError.message
        }, { status: 500 });
      }

      // Log the creation
      await logAuditEvent(user.id, 'CREATE_SITE', 'wc_sites', {
        site_id: site.id,
        site_name: name,
        site_url: url,
        ip_address: request.headers.get('x-forwarded-for'),
        user_agent: request.headers.get('user-agent'),
      });

      // Return safe site data (without API keys)
      return NextResponse.json({
        success: true,
        site: {
          id: site.id,
          name: site.name,
          url: site.url,
          enabled: site.enabled,
          created_at: site.created_at
        }
      });

    } catch (error: any) {
      console.error('Create site error:', error);
      return NextResponse.json({
        error: error.message || 'Internal server error'
      }, { status: 500 });
    }
  },
  ProtectionLevel.AUTHORIZED,
  [Permissions.SITE_CREATE] // Requires specific permission
);

// PUT: Update a site (protected - requires manager or admin role)
export const PUT = withAuth(
  async (request: NextRequest, user: User) => {
    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return NextResponse.json({
          error: 'Database not configured'
        }, { status: 503 });
      }

      const body = await request.json();
      const { id, name, url, enabled } = body;

      if (!id) {
        return NextResponse.json({
          error: 'Site ID is required'
        }, { status: 400 });
      }

      // Update the site
      const { data: site, error } = await supabase
        .from('wc_sites')
        .update({
          name,
          url,
          enabled,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        })
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

      // Log the update
      await logAuditEvent(user.id, 'UPDATE_SITE', 'wc_sites', {
        site_id: id,
        changes: { name, url, enabled },
        ip_address: request.headers.get('x-forwarded-for'),
        user_agent: request.headers.get('user-agent'),
      });

      return NextResponse.json({
        success: true,
        site: {
          id: site.id,
          name: site.name,
          url: site.url,
          enabled: site.enabled,
          updated_at: site.updated_at
        }
      });

    } catch (error: any) {
      console.error('Update site error:', error);
      return NextResponse.json({
        error: error.message || 'Internal server error'
      }, { status: 500 });
    }
  },
  ProtectionLevel.AUTHORIZED,
  [Permissions.SITE_UPDATE]
);

// DELETE: Delete a site (protected - admin only)
export const DELETE = withAuth(
  async (request: NextRequest, user: User) => {
    try {
      if (user.role !== 'admin') {
        return NextResponse.json({
          error: 'Only administrators can delete sites'
        }, { status: 403 });
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        return NextResponse.json({
          error: 'Database not configured'
        }, { status: 503 });
      }

      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');

      if (!id) {
        return NextResponse.json({
          error: 'Site ID is required'
        }, { status: 400 });
      }

      // Get site details before deletion
      const { data: site } = await supabase
        .from('wc_sites')
        .select('name, url')
        .eq('id', id)
        .single();

      // Delete the site (cascades to API keys)
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

      // Log the deletion
      await logAuditEvent(user.id, 'DELETE_SITE', 'wc_sites', {
        site_id: id,
        site_name: site?.name,
        site_url: site?.url,
        ip_address: request.headers.get('x-forwarded-for'),
        user_agent: request.headers.get('user-agent'),
      });

      return NextResponse.json({
        success: true,
        message: 'Site deleted successfully'
      });

    } catch (error: any) {
      console.error('Delete site error:', error);
      return NextResponse.json({
        error: error.message || 'Internal server error'
      }, { status: 500 });
    }
  },
  ProtectionLevel.AUTHORIZED,
  [Permissions.SITE_DELETE]
);