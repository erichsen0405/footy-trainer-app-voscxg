import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const normalizeRole = (role: unknown) => (typeof role === 'string' ? role.toLowerCase() : '');

async function sendPushToUser(supabaseAdmin: any, userId: string, payload: PushPayload) {
  try {
    const { data: tokenRows, error: tokenError } = await supabaseAdmin
      .from('user_push_tokens')
      .select('expo_push_token')
      .eq('user_id', userId);

    if (tokenError) {
      console.error('[player-link-requests] Failed to load push tokens:', tokenError);
      return;
    }

    const tokens = (tokenRows ?? [])
      .map((row: any) => row?.expo_push_token)
      .filter((token: unknown): token is string => typeof token === 'string' && token.startsWith('ExponentPushToken'));

    if (!tokens.length) {
      console.log('[player-link-requests] No push tokens for user:', userId);
      return;
    }

    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      priority: 'high',
    }));

    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const pushText = await pushResponse.text();
    if (!pushResponse.ok) {
      console.error('[player-link-requests] Expo push failed:', pushResponse.status, pushText);
      return;
    }

    console.log('[player-link-requests] Expo push sent:', pushText);
  } catch (error) {
    console.error('[player-link-requests] Unexpected push error:', error);
  }
}

async function getDisplayName(supabaseAdmin: any, userId: string, fallback: string) {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    const name = typeof profile?.full_name === 'string' ? profile.full_name.trim() : '';
    return name.length ? name : fallback;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse(401, {
        success: false,
        error: 'No authorization header',
      });
    }

    let requestBody: Record<string, unknown>;
    try {
      requestBody = await req.json();
    } catch (parseError: any) {
      return jsonResponse(400, {
        success: false,
        error: `Invalid JSON in request body: ${parseError?.message ?? 'Unknown error'}`,
      });
    }

    const action = typeof requestBody.action === 'string' ? requestBody.action : '';
    const requestId = typeof requestBody.requestId === 'string' ? requestBody.requestId : '';

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return jsonResponse(500, {
        success: false,
        error: 'Missing required environment variables',
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(401, {
        success: false,
        error: `Unauthorized: ${userError?.message ?? 'No user found'}`,
      });
    }

    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const role = normalizeRole(roleData?.role);

    if (action !== 'accept') {
      return jsonResponse(400, {
        success: false,
        error: `Invalid action: ${action}. Expected 'accept'`,
      });
    }

    if (!requestId) {
      return jsonResponse(400, {
        success: false,
        error: 'requestId is required',
      });
    }

    if (role !== 'player') {
      return jsonResponse(403, {
        success: false,
        error: 'Only players can accept trainer requests',
      });
    }

    const { data: requestRow, error: requestError } = await supabaseClient
      .from('admin_player_link_requests')
      .select('id, admin_id, player_id, status')
      .eq('id', requestId)
      .maybeSingle();

    if (requestError) {
      return jsonResponse(500, {
        success: false,
        error: `Could not load request: ${requestError.message}`,
      });
    }

    if (!requestRow || requestRow.player_id !== user.id) {
      return jsonResponse(404, {
        success: false,
        error: 'Request not found',
      });
    }

    if (requestRow.status !== 'pending') {
      return jsonResponse(400, {
        success: false,
        error: 'Request is no longer pending',
        status: requestRow.status,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: acceptedRows, error: acceptError } = await supabaseAdmin.rpc(
      'accept_admin_player_link_request',
      {
        p_request_id: requestId,
        p_player_id: user.id,
      },
    );

    if (acceptError) {
      const errorMessage = String(acceptError.message ?? '');
      if (errorMessage.includes('REQUEST_NOT_FOUND')) {
        return jsonResponse(404, {
          success: false,
          error: 'Request not found',
        });
      }
      if (errorMessage.includes('REQUEST_NOT_PENDING')) {
        return jsonResponse(400, {
          success: false,
          error: 'Request is no longer pending',
        });
      }
      return jsonResponse(500, {
        success: false,
        error: `Failed to accept trainer request: ${acceptError.message}`,
      });
    }

    const acceptedRow = Array.isArray(acceptedRows) ? acceptedRows[0] : null;
    const acceptedAdminId = String(acceptedRow?.admin_id ?? requestRow.admin_id);
    const acceptedPlayerId = String(acceptedRow?.player_id ?? requestRow.player_id);

    const playerName = await getDisplayName(
      supabaseAdmin,
      user.id,
      user.email?.split('@')[0] ?? 'Your player',
    );

    await sendPushToUser(supabaseAdmin, acceptedAdminId, {
      title: 'Player accepted',
      body: `${playerName} accepted your request.`,
      data: {
        target: 'profile_team_players',
        openTeamPlayers: '1',
        playerId: acceptedPlayerId,
        requestId,
      },
    });

    return jsonResponse(200, {
      success: true,
      status: 'accepted',
      requestId,
      message: 'Request accepted',
    });
  } catch (error: any) {
    console.error('=== Error in player-link-requests function ===', error);
    return jsonResponse(500, {
      success: false,
      error: error?.message || 'An error occurred',
      errorType: error?.constructor?.name || 'UnknownError',
    });
  }
});
