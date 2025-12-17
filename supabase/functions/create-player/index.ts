
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
    console.log('=== Create Player Function Started ===');
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

    const { action, email, playerId } = requestBody;

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
          error: 'Only admins can manage players',
          userRole: roleData?.role || 'none',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    console.log('User is admin, proceeding with action:', action);

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

    // Handle different actions
    if (action === 'search') {
      // Search for user by email
      if (!email) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Email is required for search',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        );
      }

      console.log('Searching for user with email:', email);

      // Search in auth.users
      const { data: users, error: searchError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (searchError) {
        console.error('Search error:', searchError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to search for user: ${searchError.message}`,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }

      // Find user with matching email
      const foundUser = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

      if (!foundUser) {
        console.log('No user found with email:', email);
        return new Response(
          JSON.stringify({
            success: true,
            user: null,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }

      console.log('User found:', foundUser.id);

      // Get user profile for full name
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('user_id', foundUser.id)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          success: true,
          user: {
            id: foundUser.id,
            email: foundUser.email,
            full_name: profile?.full_name || foundUser.user_metadata?.full_name || null,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );

    } else if (action === 'add') {
      // Add existing user as player
      if (!playerId) {
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

      console.log('Adding player:', playerId);

      // Check if relationship already exists
      const { data: existingRelationship } = await supabaseAdmin
        .from('admin_player_relationships')
        .select('id')
        .eq('admin_id', user.id)
        .eq('player_id', playerId)
        .maybeSingle();

      if (existingRelationship) {
        console.log('Relationship already exists');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'This player is already linked to your profile',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        );
      }

      // Create admin-player relationship using RPC function
      console.log('Creating admin-player relationship using RPC...');
      const { data: relationshipData, error: relationshipError } = await supabaseAdmin.rpc('create_admin_player_relationship', {
        p_admin_id: user.id,
        p_player_id: playerId,
      });

      if (relationshipError) {
        console.error('Relationship creation error:', relationshipError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create admin-player relationship: ${relationshipError.message}`,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }

      console.log('Admin-player relationship created successfully');

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Player added successfully',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );

    } else {
      // Invalid action
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid action: ${action}. Expected 'search' or 'add'`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

  } catch (error) {
    console.error('=== Error in create-player function ===');
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
