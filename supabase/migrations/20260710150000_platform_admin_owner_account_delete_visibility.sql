-- Ensure deleted or deactivated owner accounts disappear from the platform-admin web list.

create or replace function public.list_platform_admin_owner_accounts(
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_email text;
  v_owner_accounts jsonb := '[]'::jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select lower(au.email)
    into v_user_email
  from auth.users au
  where au.id = p_actor_user_id;

  if v_user_email is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not public.is_platform_admin(p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ownerAccountId', oa.id,
        'ownerType', oa.owner_type,
        'ownerName', oa.name,
        'ownerStatus', oa.status,
        'source', oa.source,
        'ownerUserId', oa.owner_user_id,
        'ownerEmail', owner_user.email,
        'coachAccountId', oa.coach_account_id,
        'clubId', oa.club_id,
        'createdAt', oa.created_at,
        'updatedAt', oa.updated_at,
        'seatStatus', public.get_owner_seat_status_payload(oa.id)
      )
      order by oa.created_at desc
    ),
    '[]'::jsonb
  )
    into v_owner_accounts
  from public.owner_accounts oa
  left join auth.users owner_user
    on owner_user.id = oa.owner_user_id
  where oa.status = 'active';

  return jsonb_build_object(
    'userId', p_actor_user_id,
    'email', v_user_email,
    'isPlatformAdmin', true,
    'ownerAccounts', v_owner_accounts
  );
end;
$$;

revoke all on function public.list_platform_admin_owner_accounts(uuid) from public;
grant execute on function public.list_platform_admin_owner_accounts(uuid) to service_role;

comment on function public.list_platform_admin_owner_accounts(uuid) is
  'Returns active owner accounts with effective seat status for platform admins through service-backed Edge Functions, bypassing browser RLS limits safely.';
