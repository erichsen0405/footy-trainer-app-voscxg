import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey =
      Deno.env.get('SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      '';

    if (!serviceKey) {
      console.error('[delete-account] Missing SERVICE_ROLE_KEY secret');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing SERVICE_ROLE_KEY secret' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: userError?.message || 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const userId = userData.user.id;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log('[delete-account] Deleting data for user', userId);

    const { error: cleanupError } = await supabaseAdmin.rpc('delete_user_account', { p_user_id: userId });
    if (cleanupError) {
      console.error('[delete-account] Cleanup error', cleanupError);
      throw cleanupError;
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error('[delete-account] Auth delete failed', authDeleteError);
      throw authDeleteError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('[delete-account] Failed', error);
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
