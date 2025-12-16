
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
    console.log('[get-subscription-status] Request received');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    console.log('[get-subscription-status] Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('[get-subscription-status] No authorization header');
      throw new Error('No authorization header');
    }

    // Get the user from the auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    console.log('[get-subscription-status] User lookup:', {
      userId: user?.id,
      error: userError?.message,
    });

    if (userError || !user) {
      console.error('[get-subscription-status] Unauthorized:', userError);
      throw new Error('Unauthorized');
    }

    console.log('[get-subscription-status] Getting subscription for user:', user.id);

    // Get the user's subscription - use maybeSingle() instead of single() to avoid errors
    const { data: subscription, error: subError } = await supabaseClient
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

    console.log('[get-subscription-status] Subscription query result:', {
      found: !!subscription,
      error: subError?.message,
      subscriptionId: subscription?.id,
      planName: subscription?.subscription_plans?.name,
    });

    if (subError) {
      console.error('[get-subscription-status] Error fetching subscription:', subError);
      throw subError;
    }

    if (!subscription) {
      console.log('[get-subscription-status] No subscription found for user');
      return new Response(
        JSON.stringify({
          hasSubscription: false,
          status: null,
          planName: null,
          maxPlayers: 0,
          currentPlayers: 0,
          trialEnd: null,
          currentPeriodEnd: null,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Count current players
    const { count: playerCount, error: countError } = await supabaseClient
      .from('admin_player_relationships')
      .select('*', { count: 'exact', head: true })
      .eq('admin_id', user.id);

    console.log('[get-subscription-status] Player count:', {
      count: playerCount,
      error: countError?.message,
    });

    const response = {
      hasSubscription: true,
      status: subscription.status,
      planName: subscription.subscription_plans.name,
      maxPlayers: subscription.subscription_plans.max_players,
      currentPlayers: playerCount || 0,
      trialEnd: subscription.trial_end,
      currentPeriodEnd: subscription.current_period_end,
    };

    console.log('[get-subscription-status] Returning subscription status:', response);

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[get-subscription-status] Error:', error);
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
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});
