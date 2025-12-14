
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== Delete Player Function Started ===');
    console.log('Request method:', req.method);

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header found');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No authorization header',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    console.log('Authorization header present');

    // Parse request body
    let requestBody;
    try {
      const bodyText = await req.text();
      console.log('Raw request body:', bodyText);
      requestBody = JSON.parse(bodyText);
      console.log('Parsed request body:', requestBody);
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid JSON in request body: ${parseError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const { playerId } = requestBody;

    if (!playerId) {
      console.error('Missing required field: playerId');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Player ID is required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    console.log('Removing player from trainer:', playerId);

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      hasServiceKey: !!supabaseServiceKey,
    });

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required environment variables',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // Create a Supabase client with the user's JWT to verify they're a trainer
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify the user is authenticated and is a trainer
    console.log('Verifying user authentication...');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError) {
      console.error('User authentication error:', userError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unauthorized: ${userError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }
    if (!user) {
      console.error('No user found');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized: No user found',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    console.log('User authenticated:', user.id);

    // Check if user is trainer or admin
    console.log('Checking trainer/admin role...');
    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to check user role: ${roleError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    console.log('Role data:', roleData);

    if (!roleData || (roleData.role !== 'trainer' && roleData.role !== 'admin')) {
      console.error('User is not trainer or admin:', roleData);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Only trainers can remove players from their profile',
          userRole: roleData?.role || 'none',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    console.log('User is trainer/admin, proceeding with player removal');

    // Verify the trainer-player relationship exists
    console.log('Verifying trainer-player relationship...');
    const { data: relationshipData, error: relationshipCheckError } = await supabaseClient
      .from('admin_player_relationships')
      .select('*')
      .eq('admin_id', user.id)
      .eq('player_id', playerId)
      .maybeSingle();

    if (relationshipCheckError) {
      console.error('Relationship check error:', relationshipCheckError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to verify relationship: ${relationshipCheckError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    if (!relationshipData) {
      console.error('No relationship found between trainer and player');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You do not have permission to remove this player',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    console.log('Relationship verified, proceeding with removal');

    // Create a Supabase admin client with service role
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Step 1: Delete task_templates assigned by this trainer to this player
    console.log('Deleting task templates assigned by trainer to player...');
    const { error: deleteTaskTemplatesError } = await supabaseAdmin
      .from('task_templates')
      .delete()
      .eq('user_id', user.id)
      .eq('player_id', playerId);

    if (deleteTaskTemplatesError) {
      console.error('Failed to delete task templates:', deleteTaskTemplatesError);
      // Continue anyway - we want to remove as much as possible
    } else {
      console.log('Task templates deleted successfully');
    }

    // Step 2: Delete exercise assignments from this trainer to this player
    console.log('Deleting exercise assignments from trainer to player...');
    const { error: deleteExerciseAssignmentsError } = await supabaseAdmin
      .from('exercise_assignments')
      .delete()
      .eq('trainer_id', user.id)
      .eq('player_id', playerId);

    if (deleteExerciseAssignmentsError) {
      console.error('Failed to delete exercise assignments:', deleteExerciseAssignmentsError);
      // Continue anyway
    } else {
      console.log('Exercise assignments deleted successfully');
    }

    // Step 3: Delete activities created by trainer for this player
    console.log('Deleting activities created by trainer for player...');
    const { error: deleteActivitiesError } = await supabaseAdmin
      .from('activities')
      .delete()
      .eq('user_id', user.id)
      .eq('player_id', playerId);

    if (deleteActivitiesError) {
      console.error('Failed to delete activities:', deleteActivitiesError);
      // Continue anyway
    } else {
      console.log('Activities deleted successfully');
    }

    // Step 4: Delete activity_categories created by trainer for this player
    console.log('Deleting activity categories created by trainer for player...');
    const { error: deleteCategoriesError } = await supabaseAdmin
      .from('activity_categories')
      .delete()
      .eq('user_id', user.id)
      .eq('player_id', playerId);

    if (deleteCategoriesError) {
      console.error('Failed to delete activity categories:', deleteCategoriesError);
      // Continue anyway
    } else {
      console.log('Activity categories deleted successfully');
    }

    // Step 5: Delete activity_series created by trainer for this player
    console.log('Deleting activity series created by trainer for player...');
    const { error: deleteSeriesError } = await supabaseAdmin
      .from('activity_series')
      .delete()
      .eq('user_id', user.id)
      .eq('player_id', playerId);

    if (deleteSeriesError) {
      console.error('Failed to delete activity series:', deleteSeriesError);
      // Continue anyway
    } else {
      console.log('Activity series deleted successfully');
    }

    // Step 6: Delete external_calendars created by trainer for this player
    console.log('Deleting external calendars created by trainer for player...');
    const { error: deleteCalendarsError } = await supabaseAdmin
      .from('external_calendars')
      .delete()
      .eq('user_id', user.id)
      .eq('player_id', playerId);

    if (deleteCalendarsError) {
      console.error('Failed to delete external calendars:', deleteCalendarsError);
      // Continue anyway
    } else {
      console.log('External calendars deleted successfully');
    }

    // Step 7: Delete events_local_meta created by trainer for this player
    console.log('Deleting events local meta created by trainer for player...');
    const { error: deleteEventsMetaError } = await supabaseAdmin
      .from('events_local_meta')
      .delete()
      .eq('user_id', user.id)
      .eq('player_id', playerId);

    if (deleteEventsMetaError) {
      console.error('Failed to delete events local meta:', deleteEventsMetaError);
      // Continue anyway
    } else {
      console.log('Events local meta deleted successfully');
    }

    // Step 8: Delete weekly_performance created by trainer for this player
    console.log('Deleting weekly performance created by trainer for player...');
    const { error: deletePerformanceError } = await supabaseAdmin
      .from('weekly_performance')
      .delete()
      .eq('user_id', user.id)
      .eq('player_id', playerId);

    if (deletePerformanceError) {
      console.error('Failed to delete weekly performance:', deletePerformanceError);
      // Continue anyway
    } else {
      console.log('Weekly performance deleted successfully');
    }

    // Step 9: Finally, delete the trainer-player relationship
    console.log('Deleting trainer-player relationship...');
    const { error: deleteRelError } = await supabaseAdmin
      .from('admin_player_relationships')
      .delete()
      .eq('admin_id', user.id)
      .eq('player_id', playerId);

    if (deleteRelError) {
      console.error('Failed to delete relationship:', deleteRelError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to delete relationship: ${deleteRelError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    console.log('Relationship deleted successfully');
    console.log('=== Player Removal Completed Successfully ===');
    console.log('Note: Player account and self-created content remain intact');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Player removed from your profile successfully',
        playerAccountRetained: true,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('=== Error in delete-player function ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred',
        errorType: error.constructor.name,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
