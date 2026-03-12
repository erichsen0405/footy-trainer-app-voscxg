do $$
declare
  v_user_id uuid;
begin
  select au.id
    into v_user_id
  from auth.users au
  where lower(au.email) = 'michael@danishhealthcare.com'
  order by au.created_at asc
  limit 1;

  if v_user_id is null then
    raise notice 'Skipping platform admin seed for michael@danishhealthcare.com because auth user was not found.';
    return;
  end if;

  insert into public.profiles (
    user_id,
    full_name
  )
  values (
    v_user_id,
    'Michael Hoffmann Erichsen'
  )
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        updated_at = now();

  insert into public.platform_admins (
    user_id,
    email,
    full_name,
    status
  )
  values (
    v_user_id,
    'michael@danishhealthcare.com',
    'Michael Hoffmann Erichsen',
    'active'
  )
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        status = 'active',
        updated_at = now();
end;
$$;
