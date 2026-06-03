alter table if exists public.activity_categories
  add column if not exists club_id uuid,
  add column if not exists source_category_id uuid;

do $$
begin
  if to_regclass('public.activity_categories') is not null and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activity_categories'::regclass
      and conname = 'activity_categories_club_id_fkey'
  ) then
    alter table public.activity_categories
      add constraint activity_categories_club_id_fkey
      foreign key (club_id)
      references public.clubs(id)
      on delete cascade;
  end if;

  if to_regclass('public.activity_categories') is not null and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.activity_categories'::regclass
      and conname = 'activity_categories_source_category_id_fkey'
  ) then
    alter table public.activity_categories
      add constraint activity_categories_source_category_id_fkey
      foreign key (source_category_id)
      references public.activity_categories(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_activity_categories_club_id
  on public.activity_categories (club_id);

create unique index if not exists activity_categories_user_source_category_uidx
  on public.activity_categories (user_id, source_category_id)
  where source_category_id is not null and user_id is not null;

create unique index if not exists activity_categories_club_source_name_uidx
  on public.activity_categories (club_id, lower(name))
  where club_id is not null and source_category_id is null;

create or replace function public.normalize_club_activity_category_name(
  p_name text
)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]*\(klub\)[[:space:]]*$', '', 'i')), '');
$$;

create or replace function public.club_activity_category_display_name(
  p_name text
)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(p_name, '')) ~* '\(klub\)[[:space:]]*$' then btrim(coalesce(p_name, ''))
    else btrim(coalesce(p_name, '')) || ' (klub)'
  end;
$$;

create or replace function public.is_club_activity_category_manager(
  p_club_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.is_platform_admin(p_user_id), false)
    or coalesce(public.is_club_admin(p_club_id, p_user_id), false);
$$;

create or replace function public.hide_system_activity_categories_for_user(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  with inserted as (
    insert into public.hidden_activity_categories (user_id, category_id)
    select p_user_id, ac.id
    from public.activity_categories ac
    where coalesce(ac.is_system, false) = true
    on conflict (user_id, category_id) do nothing
    returning 1
  )
  select count(*)::integer into v_count
  from inserted;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.should_initialize_club_member_categories(
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select p_user_id is not null
    and not exists (
      select 1
      from public.activity_categories ac
      where ac.user_id = p_user_id
        and coalesce(ac.is_system, false) = false
        and ac.source_category_id is null
    )
    and not exists (
      select 1
      from public.activities a
      where a.user_id = p_user_id
      limit 1
    )
    and not exists (
      select 1
      from public.task_templates tt
      where tt.user_id = p_user_id
      limit 1
    )
    and not exists (
      select 1
      from public.category_mappings cm
      where cm.user_id = p_user_id
      limit 1
    );
$$;

create or replace function public.sync_club_categories_to_member(
  p_club_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_club_id is null or p_user_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.club_members cm
    where cm.club_id = p_club_id
      and cm.user_id = p_user_id
      and cm.status = 'active'
  ) then
    return 0;
  end if;

  with source_categories as (
    select
      ac.id,
      ac.club_id,
      public.club_activity_category_display_name(ac.name) as display_name,
      ac.color,
      ac.emoji
    from public.activity_categories ac
    where ac.club_id = p_club_id
      and ac.source_category_id is null
  ),
  upserted as (
    insert into public.activity_categories (
      user_id,
      player_id,
      team_id,
      club_id,
      source_category_id,
      name,
      color,
      emoji,
      is_system
    )
    select
      p_user_id,
      null::uuid,
      null::uuid,
      source_categories.club_id,
      source_categories.id,
      source_categories.display_name,
      source_categories.color,
      source_categories.emoji,
      false
    from source_categories
    on conflict (user_id, source_category_id)
    where source_category_id is not null and user_id is not null
    do update
       set club_id = excluded.club_id,
           name = excluded.name,
           color = excluded.color,
           emoji = excluded.emoji,
           is_system = false,
           updated_at = now()
    returning 1
  )
  select count(*)::integer into v_count
  from upserted;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.sync_club_category_to_members(
  p_source_category_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source record;
  v_count integer := 0;
begin
  if p_source_category_id is null then
    return 0;
  end if;

  select
    ac.id,
    ac.club_id,
    public.club_activity_category_display_name(ac.name) as display_name,
    ac.color,
    ac.emoji
  into v_source
  from public.activity_categories ac
  where ac.id = p_source_category_id
    and ac.club_id is not null
    and ac.source_category_id is null;

  if not found then
    return 0;
  end if;

  delete from public.activity_categories copy
  where copy.source_category_id = v_source.id
    and copy.club_id = v_source.club_id
    and not exists (
      select 1
      from public.club_members cm
      where cm.club_id = v_source.club_id
        and cm.user_id = copy.user_id
        and cm.status = 'active'
    );

  with active_members as (
    select cm.user_id
    from public.club_members cm
    where cm.club_id = v_source.club_id
      and cm.status = 'active'
  ),
  upserted as (
    insert into public.activity_categories (
      user_id,
      player_id,
      team_id,
      club_id,
      source_category_id,
      name,
      color,
      emoji,
      is_system
    )
    select
      active_members.user_id,
      null::uuid,
      null::uuid,
      v_source.club_id,
      v_source.id,
      v_source.display_name,
      v_source.color,
      v_source.emoji,
      false
    from active_members
    on conflict (user_id, source_category_id)
    where source_category_id is not null and user_id is not null
    do update
       set club_id = excluded.club_id,
           name = excluded.name,
           color = excluded.color,
           emoji = excluded.emoji,
           is_system = false,
           updated_at = now()
    returning 1
  )
  select count(*)::integer into v_count
  from upserted;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.prepare_club_member_activity_categories(
  p_club_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hidden_count integer := 0;
  v_synced_count integer := 0;
begin
  if public.should_initialize_club_member_categories(p_user_id) then
    v_hidden_count := public.hide_system_activity_categories_for_user(p_user_id);
  end if;

  v_synced_count := public.sync_club_categories_to_member(p_club_id, p_user_id);

  return jsonb_build_object(
    'hiddenSystemCategories', v_hidden_count,
    'syncedClubCategories', v_synced_count
  );
end;
$$;

create or replace function public.sync_club_category_copies_on_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.activity_categories copy
    where copy.club_id = old.club_id
      and copy.user_id = old.user_id
      and copy.source_category_id is not null
      and exists (
        select 1
        from public.activity_categories source
        where source.id = copy.source_category_id
          and source.club_id = old.club_id
          and source.source_category_id is null
      );
    return old;
  end if;

  if new.status = 'active' then
    perform public.prepare_club_member_activity_categories(new.club_id, new.user_id);
  else
    delete from public.activity_categories copy
    where copy.club_id = new.club_id
      and copy.user_id = new.user_id
      and copy.source_category_id is not null
      and exists (
        select 1
        from public.activity_categories source
        where source.id = copy.source_category_id
          and source.club_id = new.club_id
          and source.source_category_id is null
      );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_club_category_copies_on_member_change on public.club_members;

create trigger sync_club_category_copies_on_member_change
  after insert or update or delete on public.club_members
  for each row
  execute function public.sync_club_category_copies_on_member_change();

create or replace function public.sync_assigned_category_copies_from_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is null or new.source_category_id is not null then
    return new;
  end if;

  if new.name is not distinct from old.name
     and new.color is not distinct from old.color
     and new.emoji is not distinct from old.emoji then
    return new;
  end if;

  update public.activity_categories assigned
     set name = case
           when new.club_id is not null
             then public.club_activity_category_display_name(new.name)
           else new.name || ' (fra træner)'
         end,
         color = new.color,
         emoji = new.emoji,
         club_id = coalesce(assigned.club_id, new.club_id),
         updated_at = now()
   where assigned.source_category_id = new.id;

  return new;
end;
$$;

create or replace function public.get_club_activity_category_payload(
  p_category_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category public.activity_categories%rowtype;
  v_copy_count integer := 0;
begin
  select *
    into v_category
  from public.activity_categories ac
  where ac.id = p_category_id
    and ac.club_id is not null
    and ac.source_category_id is null;

  if not found then
    return null;
  end if;

  select count(*)::integer
    into v_copy_count
  from public.activity_categories copy
  where copy.source_category_id = v_category.id
    and copy.club_id = v_category.club_id;

  return jsonb_build_object(
    'id', v_category.id,
    'clubId', v_category.club_id,
    'name', v_category.name,
    'displayName', public.club_activity_category_display_name(v_category.name),
    'color', v_category.color,
    'emoji', v_category.emoji,
    'memberCopyCount', v_copy_count,
    'createdAt', v_category.created_at,
    'updatedAt', v_category.updated_at
  );
end;
$$;

create or replace function public.list_club_activity_categories(
  p_actor_user_id uuid,
  p_club_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categories jsonb := '[]'::jsonb;
begin
  if p_actor_user_id is null or p_club_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not exists (select 1 from public.clubs c where c.id = p_club_id) then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if not (
    coalesce(public.is_platform_admin(p_actor_user_id), false)
    or coalesce(public.is_club_member(p_club_id, p_actor_user_id), false)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(public.get_club_activity_category_payload(ac.id) order by lower(ac.name)), '[]'::jsonb)
    into v_categories
  from public.activity_categories ac
  where ac.club_id = p_club_id
    and ac.source_category_id is null;

  return jsonb_build_object(
    'clubId', p_club_id,
    'categories', v_categories
  );
end;
$$;

create or replace function public.create_club_activity_category(
  p_actor_user_id uuid,
  p_club_id uuid,
  p_name text,
  p_color text default '#4ECDC4',
  p_emoji text default '⚽'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := public.normalize_club_activity_category_name(p_name);
  v_color text := nullif(btrim(coalesce(p_color, '')), '');
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_category public.activity_categories%rowtype;
begin
  if p_actor_user_id is null or p_club_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not exists (select 1 from public.clubs c where c.id = p_club_id) then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if not public.is_club_activity_category_manager(p_club_id, p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_name is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from public.activity_categories ac
    where ac.club_id = p_club_id
      and ac.source_category_id is null
      and lower(ac.name) = lower(v_name)
  ) then
    raise exception 'CLUB_CATEGORY_ALREADY_EXISTS';
  end if;

  insert into public.activity_categories (
    user_id,
    player_id,
    team_id,
    club_id,
    source_category_id,
    name,
    color,
    emoji,
    is_system
  )
  values (
    null,
    null,
    null,
    p_club_id,
    null,
    v_name,
    coalesce(v_color, '#4ECDC4'),
    coalesce(v_emoji, '⚽'),
    false
  )
  returning *
    into v_category;

  perform public.sync_club_category_to_members(v_category.id);

  return public.get_club_activity_category_payload(v_category.id);
end;
$$;

create or replace function public.update_club_activity_category(
  p_actor_user_id uuid,
  p_category_id uuid,
  p_name text,
  p_color text default '#4ECDC4',
  p_emoji text default '⚽'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.activity_categories%rowtype;
  v_name text := public.normalize_club_activity_category_name(p_name);
  v_color text := nullif(btrim(coalesce(p_color, '')), '');
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_category public.activity_categories%rowtype;
begin
  if p_actor_user_id is null or p_category_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select *
    into v_existing
  from public.activity_categories ac
  where ac.id = p_category_id
    and ac.club_id is not null
    and ac.source_category_id is null;

  if not found then
    raise exception 'CLUB_CATEGORY_NOT_FOUND';
  end if;

  if not public.is_club_activity_category_manager(v_existing.club_id, p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_name is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from public.activity_categories ac
    where ac.club_id = v_existing.club_id
      and ac.source_category_id is null
      and ac.id <> v_existing.id
      and lower(ac.name) = lower(v_name)
  ) then
    raise exception 'CLUB_CATEGORY_ALREADY_EXISTS';
  end if;

  update public.activity_categories
     set name = v_name,
         color = coalesce(v_color, '#4ECDC4'),
         emoji = coalesce(v_emoji, '⚽'),
         updated_at = now()
   where id = v_existing.id
   returning *
    into v_category;

  perform public.sync_club_category_to_members(v_category.id);

  return public.get_club_activity_category_payload(v_category.id);
end;
$$;

create or replace function public.delete_club_activity_category(
  p_actor_user_id uuid,
  p_category_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.activity_categories%rowtype;
begin
  if p_actor_user_id is null or p_category_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select *
    into v_existing
  from public.activity_categories ac
  where ac.id = p_category_id
    and ac.club_id is not null
    and ac.source_category_id is null;

  if not found then
    raise exception 'CLUB_CATEGORY_NOT_FOUND';
  end if;

  if not public.is_club_activity_category_manager(v_existing.club_id, p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.activity_categories copy
  where copy.source_category_id = v_existing.id
    and copy.club_id = v_existing.club_id;

  delete from public.activity_categories
  where id = v_existing.id;

  return jsonb_build_object(
    'clubId', v_existing.club_id,
    'categoryId', v_existing.id,
    'deleted', true
  );
end;
$$;

revoke all on function public.is_club_activity_category_manager(uuid, uuid) from public;
grant execute on function public.is_club_activity_category_manager(uuid, uuid) to authenticated;

revoke all on function public.hide_system_activity_categories_for_user(uuid) from public;
grant execute on function public.hide_system_activity_categories_for_user(uuid) to service_role;

revoke all on function public.should_initialize_club_member_categories(uuid) from public;
grant execute on function public.should_initialize_club_member_categories(uuid) to service_role;

revoke all on function public.sync_club_categories_to_member(uuid, uuid) from public;
grant execute on function public.sync_club_categories_to_member(uuid, uuid) to service_role;

revoke all on function public.sync_club_category_to_members(uuid) from public;
grant execute on function public.sync_club_category_to_members(uuid) to service_role;

revoke all on function public.prepare_club_member_activity_categories(uuid, uuid) from public;
grant execute on function public.prepare_club_member_activity_categories(uuid, uuid) to service_role;

revoke all on function public.get_club_activity_category_payload(uuid) from public;
grant execute on function public.get_club_activity_category_payload(uuid) to service_role;

revoke all on function public.list_club_activity_categories(uuid, uuid) from public;
grant execute on function public.list_club_activity_categories(uuid, uuid) to service_role;

revoke all on function public.create_club_activity_category(uuid, uuid, text, text, text) from public;
grant execute on function public.create_club_activity_category(uuid, uuid, text, text, text) to service_role;

revoke all on function public.update_club_activity_category(uuid, uuid, text, text, text) from public;
grant execute on function public.update_club_activity_category(uuid, uuid, text, text, text) to service_role;

revoke all on function public.delete_club_activity_category(uuid, uuid) from public;
grant execute on function public.delete_club_activity_category(uuid, uuid) to service_role;
