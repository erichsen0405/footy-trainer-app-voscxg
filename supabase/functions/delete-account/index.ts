import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('[delete-account] Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ success: false, error: 'Server misconfigured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: getUserError,
    } = await supabaseClient.auth.getUser();

    if (getUserError || !user) {
      console.error('[delete-account] Auth error', getUserError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log('[delete-account] Deleting relational data for user', user.id);
    const { error: dataDeleteError } = await supabaseAdmin.rpc('delete_user_account', { p_user_id: user.id });
    if (dataDeleteError) {
      console.error('[delete-account] Data cleanup failed', dataDeleteError);
      throw new Error(`Failed to remove profile data: ${dataDeleteError.message}`);
    }

    console.log('[delete-account] Removing auth user', user.id);
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    const authDeleteMessage = authDeleteError?.message?.toLowerCase() ?? '';
    if (authDeleteError && !authDeleteMessage.includes('not found')) {
      console.error('[delete-account] Auth deletion failed', authDeleteError);
      throw new Error(authDeleteError.message || 'Unable to delete auth user');
    }

    return new Response(
      JSON.stringify({ success: true, deletedUserId: user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[delete-account] Unexpected error', error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message ?? 'Unexpected error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
