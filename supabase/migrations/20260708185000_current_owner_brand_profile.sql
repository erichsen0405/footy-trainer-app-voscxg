-- Issue #284 follow-up: expose current linked owner branding for mobile app chrome.

create or replace function public.get_current_owner_brand_profile()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with actor as (
    select auth.uid() as user_id
  ),
  candidate_owner_accounts as (
    select
      om.owner_account_id,
      10 as priority,
      max(om.updated_at) as linked_at,
      'staff'::text as source
    from public.owner_memberships om
    join public.owner_membership_roles omr
      on omr.owner_account_id = om.owner_account_id
     and omr.user_id = om.user_id
     and omr.status = 'active'
    join actor a on a.user_id = om.user_id
    where om.status = 'active'
    group by om.owner_account_id

    union all

    select
      op.owner_account_id,
      20 as priority,
      max(coalesce(op.first_linked_at, op.updated_at, op.created_at)) as linked_at,
      'player'::text as source
    from public.owner_players op
    join actor a on a.user_id = op.player_id
    where op.status = 'active'
    group by op.owner_account_id

    union all

    select
      opg.owner_account_id,
      30 as priority,
      max(coalesce(opg.updated_at, opg.created_at)) as linked_at,
      'guardian'::text as source
    from public.owner_player_guardians opg
    join actor a on a.user_id = opg.guardian_user_id
    where opg.status = 'active'
      and coalesce((opg.permissions ->> 'read')::boolean, true)
    group by opg.owner_account_id
  ),
  ranked_owner as (
    select
      coa.owner_account_id,
      (array_agg(coa.source order by coa.priority asc, coa.linked_at desc nulls last))[1] as source
    from candidate_owner_accounts coa
    join public.owner_accounts oa
      on oa.id = coa.owner_account_id
     and oa.status = 'active'
    group by coa.owner_account_id
    order by min(coa.priority) asc, max(coa.linked_at) desc nulls last, coa.owner_account_id asc
    limit 1
  )
  select jsonb_build_object(
    'ownerType', oa.owner_type,
    'ownerName', oa.name,
    'displayName', coalesce(obp.display_name, oa.name),
    'slug', obp.slug,
    'bio', obp.bio,
    'brandColors', coalesce(obp.brand_colors, '{"primary": "#2563eb", "accent": "#16a34a"}'::jsonb),
    'logoUrl', obp.logo_url,
    'coverUrl', obp.cover_url,
    'isPublic', coalesce(obp.is_public, false),
    'source', ro.source,
    'updatedAt', coalesce(obp.updated_at, oa.updated_at)
  )
  from ranked_owner ro
  join public.owner_accounts oa
    on oa.id = ro.owner_account_id
  left join public.owner_brand_profiles obp
    on obp.owner_account_id = oa.id
  limit 1;
$$;

revoke all on function public.get_current_owner_brand_profile() from public;
grant execute on function public.get_current_owner_brand_profile() to authenticated, service_role;

comment on function public.get_current_owner_brand_profile() is
  'Returns safe mobile app chrome branding for the current user if they are linked to an active owner as staff, player or guardian.';
