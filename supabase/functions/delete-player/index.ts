
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

    console.log('Deleting player:', playerId);

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

    // Create a Supabase client with the user's JWT to verify they're an admin
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify the user is authenticated and is an admin
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

    // Check if user is admin
    console.log('Checking admin role...');
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

    if (!roleData || roleData.role !== 'admin') {
      console.error('User is not admin:', roleData);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Only admins can delete player accounts',
          userRole: roleData?.role || 'none',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    console.log('User is admin, proceeding with player deletion');

    // Verify the admin-player relationship exists
    console.log('Verifying admin-player relationship...');
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
      console.error('No relationship found between admin and player');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You do not have permission to delete this player',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    console.log('Relationship verified, proceeding with deletion');

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

    // Delete the admin-player relationship first
    console.log('Deleting admin-player relationship...');
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

    // Check if this player has any other admin relationships
    console.log('Checking for other admin relationships...');
    const { data: otherRelationships, error: otherRelError } = await supabaseAdmin
      .from('admin_player_relationships')
      .select('id')
      .eq('player_id', playerId);

    if (otherRelError) {
      console.error('Failed to check other relationships:', otherRelError);
      // Continue anyway - we've already deleted the relationship
    }

    // If no other relationships exist, delete the player completely
    if (!otherRelationships || otherRelationships.length === 0) {
      console.log('No other relationships found, deleting player completely...');

      // Delete user from Supabase Auth
      console.log('Deleting user from auth.users...');
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(playerId);

      if (deleteUserError) {
        console.error('Failed to delete user from auth:', deleteUserError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to delete user: ${deleteUserError.message}`,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }

      console.log('User deleted from auth successfully');
      console.log('Note: Profile and user_roles will be cascade deleted automatically');
    } else {
      console.log(`Player has ${otherRelationships.length} other admin relationship(s), keeping account active`);
    }

    console.log('=== Delete Player Function Completed Successfully ===');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Player deleted successfully',
        fullyDeleted: !otherRelationships || otherRelationships.length === 0,
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
