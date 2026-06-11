create or replace function public.get_auth_user_invite_state_by_email(
  p_email text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', au.id,
    'emailConfirmedAt', au.email_confirmed_at,
    'confirmedAt', au.confirmed_at,
    'invitedAt', au.invited_at
  )
  from auth.users au
  where lower(trim(coalesce(au.email, ''))) = lower(trim(coalesce(p_email, '')))
  order by au.created_at asc
  limit 1;
$$;

revoke all on function public.get_auth_user_invite_state_by_email(text) from public;
grant execute on function public.get_auth_user_invite_state_by_email(text) to service_role;
comment on function public.get_auth_user_invite_state_by_email(text) is 'Returns auth confirmation/invite state for club invite email delivery.';
