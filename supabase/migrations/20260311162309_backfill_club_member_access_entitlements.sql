do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct cm.user_id
    from public.club_members cm
    where cm.user_id is not null
  loop
    perform public.sync_club_member_access(v_user_id);
  end loop;
end;
$$;
