-- Trainer-player request acceptance flow

create table if not exists public.admin_player_link_requests (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  accepted_at timestamp with time zone,
  accepted_by uuid references auth.users(id)
);

create unique index if not exists admin_player_link_requests_admin_player_key
  on public.admin_player_link_requests (admin_id, player_id);

create index if not exists idx_admin_player_link_requests_admin_id
  on public.admin_player_link_requests (admin_id);

create index if not exists idx_admin_player_link_requests_player_id
  on public.admin_player_link_requests (player_id);

create index if not exists idx_admin_player_link_requests_status
  on public.admin_player_link_requests (status);

alter table public.admin_player_link_requests enable row level security;

drop policy if exists "Admins can view their player link requests" on public.admin_player_link_requests;
create policy "Admins can view their player link requests"
  on public.admin_player_link_requests
  for select
  to authenticated
  using (admin_id = auth.uid());

drop policy if exists "Players can view incoming player link requests" on public.admin_player_link_requests;
create policy "Players can view incoming player link requests"
  on public.admin_player_link_requests
  for select
  to authenticated
  using (player_id = auth.uid());

drop policy if exists "Admins can create player link requests" on public.admin_player_link_requests;
create policy "Admins can create player link requests"
  on public.admin_player_link_requests
  for insert
  to authenticated
  with check (
    admin_id = auth.uid()
    and admin_id <> player_id
    and status = 'pending'
  );

drop policy if exists "Admins can update own player link requests" on public.admin_player_link_requests;
create policy "Admins can update own player link requests"
  on public.admin_player_link_requests
  for update
  to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

drop policy if exists "Players can update pending player link requests" on public.admin_player_link_requests;
create policy "Players can update pending player link requests"
  on public.admin_player_link_requests
  for update
  to authenticated
  using (player_id = auth.uid() and status = 'pending')
  with check (
    player_id = auth.uid()
    and status in ('pending', 'accepted', 'declined', 'cancelled')
  );

drop policy if exists "Admins can delete own player link requests" on public.admin_player_link_requests;
create policy "Admins can delete own player link requests"
  on public.admin_player_link_requests
  for delete
  to authenticated
  using (admin_id = auth.uid());

grant select, insert, update, delete on table public.admin_player_link_requests to authenticated;

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_user_push_tokens_user_id
  on public.user_push_tokens (user_id);

create unique index if not exists user_push_tokens_user_token_key
  on public.user_push_tokens (user_id, expo_push_token);

alter table public.user_push_tokens enable row level security;

drop policy if exists "Users can view own push tokens" on public.user_push_tokens;
create policy "Users can view own push tokens"
  on public.user_push_tokens
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own push tokens" on public.user_push_tokens;
create policy "Users can insert own push tokens"
  on public.user_push_tokens
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own push tokens" on public.user_push_tokens;
create policy "Users can update own push tokens"
  on public.user_push_tokens
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own push tokens" on public.user_push_tokens;
create policy "Users can delete own push tokens"
  on public.user_push_tokens
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.user_push_tokens to authenticated;

drop policy if exists "Admins can view pending requested player profiles" on public.profiles;
create policy "Admins can view pending requested player profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_player_link_requests apr
      where apr.admin_id = auth.uid()
        and apr.player_id = profiles.user_id
        and apr.status = 'pending'
    )
  );

drop policy if exists "Players can view pending trainer request profiles" on public.profiles;
create policy "Players can view pending trainer request profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_player_link_requests apr
      where apr.player_id = auth.uid()
        and apr.admin_id = profiles.user_id
        and apr.status = 'pending'
    )
  );
