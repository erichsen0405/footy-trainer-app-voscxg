
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('Auto-sync triggered for user:', user.id);

    // Find all calendars that need syncing
    const now = new Date();
    const { data: calendars, error: calendarsError } = await supabaseClient
      .from('external_calendars')
      .select('*')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .eq('auto_sync_enabled', true);

    if (calendarsError) {
      console.error('Error fetching calendars:', calendarsError);
      throw calendarsError;
    }

    if (!calendars || calendars.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No calendars to sync',
          syncedCount: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log(`Found ${calendars.length} calendars to check`);

    // Filter calendars that need syncing based on their sync interval
    const calendarsToSync = calendars.filter((calendar) => {
      if (!calendar.last_fetched) {
        return true; // Never synced before
      }

      const lastFetched = new Date(calendar.last_fetched);
      const syncIntervalMs = (calendar.sync_interval_minutes || 60) * 60 * 1000;
      const timeSinceLastSync = now.getTime() - lastFetched.getTime();

      return timeSinceLastSync >= syncIntervalMs;
    });

    console.log(`${calendarsToSync.length} calendars need syncing`);

    // Sync each calendar by calling the sync-external-calendar function
    const syncResults = await Promise.allSettled(
      calendarsToSync.map(async (calendar) => {
        console.log(`Syncing calendar: ${calendar.name}`);
        
        try {
          const response = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-external-calendar`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ calendarId: calendar.id }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Sync failed');
          }

          const result = await response.json();
          console.log(`Successfully synced ${calendar.name}: ${result.eventCount} events`);
          
          return {
            calendarId: calendar.id,
            calendarName: calendar.name,
            success: true,
            eventCount: result.eventCount,
          };
        } catch (error: any) {
          console.error(`Error syncing ${calendar.name}:`, error);
          return {
            calendarId: calendar.id,
            calendarName: calendar.name,
            success: false,
            error: error.message,
          };
        }
      })
    );

    // Count successful syncs
    const successfulSyncs = syncResults.filter(
      (result) => result.status === 'fulfilled' && result.value.success
    ).length;

    const failedSyncs = syncResults.filter(
      (result) => result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)
    );

    console.log(`Auto-sync complete: ${successfulSyncs} successful, ${failedSyncs.length} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-sync complete: ${successfulSyncs} calendars synced`,
        syncedCount: successfulSyncs,
        failedCount: failedSyncs.length,
        results: syncResults.map((result) => 
          result.status === 'fulfilled' ? result.value : { error: 'Failed' }
        ),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in auto-sync-calendars:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
