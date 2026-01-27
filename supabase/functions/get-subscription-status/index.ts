
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
    console.log('[get-subscription-status] ========== REQUEST RECEIVED ==========');
    
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    console.log('[get-subscription-status] Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('[get-subscription-status] No authorization header');
      throw new Error('No authorization header');
    }

    // Create Supabase client with service role key for admin access
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

    const getTrainerPlayerCount = async (adminId: string): Promise<number> => {
      const { count, error: countError } = await supabaseAdmin
        .from('admin_player_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('admin_id', adminId);

      console.log('[get-subscription-status] Trainer plan - Player count from relationships:', {
        count,
        error: countError?.message,
      });
      return count ?? 0;
    };

    // Create a client with the user's token for authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Get the user from the auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    console.log('[get-subscription-status] User lookup:', {
      userId: user?.id,
      email: user?.email,
      error: userError?.message,
    });

    if (userError || !user) {
      console.error('[get-subscription-status] Unauthorized:', userError);
      throw new Error('Unauthorized');
    }

    console.log('[get-subscription-status] ========== QUERYING SUBSCRIPTION ==========');
    console.log('[get-subscription-status] User ID:', user.id);
    console.log('[get-subscription-status] User email:', user.email);

    // Use admin client to query subscriptions (bypasses RLS)
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        subscription_plans (
          name,
          max_players
        )
      `)
      .eq('admin_id', user.id)
      .maybeSingle();

    console.log('[get-subscription-status] ========== SUBSCRIPTION QUERY RESULT ==========');
    console.log('[get-subscription-status] Found subscription:', !!subscription);
    console.log('[get-subscription-status] Error:', subError?.message);
    
    if (subscription) {
      console.log('[get-subscription-status] Subscription ID:', subscription.id);
      console.log('[get-subscription-status] Plan ID:', subscription.plan_id);
      console.log('[get-subscription-status] Status:', subscription.status);
      console.log('[get-subscription-status] Plan name:', subscription.subscription_plans?.name);
      console.log('[get-subscription-status] Max players:', subscription.subscription_plans?.max_players);
    }

    if (subError) {
      console.error('[get-subscription-status] Error fetching subscription:', subError);
      throw subError;
    }

    if (!subscription) {
      console.log('[get-subscription-status] ========== NO SUBSCRIPTION FOUND ==========');
      console.log('[get-subscription-status] Checking complimentary entitlements…');

      const nowIso = new Date().toISOString();
      const { data: entitlementRows, error: entitlementError } = await supabaseAdmin
        .from('user_entitlements')
        .select('entitlement')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

      if (entitlementError) {
        console.warn('[get-subscription-status] Complimentary entitlement lookup failed', entitlementError.message);
      }

      const entitlementsList = entitlementRows ?? [];
      const hasComplimentaryTrainer = entitlementsList.some(row => row.entitlement === 'træner_premium');
      const hasComplimentaryPlayer = entitlementsList.some(row => row.entitlement === 'spiller_premium');

      const complimentaryTier = hasComplimentaryTrainer
        ? 'trainer_premium'
        : hasComplimentaryPlayer
          ? 'player_premium'
          : null;

      if (complimentaryTier) {
        const planName = complimentaryTier === 'trainer_premium' ? 'Træner Premium' : 'Premium spiller';
        const maxPlayers = complimentaryTier === 'trainer_premium' ? 50 : 1;
        const currentPlayers = complimentaryTier === 'trainer_premium' ? await getTrainerPlayerCount(user.id) : 1;

        const complimentaryResponse = {
          hasSubscription: true,
          status: 'active',
          planName,
          maxPlayers,
          currentPlayers,
          trialEnd: null,
          currentPeriodEnd: null,
          subscriptionTier: complimentaryTier,
        };

        console.log('[get-subscription-status] Complimentary entitlement found', complimentaryResponse);

        return new Response(JSON.stringify(complimentaryResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          hasSubscription: false,
          status: null,
          planName: null,
          maxPlayers: 0,
          currentPlayers: 0,
          trialEnd: null,
          currentPeriodEnd: null,
          subscriptionTier: null,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Determine current player count based on plan type
    let playerCount = 0;
    
    // Check if this is a "Spiller" plan (max_players = 1)
    const isPlayerPlan = subscription.subscription_plans.max_players === 1;
    
    if (isPlayerPlan) {
      playerCount = 1;
      console.log('[get-subscription-status] Player plan detected - user is the player, count = 1');
    } else {
      playerCount = await getTrainerPlayerCount(user.id);
    }

    const response = {
      hasSubscription: true,
      status: subscription.status,
      planName: subscription.subscription_plans.name,
      maxPlayers: subscription.subscription_plans.max_players,
      currentPlayers: playerCount,
      trialEnd: subscription.trial_end,
      currentPeriodEnd: subscription.current_period_end,
      subscriptionTier: null,
    };

    console.log('[get-subscription-status] ========== RETURNING RESPONSE ==========');
    console.log('[get-subscription-status] Response:', JSON.stringify(response, null, 2));

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[get-subscription-status] ========== ERROR ==========');
    console.error('[get-subscription-status] Error:', error);
    console.error('[get-subscription-status] Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[get-subscription-status] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return new Response(
      JSON.stringify({
        hasSubscription: false,
        status: null,
        planName: null,
        maxPlayers: 0,
        currentPlayers: 0,
        trialEnd: null,
        currentPeriodEnd: null,
        subscriptionTier: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});
