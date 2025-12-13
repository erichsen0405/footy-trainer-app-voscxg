
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
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header found');
      throw new Error('No authorization header');
    }

    console.log('Authorization header present');

    // Parse request body first to see if that's the issue
    let requestBody;
    try {
      const bodyText = await req.text();
      console.log('Raw request body:', bodyText);
      requestBody = JSON.parse(bodyText);
      console.log('Parsed request body:', requestBody);
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      throw new Error(`Invalid JSON in request body: ${parseError.message}`);
    }

    const { email, fullName, phoneNumber } = requestBody;

    if (!email || !fullName) {
      console.error('Missing required fields:', { email: !!email, fullName: !!fullName });
      throw new Error('Email and full name are required');
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
      throw new Error('Missing required environment variables');
    }

    // Create a Supabase client with the user's JWT
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
      throw new Error(`Unauthorized: ${userError.message}`);
    }
    if (!user) {
      console.error('No user found');
      throw new Error('Unauthorized: No user found');
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
      throw new Error(`Failed to check user role: ${roleError.message}`);
    }

    if (!roleData || roleData.role !== 'admin') {
      console.error('User is not admin:', roleData);
      throw new Error('Only admins can create player accounts');
    }

    console.log('User is admin, proceeding with player creation');

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
      throw new Error(`Failed to create user account: ${signUpError.message}`);
    }

    if (!signUpData.user) {
      console.error('No user data returned from signup');
      throw new Error('No user data returned from signup');
    }

    const playerId = signUpData.user.id;
    console.log('Player account created:', playerId);

    // Create profile for the player using admin client
    console.log('Creating profile...');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: playerId,
        full_name: fullName,
        phone_number: phoneNumber || null,
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Don't throw - we can continue without profile
      console.log('Continuing despite profile error...');
    } else {
      console.log('Profile created successfully');
    }

    // Set user role as player using admin client
    console.log('Assigning player role...');
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: playerId,
        role: 'player',
      });

    if (roleInsertError) {
      console.error('Role assignment error:', roleInsertError);
      throw new Error(`Failed to assign player role: ${roleInsertError.message}`);
    }

    console.log('Player role assigned successfully');

    // Create admin-player relationship using admin client
    console.log('Creating admin-player relationship...');
    const { error: relationshipError } = await supabaseAdmin
      .from('admin_player_relationships')
      .insert({
        admin_id: user.id,
        player_id: playerId,
      });

    if (relationshipError) {
      console.error('Relationship creation error:', relationshipError);
      throw new Error(`Failed to create admin-player relationship: ${relationshipError.message}`);
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
      // Don't throw - the account is created, they can request reset later
      console.log('Continuing despite email error...');
    } else {
      console.log('Password reset email sent successfully');
      console.log('Reset link generated:', linkData);
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
        status: 400,
      }
    );
  }
});
