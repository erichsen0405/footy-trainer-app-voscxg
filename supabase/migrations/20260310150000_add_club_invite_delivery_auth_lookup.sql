create or replace function public.get_auth_user_id_by_email(
  p_email text
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select au.id
  from auth.users au
  where lower(trim(coalesce(au.email, ''))) = lower(trim(coalesce(p_email, '')))
  order by au.created_at asc
  limit 1;
$$;

revoke all on function public.get_auth_user_id_by_email(text) from public;
grant execute on function public.get_auth_user_id_by_email(text) to service_role;
