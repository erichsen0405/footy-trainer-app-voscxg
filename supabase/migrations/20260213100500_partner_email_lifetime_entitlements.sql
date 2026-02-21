create extension if not exists "pgcrypto";

create table if not exists public.partner_email_entitlements (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  entitlement text not null,
  source text not null default 'partner',
  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_email_entitlements_email_normalized
    check (email = lower(trim(email))),
  constraint partner_email_entitlements_entitlement_check
    check (entitlement = any (array['spiller_premium', U&'tr\00E6ner_premium'])),
  constraint partner_email_entitlements_email_entitlement_key
    unique (email, entitlement)
);

create index if not exists partner_email_entitlements_email_idx
  on public.partner_email_entitlements (email);

alter table public.partner_email_entitlements enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'partner_email_entitlements'
      and policyname = 'Service role can manage partner email entitlements'
  ) then
    create policy "Service role can manage partner email entitlements"
      on public.partner_email_entitlements
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

create or replace function public.apply_partner_email_entitlements(
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_user_id is null or v_normalized_email = '' then
    return;
  end if;

  -- Reactivate existing entitlements first (covers historical inactive rows).
  update public.user_entitlements ue
  set
    source = pee.source,
    is_active = true,
    expires_at = null,
    notes = coalesce(pee.notes, 'Auto-assigned from partner email list')
  from public.partner_email_entitlements pee
  where pee.is_active
    and pee.email = v_normalized_email
    and ue.user_id = p_user_id
    and ue.entitlement = pee.entitlement
    and ue.is_active = false;

  -- Insert only when no entitlement row exists at all.
  insert into public.user_entitlements (
    user_id,
    entitlement,
    source,
    is_active,
    expires_at,
    notes
  )
  select
    p_user_id,
    pee.entitlement,
    pee.source,
    true,
    null,
    coalesce(pee.notes, 'Auto-assigned from partner email list')
  from public.partner_email_entitlements pee
  where pee.is_active
    and pee.email = v_normalized_email
    and not exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = p_user_id
        and ue.entitlement = pee.entitlement
    );
end;
$$;

grant execute on function public.apply_partner_email_entitlements(uuid, text)
  to service_role;

create or replace function public.trigger_apply_partner_entitlements_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_partner_email_entitlements(new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_partner_entitlements on auth.users;

create trigger on_auth_user_created_partner_entitlements
  after insert on auth.users
  for each row
  execute function public.trigger_apply_partner_entitlements_on_auth_user_created();

insert into public.partner_email_entitlements (email, entitlement, source, notes, is_active)
values
  ('nohrhoffmann@gmail.com', 'spiller_premium', 'partner', 'Lifetime partner entitlement', true),
  ('michael@danishhealthcare.com', U&'tr\00E6ner_premium', 'partner', 'Lifetime partner entitlement', true)
on conflict (email, entitlement)
do update set
  source = excluded.source,
  notes = excluded.notes,
  is_active = excluded.is_active,
  updated_at = now();

update public.user_entitlements ue
set
  source = pee.source,
  is_active = true,
  expires_at = null,
  notes = coalesce(pee.notes, 'Auto-assigned from partner email list')
from auth.users au
join public.partner_email_entitlements pee
  on pee.email = lower(trim(coalesce(au.email, '')))
where pee.is_active
  and ue.user_id = au.id
  and ue.entitlement = pee.entitlement
  and ue.is_active = false;

insert into public.user_entitlements (user_id, entitlement, source, is_active, expires_at, notes)
select
  au.id,
  pee.entitlement,
  pee.source,
  true,
  null,
  coalesce(pee.notes, 'Auto-assigned from partner email list')
from auth.users au
join public.partner_email_entitlements pee
  on pee.email = lower(trim(coalesce(au.email, '')))
where pee.is_active
  and not exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = au.id
      and ue.entitlement = pee.entitlement
  );
