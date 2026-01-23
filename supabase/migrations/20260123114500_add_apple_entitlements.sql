create table if not exists public.apple_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  plan_code text not null,
  status text not null default 'pending',
  expires_at timestamptz,
  original_transaction_id text,
  environment text,
  latest_receipt text,
  latest_payload jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apple_entitlements enable row level security;

create unique index if not exists apple_entitlements_user_id_key
  on public.apple_entitlements (user_id);

create index if not exists apple_entitlements_original_transaction_id_idx
  on public.apple_entitlements (original_transaction_id);

create policy "Users can view their apple entitlements"
  on public.apple_entitlements
  for select
  using (auth.uid() = user_id);

-- No write policies: Only service role (Edge Functions) can write, as it bypasses RLS.
