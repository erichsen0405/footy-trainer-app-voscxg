import { createClient } from '@supabase/supabase-js';

type Role = 'player' | 'trainer';

type SeedUser = {
  email: string;
  password: string;
  role: Role;
  subscriptionTier: 'player_premium' | 'trainer_premium';
  entitlement: 'spiller_premium' | 'træner_premium';
};

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const users: SeedUser[] = [
  {
    email: 'testplayer@footballcoach.com',
    password: 'kdoi4&ekj',
    role: 'player',
    subscriptionTier: 'player_premium',
    entitlement: 'spiller_premium',
  },
  {
    email: 'testtrainer@footballcoach.com',
    password: 'Dæ0m€mdi',
    role: 'trainer',
    subscriptionTier: 'trainer_premium',
    entitlement: 'træner_premium',
  },
];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const findUserByEmail = async (email: string) => {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const usersPage = data?.users ?? [];
    const found = usersPage.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found;

    if (usersPage.length < perPage) return null;
    page += 1;
  }
};

const ensureAuthUser = async (seed: SeedUser) => {
  let user = await findUserByEmail(seed.email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: seed.email,
      password: seed.password,
      email_confirm: true,
      user_metadata: { role: seed.role },
      app_metadata: { provider: 'email', providers: ['email'] },
    });
    if (error) throw error;
    if (!data.user) throw new Error(`Failed to create user: ${seed.email}`);
    user = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: seed.password,
      email_confirm: true,
      user_metadata: { ...(user.user_metadata ?? {}), role: seed.role },
      app_metadata: { ...(user.app_metadata ?? {}), provider: 'email', providers: ['email'] },
    });
    if (error) throw error;
  }

  return user.id;
};

const ensureProfileAndRole = async (userId: string, seed: SeedUser) => {
  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert({ user_id: userId, role: seed.role }, { onConflict: 'user_id' });
  if (roleErr) throw roleErr;

  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        subscription_tier: seed.subscriptionTier,
        subscription_product_id: `e2e_${seed.subscriptionTier}_lifetime`,
        subscription_updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (profileErr) throw profileErr;
};

const ensureLifetimeEntitlement = async (userId: string, seed: SeedUser) => {
  const { data: existing, error: selectErr } = await supabase
    .from('user_entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('entitlement', seed.entitlement)
    .limit(1)
    .maybeSingle();

  if (selectErr) throw selectErr;

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from('user_entitlements')
      .update({
        source: 'complimentary',
        is_active: true,
        expires_at: null,
        notes: `E2E lifetime entitlement for ${seed.role}`,
      })
      .eq('id', existing.id);

    if (updateErr) throw updateErr;
  } else {
    const { error: insertErr } = await supabase.from('user_entitlements').insert({
      user_id: userId,
      entitlement: seed.entitlement,
      source: 'complimentary',
      is_active: true,
      expires_at: null,
      notes: `E2E lifetime entitlement for ${seed.role}`,
    });

    if (insertErr) throw insertErr;
  }
};

const resolvePlanId = async (seed: SeedUser): Promise<string> => {
  const planQuery =
    seed.role === 'trainer'
      ? supabase
          .from('subscription_plans')
          .select('id, max_players')
          .gt('max_players', 1)
          .order('max_players', { ascending: false })
          .limit(1)
      : supabase
          .from('subscription_plans')
          .select('id, max_players')
          .eq('max_players', 1)
          .order('created_at', { ascending: true })
          .limit(1);

  const { data: plans, error } = await planQuery;
  if (error) throw error;

  const plan = plans?.[0];
  if (!plan?.id) {
    throw new Error(`No suitable subscription plan found for role: ${seed.role}`);
  }

  return plan.id;
};

const ensureActiveSubscriptionRecord = async (userId: string, seed: SeedUser) => {
  const planId = await resolvePlanId(seed);

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const { data: existingRows, error: existingErr } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('admin_id', userId)
    .in('status', ['trial', 'active'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingErr) throw existingErr;

  const existing = existingRows?.[0];
  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from('subscriptions')
      .update({
        plan_id: planId,
        status: 'active',
        trial_start: now.toISOString(),
        trial_end: periodEnd.toISOString(),
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        updated_at: now.toISOString(),
      })
      .eq('id', existing.id);

    if (updateErr) throw updateErr;
    return;
  }

  const { error: insertErr } = await supabase.from('subscriptions').insert({
    admin_id: userId,
    plan_id: planId,
    status: 'active',
    trial_start: now.toISOString(),
    trial_end: periodEnd.toISOString(),
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
  });

  if (insertErr) throw insertErr;
};

const run = async () => {
  for (const seed of users) {
    const userId = await ensureAuthUser(seed);
    await ensureProfileAndRole(userId, seed);
    await ensureLifetimeEntitlement(userId, seed);
    await ensureActiveSubscriptionRecord(userId, seed);
    console.log(`✅ Ready: ${seed.email} (${seed.role})`);
  }

  console.log('Done. Maestro users are ready.');
};

run().catch((err) => {
  console.error('❌ Failed to seed Maestro users:', err);
  process.exit(1);
});
