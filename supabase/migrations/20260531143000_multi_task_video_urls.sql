alter table if exists public.task_templates
  add column if not exists video_urls jsonb;

alter table if exists public.activity_tasks
  add column if not exists video_urls jsonb;

alter table if exists public.external_event_tasks
  add column if not exists video_urls jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'task_templates'
      and column_name = 'video_url'
  ) then
    update public.task_templates
    set video_urls = jsonb_build_array(video_url)
    where video_urls is null
      and nullif(trim(video_url), '') is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_tasks'
      and column_name = 'video_url'
  ) then
    update public.activity_tasks
    set video_urls = jsonb_build_array(video_url)
    where video_urls is null
      and nullif(trim(video_url), '') is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'external_event_tasks'
      and column_name = 'video_url'
  ) then
    update public.external_event_tasks
    set video_urls = jsonb_build_array(video_url)
    where video_urls is null
      and nullif(trim(video_url), '') is not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_video_urls_array_chk'
      and conrelid = 'public.task_templates'::regclass
  ) then
    alter table public.task_templates
      add constraint task_templates_video_urls_array_chk
      check (video_urls is null or jsonb_typeof(video_urls) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'activity_tasks_video_urls_array_chk'
      and conrelid = 'public.activity_tasks'::regclass
  ) then
    alter table public.activity_tasks
      add constraint activity_tasks_video_urls_array_chk
      check (video_urls is null or jsonb_typeof(video_urls) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_event_tasks_video_urls_array_chk'
      and conrelid = 'public.external_event_tasks'::regclass
  ) then
    alter table public.external_event_tasks
      add constraint external_event_tasks_video_urls_array_chk
      check (video_urls is null or jsonb_typeof(video_urls) = 'array');
  end if;
end $$;
