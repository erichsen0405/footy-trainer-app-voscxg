-- Remove direct auth.users references that do not cascade automatically.
-- The main delete_user_account RPC handles first-party app data; this helper
-- catches newer optional tables and no-action/restrict foreign keys before
-- auth.admin.deleteUser runs in the delete-account Edge Function.
create or replace function public.delete_user_account_auth_blockers(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fk_auth record;
begin
  if p_user_id is null then
    raise exception 'p_user_id must not be null';
  end if;

  for fk_auth in (
    select
      nsp.nspname as schema_name,
      cls.relname as table_name,
      att.attname as column_name,
      att.attnotnull as column_not_null
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    join lateral unnest(con.conkey) as fkcols(attnum) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = fkcols.attnum
    where con.confrelid = 'auth.users'::regclass
      and con.contype = 'f'
      and con.confdeltype in ('a', 'r')
      and nsp.nspname = 'public'
      and array_length(con.conkey, 1) = 1
  ) loop
    if fk_auth.column_not_null then
      execute format(
        'delete from %I.%I child where child.%I = $1',
        fk_auth.schema_name,
        fk_auth.table_name,
        fk_auth.column_name
      ) using p_user_id;
    else
      execute format(
        'update %I.%I child set %I = null where child.%I = $1',
        fk_auth.schema_name,
        fk_auth.table_name,
        fk_auth.column_name,
        fk_auth.column_name
      ) using p_user_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.delete_user_account_auth_blockers(uuid) from public;
grant execute on function public.delete_user_account_auth_blockers(uuid) to service_role;
grant execute on function public.delete_user_account_auth_blockers(uuid) to supabase_admin;
comment on function public.delete_user_account_auth_blockers(uuid) is 'Deletes or nulls direct public auth.users references that would block auth.admin.deleteUser.';
