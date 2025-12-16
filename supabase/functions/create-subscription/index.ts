
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
    console.log('[create-subscription] Request received');
    console.log('[create-subscription] Request method:', req.method);
    console.log('[create-subscription] Request headers:', Object.fromEntries(req.headers.entries()));
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    console.log('[create-subscription] Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('[create-subscription] No authorization header');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Ingen autorisation. Log venligst ind igen.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Get the user from the auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    console.log('[create-subscription] User verification:', { 
      userId: user?.id, 
      error: userError?.message 
    });

    if (userError || !user) {
      console.error('[create-subscription] Unauthorized:', userError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Ugyldig session. Log venligst ind igen.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Parse request body
    let requestBody;
    let rawBody = '';
    try {
      rawBody = await req.text();
      console.log('[create-subscription] Raw request body:', rawBody);
      
      if (!rawBody || rawBody.trim() === '') {
        console.error('[create-subscription] Empty request body');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Tom anmodning. Prøv igen.',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        );
      }
      
      requestBody = JSON.parse(rawBody);
      console.log('[create-subscription] Parsed request body:', requestBody);
    } catch (e) {
      console.error('[create-subscription] Failed to parse request body:', e);
      console.error('[create-subscription] Raw body was:', rawBody);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Ugyldig anmodning format. Prøv igen.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const { planId, userId } = requestBody;
    const targetUserId = userId || user.id; // Allow specifying userId for signup flow

    console.log('[create-subscription] Creating subscription for user:', targetUserId, 'with plan:', planId);

    if (!planId) {
      console.error('[create-subscription] No planId provided');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Ingen plan valgt. Vælg venligst en plan.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if user already has a subscription
    const { data: existingSub, error: existingSubError } = await supabaseClient
      .from('subscriptions')
      .select('id')
      .eq('admin_id', targetUserId)
      .maybeSingle();

    console.log('[create-subscription] Existing subscription check:', { 
      exists: !!existingSub, 
      error: existingSubError?.message 
    });

    if (existingSub) {
      console.log('[create-subscription] User already has a subscription');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Du har allerede et abonnement',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Get the plan details
    const { data: plan, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    console.log('[create-subscription] Plan lookup:', { 
      planFound: !!plan, 
      planName: plan?.name,
      error: planError?.message 
    });

    if (planError || !plan) {
      console.error('[create-subscription] Plan not found:', planError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Ugyldig plan. Vælg venligst en gyldig plan.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Calculate trial period (14 days)
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    console.log('[create-subscription] Creating subscription with trial period:', {
      trialStart: now.toISOString(),
      trialEnd: trialEnd.toISOString(),
    });

    // Create the subscription
    const { data: subscription, error: subError } = await supabaseClient
      .from('subscriptions')
      .insert({
        admin_id: targetUserId,
        plan_id: planId,
        status: 'trial',
        trial_start: now.toISOString(),
        trial_end: trialEnd.toISOString(),
        current_period_start: now.toISOString(),
        current_period_end: trialEnd.toISOString(),
        cancel_at_period_end: false,
      })
      .select()
      .single();

    if (subError) {
      console.error('[create-subscription] Error creating subscription:', subError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Kunne ikke oprette abonnement. Prøv igen.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    console.log('[create-subscription] Subscription created successfully:', subscription.id);

    return new Response(
      JSON.stringify({
        success: true,
        subscription,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[create-subscription] Unexpected error:', error);
    console.error('[create-subscription] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Der opstod en uventet fejl. Prøv igen om et øjeblik.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
