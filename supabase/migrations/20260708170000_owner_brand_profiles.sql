-- Issue #284: owner-scoped coach/club branding for web, mobile and public surfaces.

create table if not exists public.owner_brand_profiles (
  owner_account_id uuid primary key references public.owner_accounts(id) on delete cascade,
  display_name text not null,
  slug text null,
  bio text null,
  contact_email text null,
  contact_phone text null,
  website_url text null,
  social_links jsonb not null default '{}'::jsonb,
  brand_colors jsonb not null default '{"primary": "#2563eb", "accent": "#16a34a"}'::jsonb,
  logo_path text null,
  logo_url text null,
  cover_path text null,
  cover_url text null,
  is_public boolean not null default false,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_brand_profiles_display_name_not_blank check (btrim(display_name) <> ''),
  constraint owner_brand_profiles_slug_format check (
    slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
  ),
  constraint owner_brand_profiles_contact_email_lowercase check (
    contact_email is null or contact_email = lower(contact_email)
  ),
  constraint owner_brand_profiles_social_links_object check (jsonb_typeof(social_links) = 'object'),
  constraint owner_brand_profiles_brand_colors_object check (jsonb_typeof(brand_colors) = 'object')
);

create unique index if not exists owner_brand_profiles_slug_uidx
  on public.owner_brand_profiles (lower(slug))
  where slug is not null;

create index if not exists owner_brand_profiles_is_public_idx
  on public.owner_brand_profiles (is_public);

drop trigger if exists update_owner_brand_profiles_updated_at on public.owner_brand_profiles;
create trigger update_owner_brand_profiles_updated_at
before update on public.owner_brand_profiles
for each row
execute function public.trigger_update_timestamp();

create or replace function public.default_owner_brand_slug(
  p_owner_name text,
  p_owner_account_id uuid
)
returns text
language sql
immutable
as $$
  select lower(
    trim(
      both '-' from
      regexp_replace(coalesce(nullif(btrim(p_owner_name), ''), 'coach'), '[^a-zA-Z0-9]+', '-', 'g')
    )
  ) || '-' || left(p_owner_account_id::text, 8);
$$;

insert into public.owner_brand_profiles (
  owner_account_id,
  display_name,
  slug,
  is_public,
  brand_colors
)
select
  oa.id,
  oa.name,
  public.default_owner_brand_slug(oa.name, oa.id),
  false,
  '{"primary": "#2563eb", "accent": "#16a34a"}'::jsonb
from public.owner_accounts oa
on conflict (owner_account_id)
do nothing;

create or replace function public.owner_brand_asset_owner_id(
  p_name text
)
returns uuid
language plpgsql
stable
as $$
declare
  v_segment text;
begin
  v_segment := (storage.foldername(p_name))[1];
  if v_segment is null then
    return null;
  end if;

  return v_segment::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.get_public_owner_brand_profile(
  p_slug text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ownerType', oa.owner_type,
    'displayName', obp.display_name,
    'slug', obp.slug,
    'bio', obp.bio,
    'contactEmail', obp.contact_email,
    'contactPhone', obp.contact_phone,
    'websiteUrl', obp.website_url,
    'socialLinks', obp.social_links,
    'brandColors', obp.brand_colors,
    'logoUrl', obp.logo_url,
    'coverUrl', obp.cover_url,
    'isPublic', obp.is_public,
    'updatedAt', obp.updated_at
  )
  from public.owner_brand_profiles obp
  join public.owner_accounts oa
    on oa.id = obp.owner_account_id
   and oa.status = 'active'
  where obp.is_public is true
    and obp.slug = lower(btrim(coalesce(p_slug, '')))
  limit 1;
$$;

insert into storage.buckets (id, name, public)
values ('owner-brand-assets', 'owner-brand-assets', true)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  create policy "Owner brand assets are publicly readable"
    on storage.objects
    for select
    using (bucket_id = 'owner-brand-assets');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Owner brand editors can upload assets"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'owner-brand-assets'
      and public.has_owner_account_role(
        public.owner_brand_asset_owner_id(name),
        (select auth.uid()),
        array['owner', 'admin', 'coach']
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Owner brand editors can update assets"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'owner-brand-assets'
      and public.has_owner_account_role(
        public.owner_brand_asset_owner_id(name),
        (select auth.uid()),
        array['owner', 'admin', 'coach']
      )
    )
    with check (
      bucket_id = 'owner-brand-assets'
      and public.has_owner_account_role(
        public.owner_brand_asset_owner_id(name),
        (select auth.uid()),
        array['owner', 'admin', 'coach']
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Owner brand editors can delete assets"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'owner-brand-assets'
      and public.has_owner_account_role(
        public.owner_brand_asset_owner_id(name),
        (select auth.uid()),
        array['owner', 'admin', 'coach']
      )
    );
exception
  when duplicate_object then null;
end $$;

alter table public.owner_brand_profiles enable row level security;

drop policy if exists owner_brand_profiles_public_read on public.owner_brand_profiles;
create policy owner_brand_profiles_public_read
  on public.owner_brand_profiles
  for select
  to anon, authenticated
  using (
    is_public is true
    and exists (
      select 1
      from public.owner_accounts oa
      where oa.id = owner_brand_profiles.owner_account_id
        and oa.status = 'active'
    )
  );

drop policy if exists owner_brand_profiles_member_read on public.owner_brand_profiles;
create policy owner_brand_profiles_member_read
  on public.owner_brand_profiles
  for select
  to authenticated
  using (public.is_owner_account_member(owner_account_id, (select auth.uid())));

drop policy if exists owner_brand_profiles_editor_insert on public.owner_brand_profiles;
create policy owner_brand_profiles_editor_insert
  on public.owner_brand_profiles
  for insert
  to authenticated
  with check (
    public.has_owner_account_role(owner_account_id, (select auth.uid()), array['owner', 'admin', 'coach'])
  );

drop policy if exists owner_brand_profiles_editor_update on public.owner_brand_profiles;
create policy owner_brand_profiles_editor_update
  on public.owner_brand_profiles
  for update
  to authenticated
  using (
    public.has_owner_account_role(owner_account_id, (select auth.uid()), array['owner', 'admin', 'coach'])
  )
  with check (
    public.has_owner_account_role(owner_account_id, (select auth.uid()), array['owner', 'admin', 'coach'])
  );

revoke all on public.owner_brand_profiles from anon;
grant select on public.owner_brand_profiles to anon;
grant select, insert, update on public.owner_brand_profiles to authenticated;
grant all on public.owner_brand_profiles to service_role;

revoke all on function public.owner_brand_asset_owner_id(text) from public;
grant execute on function public.owner_brand_asset_owner_id(text) to authenticated, service_role;

revoke all on function public.get_public_owner_brand_profile(text) from public;
grant execute on function public.get_public_owner_brand_profile(text) to anon, authenticated, service_role;

comment on table public.owner_brand_profiles is
  'Owner-scoped public brand profile for clubs and private coach businesses. Supabase is source of truth for Base44 and mobile.';
