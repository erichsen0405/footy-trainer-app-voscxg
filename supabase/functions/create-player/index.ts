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
      console.error('[create-player] Failed to load push tokens:', tokenError);
      return;
    }

    const tokens = (tokenRows ?? [])
      .map((row: any) => row?.expo_push_token)
      .filter((token: unknown): token is string => typeof token === 'string' && token.startsWith('ExponentPushToken'));

    if (!tokens.length) {
      console.log('[create-player] No push tokens for user:', userId);
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
      console.error('[create-player] Expo push failed:', pushResponse.status, pushText);
      return;
    }

    console.log('[create-player] Expo push sent:', pushText);
  } catch (error) {
    console.error('[create-player] Unexpected push error:', error);
  }
}

async function getDisplayName(supabaseAdmin: any, userId: string, fallback = 'Din træner') {
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
    const email = typeof requestBody.email === 'string' ? requestBody.email.trim().toLowerCase() : '';
    const playerId = typeof requestBody.playerId === 'string' ? requestBody.playerId : '';

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

    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError) {
      return jsonResponse(403, {
        success: false,
        error: `Failed to check user role: ${roleError.message}`,
      });
    }

    const role = normalizeRole(roleData?.role);
    const canManagePlayers = role === 'admin' || role === 'trainer';

    if (!canManagePlayers) {
      return jsonResponse(403, {
        success: false,
        error: 'Only admins and trainers can manage players',
        userRole: roleData?.role ?? 'none',
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    if (action === 'search') {
      if (!email) {
        return jsonResponse(400, {
          success: false,
          error: 'Email is required for search',
        });
      }

      const { data: users, error: searchError } = await supabaseAdmin.auth.admin.listUsers();

      if (searchError) {
        return jsonResponse(500, {
          success: false,
          error: `Failed to search for user: ${searchError.message}`,
        });
      }

      const foundUser = users.users.find((u) => u.email?.toLowerCase() === email);

      if (!foundUser) {
        return jsonResponse(200, {
          success: true,
          user: null,
        });
      }

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('user_id', foundUser.id)
        .maybeSingle();

      return jsonResponse(200, {
        success: true,
        user: {
          id: foundUser.id,
          email: foundUser.email,
          full_name: profile?.full_name || foundUser.user_metadata?.full_name || null,
        },
      });
    }

    if (action === 'add') {
      if (!playerId) {
        return jsonResponse(400, {
          success: false,
          error: 'Player ID is required',
        });
      }

      if (playerId === user.id) {
        return jsonResponse(400, {
          success: false,
          error: 'Du kan ikke tilføje dig selv som spiller',
        });
      }

      const { data: existingRelationship } = await supabaseAdmin
        .from('admin_player_relationships')
        .select('id')
        .eq('admin_id', user.id)
        .eq('player_id', playerId)
        .maybeSingle();

      if (existingRelationship) {
        return jsonResponse(400, {
          success: false,
          error: 'This player is already linked to your profile',
        });
      }

      const { data: existingRequest } = await supabaseAdmin
        .from('admin_player_link_requests')
        .select('id, status')
        .eq('admin_id', user.id)
        .eq('player_id', playerId)
        .maybeSingle();

      let requestId: string | null = null;
      const nowIso = new Date().toISOString();

      if (existingRequest?.id) {
        requestId = existingRequest.id;

        if (existingRequest.status === 'pending') {
          return jsonResponse(200, {
            success: true,
            status: 'pending',
            message: 'Afventer allerede accept fra spilleren',
          });
        }

        const { error: updateRequestError } = await supabaseAdmin
          .from('admin_player_link_requests')
          .update({
            status: 'pending',
            accepted_at: null,
            accepted_by: null,
            updated_at: nowIso,
          })
          .eq('id', existingRequest.id);

        if (updateRequestError) {
          return jsonResponse(500, {
            success: false,
            error: `Failed to create player request: ${updateRequestError.message}`,
          });
        }
      } else {
        const { data: insertedRequest, error: insertRequestError } = await supabaseAdmin
          .from('admin_player_link_requests')
          .insert({
            admin_id: user.id,
            player_id: playerId,
            status: 'pending',
            updated_at: nowIso,
          })
          .select('id')
          .single();

        if (insertRequestError) {
          return jsonResponse(500, {
            success: false,
            error: `Failed to create player request: ${insertRequestError.message}`,
          });
        }

        requestId = insertedRequest.id;
      }

      const trainerName = await getDisplayName(
        supabaseAdmin,
        user.id,
        user.email?.split('@')[0] ?? 'Din træner',
      );

      await sendPushToUser(supabaseAdmin, playerId, {
        title: 'Ny træneranmodning',
        body: `${trainerName} har sendt dig en anmodning. Tryk for at åbne din profil.`,
        data: {
          target: 'profile_trainer_requests',
          openTrainerRequests: '1',
          requestId,
          adminId: user.id,
        },
      });

      return jsonResponse(200, {
        success: true,
        status: 'pending',
        requestId,
        message: 'Spiller tilføjet. Afventer accept fra spilleren.',
      });
    }

    return jsonResponse(400, {
      success: false,
      error: `Invalid action: ${action}. Expected 'search' or 'add'`,
    });
  } catch (error: any) {
    console.error('=== Error in create-player function ===', error);
    return jsonResponse(500, {
      success: false,
      error: error?.message || 'An error occurred',
      errorType: error?.constructor?.name || 'UnknownError',
    });
  }
});
