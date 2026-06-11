-- Atomically accept a trainer-player link request and create the active relationship.
create or replace function public.accept_admin_player_link_request(
  p_request_id uuid,
  p_player_id uuid
)
returns table (
  request_id uuid,
  admin_id uuid,
  player_id uuid,
  status text,
  relationship_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_relationship_id uuid;
  v_now timestamptz := now();
begin
  select
    admin_player_link_requests.id,
    admin_player_link_requests.admin_id,
    admin_player_link_requests.player_id,
    admin_player_link_requests.status
    into v_request
  from public.admin_player_link_requests
  where id = p_request_id
  for update;

  if not found or v_request.player_id <> p_player_id then
    raise exception 'REQUEST_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING:%', v_request.status
      using errcode = 'P0001';
  end if;

  insert into public.admin_player_relationships (admin_id, player_id)
  values (v_request.admin_id, v_request.player_id)
  on conflict (admin_id, player_id) do nothing
  returning id into v_relationship_id;

  if v_relationship_id is null then
    select id
      into v_relationship_id
    from public.admin_player_relationships
    where admin_player_relationships.admin_id = v_request.admin_id
      and admin_player_relationships.player_id = v_request.player_id
    limit 1;
  end if;

  update public.admin_player_link_requests
     set status = 'accepted',
         accepted_at = coalesce(accepted_at, v_now),
         accepted_by = p_player_id,
         updated_at = v_now
   where id = v_request.id;

  return query
  select
    v_request.id,
    v_request.admin_id,
    v_request.player_id,
    'accepted'::text,
    v_relationship_id;
end;
$$;

revoke all on function public.accept_admin_player_link_request(uuid, uuid) from public;
grant execute on function public.accept_admin_player_link_request(uuid, uuid) to service_role;
