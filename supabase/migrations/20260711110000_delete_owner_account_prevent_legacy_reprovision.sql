-- Prevent platform-admin owner deletes from immediately recreating legacy coach workspaces.

create or replace function public.ensure_migration_coach_account_for_user(
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_profile_name text;
  v_account_name text;
begin
  if p_user_id is null then
    return null;
  end if;

  if current_setting('app.skip_coach_workspace_auto_provision', true) = 'on' then
    return null;
  end if;

  select ca.id
    into v_account_id
  from public.coach_accounts ca
  where ca.owner_user_id = p_user_id
    and ca.status = 'active'
    and ca.source in ('personal_coach', 'migration')
  order by ca.created_at asc
  limit 1;

  if v_account_id is null then
    select nullif(btrim(p.full_name), '')
      into v_profile_name
    from public.profiles p
    where p.user_id = p_user_id;

    v_account_name := coalesce(v_profile_name || '''s workspace', 'Coach workspace');

    insert into public.coach_accounts (
      owner_user_id,
      name,
      status,
      source
    )
    values (
      p_user_id,
      v_account_name,
      'active',
      'migration'
    )
    returning id
      into v_account_id;
  end if;

  insert into public.coach_memberships (
    coach_account_id,
    user_id,
    role,
    status,
    added_by
  )
  values (
    v_account_id,
    p_user_id,
    'owner',
    'active',
    p_user_id
  )
  on conflict (coach_account_id, user_id)
  do update
     set role = 'owner',
         status = 'active',
         updated_at = now();

  return v_account_id;
end;
$$;

revoke all on function public.ensure_migration_coach_account_for_user(uuid) from public;
grant execute on function public.ensure_migration_coach_account_for_user(uuid) to service_role;

comment on function public.ensure_migration_coach_account_for_user(uuid) is
  'Ensures legacy trainer rows have a coach workspace, except during platform-admin owner delete transactions.';

create or replace function public.delete_owner_account_as_platform_admin(
  p_actor_user_id uuid,
  p_owner_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner public.owner_accounts%rowtype;
  v_before jsonb;
  v_linked_workspace_deleted boolean := false;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_owner_account_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  if not public.is_platform_admin(p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_owner_account_id::text));

  select *
    into v_owner
  from public.owner_accounts oa
  where oa.id = p_owner_account_id;

  if v_owner.id is null then
    raise exception 'OWNER_ACCOUNT_NOT_FOUND';
  end if;

  v_before := public.get_owner_seat_status_payload(p_owner_account_id)
    || jsonb_build_object(
      'ownerName', v_owner.name,
      'source', v_owner.source,
      'ownerUserId', v_owner.owner_user_id,
      'coachAccountId', v_owner.coach_account_id,
      'clubId', v_owner.club_id
    );

  insert into public.owner_subscription_audit_events (
    owner_account_id,
    actor_user_id,
    source,
    action,
    before_payload,
    after_payload
  )
  values (
    p_owner_account_id,
    p_actor_user_id,
    'super_admin',
    'owner_account_deleted',
    v_before,
    jsonb_build_object(
      'ownerAccountId', p_owner_account_id,
      'deleted', true,
      'deletedAt', now()
    )
  );

  perform set_config('app.skip_coach_workspace_auto_provision', 'on', true);

  delete from public.owner_accounts
  where id = p_owner_account_id;

  if v_owner.club_id is not null then
    perform public.delete_club(p_actor_user_id, v_owner.club_id);
    v_linked_workspace_deleted := true;
  elsif v_owner.coach_account_id is not null then
    delete from public.coach_accounts
    where id = v_owner.coach_account_id;
    v_linked_workspace_deleted := true;
  end if;

  return jsonb_build_object(
    'ownerAccountId', p_owner_account_id,
    'deleted', true,
    'ownerType', v_owner.owner_type,
    'ownerName', v_owner.name,
    'coachAccountId', v_owner.coach_account_id,
    'clubId', v_owner.club_id,
    'linkedWorkspaceDeleted', v_linked_workspace_deleted
  );
end;
$$;

revoke all on function public.delete_owner_account_as_platform_admin(uuid, uuid) from public;
grant execute on function public.delete_owner_account_as_platform_admin(uuid, uuid) to service_role;

comment on function public.delete_owner_account_as_platform_admin(uuid, uuid) is
  'Deletes an owner account and its linked club or coach workspace for platform admins through a service-backed Edge Function without legacy auto-reprovisioning.';
