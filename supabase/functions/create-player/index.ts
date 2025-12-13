
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

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
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create a Supabase client with the user's JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify the user is authenticated and is an admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData || roleData.role !== 'admin') {
      throw new Error('Only admins can create player accounts');
    }

    // Parse request body
    const { email, fullName, phoneNumber } = await req.json();

    if (!email || !fullName) {
      throw new Error('Email and full name are required');
    }

    console.log('Creating player account for:', email);

    // Create a Supabase admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Generate a temporary password
    const tempPassword = `temp_${crypto.randomUUID()}`;

    // Create the player account using admin client
    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: false, // Require email confirmation
      user_metadata: {
        full_name: fullName,
        phone_number: phoneNumber,
      },
    });

    if (signUpError) {
      console.error('Sign up error:', signUpError);
      throw new Error(`Failed to create user account: ${signUpError.message}`);
    }

    if (!signUpData.user) {
      throw new Error('No user data returned from signup');
    }

    const playerId = signUpData.user.id;
    console.log('Player account created:', playerId);

    // Create profile for the player using admin client
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: playerId,
        full_name: fullName,
        phone_number: phoneNumber,
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Don't throw - we can continue without profile
    } else {
      console.log('Profile created successfully');
    }

    // Set user role as player using admin client
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: playerId,
        role: 'player',
      });

    if (roleInsertError) {
      console.error('Role assignment error:', roleInsertError);
      throw new Error('Failed to assign player role');
    }

    console.log('Player role assigned successfully');

    // Create admin-player relationship using admin client
    const { error: relationshipError } = await supabaseAdmin
      .from('admin_player_relationships')
      .insert({
        admin_id: user.id,
        player_id: playerId,
      });

    if (relationshipError) {
      console.error('Relationship creation error:', relationshipError);
      throw new Error('Failed to create admin-player relationship');
    }

    console.log('Admin-player relationship created successfully');

    // Send password reset email so the player can set their own password
    console.log('Sending password reset email to player');
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: 'https://natively.dev/email-confirmed',
      },
    });

    if (resetError) {
      console.error('Password reset email error:', resetError);
      // Don't throw - the account is created, they can request reset later
    } else {
      console.log('Password reset email sent successfully');
    }

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
    console.error('Error in create-player function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
