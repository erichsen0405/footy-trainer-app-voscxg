import { createClient } from '@supabase/supabase-js';

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const LOCKED_EMAIL = requireEnv('MAESTRO_LOCKED_EMAIL');
const LOCKED_PASSWORD = requireEnv('MAESTRO_LOCKED_PASSWORD');

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

const ensureAuthUser = async () => {
  let user = await findUserByEmail(LOCKED_EMAIL);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: LOCKED_EMAIL,
      password: LOCKED_PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'player' },
      app_metadata: { provider: 'email', providers: ['email'] },
    });
    if (error) throw error;
    if (!data.user) throw new Error(`Failed to create user: ${LOCKED_EMAIL}`);
    user = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: LOCKED_PASSWORD,
      email_confirm: true,
      user_metadata: { ...(user.user_metadata ?? {}), role: 'player' },
      app_metadata: { ...(user.app_metadata ?? {}), provider: 'email', providers: ['email'] },
    });
    if (error) throw error;
  }

  return user.id;
};

const ensureNoSubscription = async (userId: string) => {
  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert({ user_id: userId, role: 'player' }, { onConflict: 'user_id' });
  if (roleErr) throw roleErr;

  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        subscription_tier: null,
        subscription_product_id: null,
        subscription_updated_at: null,
      },
      { onConflict: 'user_id' },
    );
  if (profileErr) throw profileErr;

  const { error: deleteEntitlementsErr } = await supabase
    .from('user_entitlements')
    .delete()
    .eq('user_id', userId);
  if (deleteEntitlementsErr) throw deleteEntitlementsErr;
};

const run = async () => {
  const userId = await ensureAuthUser();
  await ensureNoSubscription(userId);
  console.log(`✅ Ready: ${LOCKED_EMAIL} (player, no subscription, email confirmed)`);
};

run().catch((err) => {
  console.error('❌ Failed to seed locked Maestro user:', err);
  process.exit(1);
});
