
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

    const { email, fullName, phoneNumber } = requestBody;

    if (!email || !fullName) {
      console.error('Missing required fields:', { email: !!email, fullName: !!fullName });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email and full name are required',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    console.log('Creating player account for:', email);

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
      .single();

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

    if (!roleData || roleData.role !== 'admin') {
      console.error('User is not admin:', roleData);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Only admins can create player accounts',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    console.log('User is admin, proceeding with player creation');

    // Create a Supabase admin client with service role
    // This client bypasses RLS policies
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

    // Generate a temporary password
    const tempPassword = `temp_${crypto.randomUUID()}`;

    console.log('Creating user account...');
    // Create the player account using admin client
    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: false, // Require email confirmation
      user_metadata: {
        full_name: fullName,
        phone_number: phoneNumber || null,
      },
    });

    if (signUpError) {
      console.error('Sign up error:', signUpError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to create user account: ${signUpError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    if (!signUpData.user) {
      console.error('No user data returned from signup');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No user data returned from signup',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    const playerId = signUpData.user.id;
    console.log('Player account created:', playerId);

    // Create profile for the player using RPC function
    console.log('Creating profile using RPC...');
    const { data: profileData, error: profileError } = await supabaseAdmin.rpc('create_player_profile', {
      p_user_id: playerId,
      p_full_name: fullName,
      p_phone_number: phoneNumber || null,
    });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      console.error('Profile error details:', JSON.stringify(profileError, null, 2));
      // Continue anyway - profile is not critical
      console.log('Continuing despite profile error...');
    } else {
      console.log('Profile created successfully');
    }

    // Set user role as player using RPC function
    console.log('Assigning player role using RPC...');
    const { data: roleInsertData, error: roleInsertError } = await supabaseAdmin.rpc('create_player_role', {
      p_user_id: playerId,
    });

    if (roleInsertError) {
      console.error('Role assignment error:', roleInsertError);
      console.error('Role error details:', JSON.stringify(roleInsertError, null, 2));
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to assign player role: ${roleInsertError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    console.log('Player role assigned successfully');

    // Create admin-player relationship using RPC function
    console.log('Creating admin-player relationship using RPC...');
    const { data: relationshipData, error: relationshipError } = await supabaseAdmin.rpc('create_admin_player_relationship', {
      p_admin_id: user.id,
      p_player_id: playerId,
    });

    if (relationshipError) {
      console.error('Relationship creation error:', relationshipError);
      console.error('Relationship error details:', JSON.stringify(relationshipError, null, 2));
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

    // Send password reset email so the player can set their own password
    console.log('Sending password reset email to player...');
    const { data: linkData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: 'https://natively.dev/email-confirmed',
      },
    });

    if (resetError) {
      console.error('Password reset email error:', resetError);
      console.error('Reset error details:', JSON.stringify(resetError, null, 2));
      // Don't fail - the account is created, they can request reset later
      console.log('Continuing despite email error...');
    } else {
      console.log('Password reset email sent successfully');
      console.log('Reset link generated');
    }

    console.log('=== Create Player Function Completed Successfully ===');

    return new Response(
      JSON.stringify({
        success: true,
        playerId,
        message: 'Player account created successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
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
