-- Issue #287: owner-scoped bulk assignment, audit and safe rollback.

alter table if exists public.activities
  add column if not exists assignment_owner_account_id uuid null references public.owner_accounts(id) on delete set null;

alter table if exists public.exercise_assignments
  add column if not exists owner_account_id uuid null references public.owner_accounts(id) on delete set null;

do $hidden_task_template_fk$
begin
  if to_regclass('public.hidden_task_templates') is not null
     and not exists (
       select 1
       from pg_constraint constraint_row
       where constraint_row.conname = 'hidden_task_templates_task_template_id_fkey'
         and constraint_row.conrelid = 'public.hidden_task_templates'::regclass
     ) then
    alter table public.hidden_task_templates
      add constraint hidden_task_templates_task_template_id_fkey
      foreign key (task_template_id)
      references public.task_templates(id)
      on delete cascade
      not valid;
  end if;
end;
$hidden_task_template_fk$;

create unique index if not exists activities_owner_source_player_assignment_uidx
  on public.activities (assignment_owner_account_id, source_activity_id, user_id)
  where assignment_owner_account_id is not null and source_activity_id is not null;

create unique index if not exists exercise_assignments_owner_exercise_player_uidx
  on public.exercise_assignments (owner_account_id, exercise_id, player_id)
  where owner_account_id is not null and player_id is not null;

create index if not exists exercise_assignments_owner_idx
  on public.exercise_assignments (owner_account_id, exercise_id);

create or replace function public.guard_owner_assignment_provenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $guard_owner_assignment_provenance$
declare
  v_old_owner_account_id uuid;
  v_new_owner_account_id uuid;
begin
  if tg_table_name = 'activities' then
    v_old_owner_account_id := case when tg_op = 'INSERT' then null else old.assignment_owner_account_id end;
    v_new_owner_account_id := new.assignment_owner_account_id;
  else
    v_old_owner_account_id := case when tg_op = 'INSERT' then null else old.owner_account_id end;
    v_new_owner_account_id := new.owner_account_id;
  end if;

  if v_new_owner_account_id is distinct from v_old_owner_account_id
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Owner assignment provenance can only be set by a server-side flow.'
      using errcode = '42501';
  end if;
  return new;
end;
$guard_owner_assignment_provenance$;

drop trigger if exists guard_activity_assignment_owner_provenance on public.activities;
create trigger guard_activity_assignment_owner_provenance
before insert or update of assignment_owner_account_id on public.activities
for each row execute function public.guard_owner_assignment_provenance();

drop trigger if exists guard_exercise_assignment_owner_provenance on public.exercise_assignments;
create trigger guard_exercise_assignment_owner_provenance
before insert or update of owner_account_id on public.exercise_assignments
for each row execute function public.guard_owner_assignment_provenance();

create table if not exists public.training_template_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  template_id uuid not null,
  template_version_id uuid not null,
  player_id uuid not null references auth.users(id) on delete cascade,
  source_team_id uuid null references public.teams(id) on delete set null,
  start_date date not null,
  status text not null default 'active',
  snapshot jsonb not null default '{}'::jsonb,
  materialized_task_ids uuid[] not null default '{}'::uuid[],
  materialized_activity_ids uuid[] not null default '{}'::uuid[],
  assigned_by uuid null references auth.users(id) on delete set null,
  removed_by uuid null references auth.users(id) on delete set null,
  removed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_template_assignments_owner_id_unique unique (owner_account_id, id),
  constraint training_template_assignments_template_fkey
    foreign key (owner_account_id, template_id)
    references public.training_templates(owner_account_id, id)
    on delete restrict,
  constraint training_template_assignments_version_fkey
    foreign key (owner_account_id, template_version_id)
    references public.template_versions(owner_account_id, id)
    on delete restrict,
  constraint training_template_assignments_status_check
    check (status in ('active', 'removed')),
  constraint training_template_assignments_snapshot_object_check
    check (jsonb_typeof(snapshot) = 'object')
);

create unique index if not exists training_template_assignments_active_key
  on public.training_template_assignments (owner_account_id, template_id, player_id, start_date)
  where status = 'active';

create index if not exists training_template_assignments_player_idx
  on public.training_template_assignments (player_id, status, start_date);

create index if not exists training_template_assignments_owner_template_idx
  on public.training_template_assignments (owner_account_id, template_id, status, updated_at desc);

create table if not exists public.assignment_batches (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  requested_by uuid not null,
  operation text not null,
  content_type text not null,
  content_id uuid not null,
  target_batch_id uuid null references public.assignment_batches(id) on delete set null,
  idempotency_key text null,
  canonical_request_hash text not null,
  recipient_fingerprint text not null,
  request_payload jsonb not null default '{}'::jsonb,
  status text not null default 'applying',
  summary jsonb not null default '{}'::jsonb,
  applied_at timestamptz null,
  rollback_idempotency_key text null,
  rollback_requested_by uuid null,
  rolled_back_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_batches_owner_id_unique unique (owner_account_id, id),
  constraint assignment_batches_operation_check check (operation in ('assign', 'update', 'remove')),
  constraint assignment_batches_content_type_check
    check (content_type in ('activity', 'exercise', 'training_template', 'program')),
  constraint assignment_batches_status_check
    check (status in ('applying', 'applied', 'partially_applied', 'failed', 'rolled_back', 'partially_rolled_back')),
  constraint assignment_batches_idempotency_key_check
    check (idempotency_key is null or char_length(idempotency_key) between 8 and 200),
  constraint assignment_batches_rollback_idempotency_key_check
    check (rollback_idempotency_key is null or char_length(rollback_idempotency_key) between 8 and 200),
  constraint assignment_batches_request_payload_object_check check (jsonb_typeof(request_payload) = 'object'),
  constraint assignment_batches_summary_object_check check (jsonb_typeof(summary) = 'object')
);

create unique index if not exists assignment_batches_owner_actor_idempotency_key
  on public.assignment_batches (owner_account_id, requested_by, idempotency_key)
  where idempotency_key is not null;

create index if not exists assignment_batches_owner_created_idx
  on public.assignment_batches (owner_account_id, created_at desc);

create index if not exists assignment_batches_content_idx
  on public.assignment_batches (owner_account_id, content_type, content_id, created_at desc);

create table if not exists public.assignment_batch_items (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  batch_id uuid not null,
  player_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  target_type text null,
  target_id uuid null,
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  materialized_target_ids jsonb not null default '{}'::jsonb,
  reason_code text null,
  message text null,
  rollback_status text not null default 'not_requested',
  rollback_reason_code text null,
  rollback_message text null,
  rolled_back_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_batch_items_batch_fkey
    foreign key (owner_account_id, batch_id)
    references public.assignment_batches(owner_account_id, id)
    on delete cascade,
  constraint assignment_batch_items_batch_player_key unique (batch_id, player_id),
  constraint assignment_batch_items_status_check
    check (status in ('created', 'updated', 'removed', 'duplicate', 'conflict', 'skipped', 'failed')),
  constraint assignment_batch_items_target_type_check
    check (
      target_type is null
      or target_type in ('activity', 'exercise_assignment', 'training_template_assignment', 'program_enrollment')
    ),
  constraint assignment_batch_items_rollback_status_check
    check (rollback_status in ('not_requested', 'eligible', 'rolled_back', 'conflict', 'not_applicable')),
  constraint assignment_batch_items_before_snapshot_object_check
    check (before_snapshot is null or jsonb_typeof(before_snapshot) = 'object'),
  constraint assignment_batch_items_after_snapshot_object_check
    check (after_snapshot is null or jsonb_typeof(after_snapshot) = 'object'),
  constraint assignment_batch_items_materialized_target_ids_object_check
    check (jsonb_typeof(materialized_target_ids) = 'object')
);

create index if not exists assignment_batch_items_batch_status_idx
  on public.assignment_batch_items (batch_id, status, created_at);

create index if not exists assignment_batch_items_target_idx
  on public.assignment_batch_items (target_type, target_id)
  where target_id is not null;

create index if not exists assignment_batch_items_player_idx
  on public.assignment_batch_items (owner_account_id, player_id, created_at desc);

drop trigger if exists update_training_template_assignments_updated_at on public.training_template_assignments;
create trigger update_training_template_assignments_updated_at
before update on public.training_template_assignments
for each row execute function public.trigger_update_timestamp();

drop trigger if exists update_assignment_batches_updated_at on public.assignment_batches;
create trigger update_assignment_batches_updated_at
before update on public.assignment_batches
for each row execute function public.trigger_update_timestamp();

drop trigger if exists update_assignment_batch_items_updated_at on public.assignment_batch_items;
create trigger update_assignment_batch_items_updated_at
before update on public.assignment_batch_items
for each row execute function public.trigger_update_timestamp();

alter table public.training_template_assignments enable row level security;
alter table public.assignment_batches enable row level security;
alter table public.assignment_batch_items enable row level security;

drop policy if exists "Owner coaches read training template assignments" on public.training_template_assignments;
create policy "Owner coaches read training template assignments"
  on public.training_template_assignments
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Players read own training template assignments" on public.training_template_assignments;
create policy "Players read own training template assignments"
  on public.training_template_assignments
  for select
  to authenticated
  using (player_id = (select auth.uid()));

drop policy if exists "Owner coaches read assignment batches" on public.assignment_batches;
create policy "Owner coaches read assignment batches"
  on public.assignment_batches
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches read assignment batch items" on public.assignment_batch_items;
create policy "Owner coaches read assignment batch items"
  on public.assignment_batch_items
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

revoke all on public.training_template_assignments, public.assignment_batches, public.assignment_batch_items from anon;
revoke insert, update, delete on public.training_template_assignments, public.assignment_batches, public.assignment_batch_items from authenticated;

grant select on public.training_template_assignments, public.assignment_batches, public.assignment_batch_items to authenticated;
grant all on public.training_template_assignments, public.assignment_batches, public.assignment_batch_items to service_role;

comment on table public.training_template_assignments is
  'Stable owner-scoped assignments of immutable training template versions. Materialized legacy task/activity IDs keep the existing player experience working.';

comment on table public.assignment_batches is
  'Idempotent owner-scoped bulk assignment command and audit header. Cross-user writes are performed by service-role-only RPCs.';

comment on table public.assignment_batch_items is
  'Per-player bulk assignment audit rows with before/after snapshots used for conservative rollback.';

create or replace function public.owner_bulk_snapshot_activity(
  p_activity_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'activity', to_jsonb(activity),
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'task', to_jsonb(activity_task),
          'subtasks', coalesce((
            select jsonb_agg(to_jsonb(subtask) order by subtask.sort_order, subtask.created_at, subtask.id)
            from public.activity_task_subtasks subtask
            where subtask.activity_task_id = activity_task.id
          ), '[]'::jsonb)
        )
        order by activity_task.created_at, activity_task.id
      )
      from public.activity_tasks activity_task
      where activity_task.activity_id = activity.id
    ), '[]'::jsonb)
  )
  from public.activities activity
  where activity.id = p_activity_id;
$$;

create or replace function public.owner_bulk_activity_started(
  p_activity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.activity_tasks activity_task
      where activity_task.activity_id = p_activity_id
        and activity_task.completed is true
    )
    or exists (
      select 1
      from public.activity_tasks activity_task
      join public.activity_task_subtasks subtask
        on subtask.activity_task_id = activity_task.id
      where activity_task.activity_id = p_activity_id
        and subtask.completed is true
    )
    or exists (
      select 1
      from public.training_reflections reflection
      where reflection.activity_id = p_activity_id
        and (reflection.rating is not null or nullif(btrim(reflection.note), '') is not null)
    )
    or exists (
      select 1
      from public.task_template_self_feedback self_feedback
      where self_feedback.activity_id = p_activity_id
    )
    or exists (
      select 1
      from public.trainer_activity_feedback trainer_feedback
      where trainer_feedback.activity_context_type = 'internal'
        and trainer_feedback.activity_context_id = p_activity_id
    )
    or exists (
      select 1
      from public.activities dependent_activity
      where dependent_activity.source_activity_id = p_activity_id
    )
    or exists (
      select 1
      from public.activity_assignment_team_exclusions exclusion
      where exclusion.source_activity_id = p_activity_id
    );
$$;

create or replace function public.owner_bulk_program_started(
  p_enrollment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce((
      select enrollment.status in ('completed', 'cancelled')
      from public.program_enrollments enrollment
      where enrollment.id = p_enrollment_id
    ), true)
    or exists (
      select 1
      from public.program_enrollment_items item
      where item.enrollment_id = p_enrollment_id
        and item.status <> 'upcoming'
    )
    or exists (
      select 1
      from public.program_enrollment_items item
      join public.tasks task on task.id = item.task_id
      where item.enrollment_id = p_enrollment_id
        and task.completed is true
    )
    or exists (
      select 1
      from public.program_enrollment_items item
      where item.enrollment_id = p_enrollment_id
        and item.activity_id is not null
        and public.owner_bulk_activity_started(item.activity_id)
    );
$$;

create or replace function public.owner_bulk_template_assignment_started(
  p_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      exists (
        select 1
        from public.tasks task
        where task.id = any(assignment.materialized_task_ids)
          and task.completed is true
      )
      or exists (
        select 1
        from unnest(assignment.materialized_activity_ids) activity_id
        where public.owner_bulk_activity_started(activity_id)
      )
    from public.training_template_assignments assignment
    where assignment.id = p_assignment_id
  ), true);
$$;

create or replace function public.owner_bulk_snapshot_template_assignment(
  p_assignment_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'assignment', to_jsonb(assignment),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(task) order by task.id)
      from public.tasks task
      where task.id = any(assignment.materialized_task_ids)
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(public.owner_bulk_snapshot_activity(activity_id) order by activity_id)
      from unnest(assignment.materialized_activity_ids) activity_id
    ), '[]'::jsonb)
  )
  from public.training_template_assignments assignment
  where assignment.id = p_assignment_id;
$$;

create or replace function public.owner_bulk_snapshot_program_enrollment(
  p_enrollment_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'enrollment', to_jsonb(enrollment),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'item', to_jsonb(item),
          'task', case when task.id is null then null else to_jsonb(task) end,
          'activity', case when item.activity_id is null then null else public.owner_bulk_snapshot_activity(item.activity_id) end
        )
        order by item.scheduled_date, item.program_item_id, item.id
      )
      from public.program_enrollment_items item
      left join public.tasks task on task.id = item.task_id
      where item.enrollment_id = enrollment.id
    ), '[]'::jsonb)
  )
  from public.program_enrollments enrollment
  where enrollment.id = p_enrollment_id;
$$;

create or replace function public.owner_bulk_snapshot_exercise_assignment(
  p_assignment_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'assignment', to_jsonb(assignment),
    'taskTemplate', case when task_template.id is null then null else to_jsonb(task_template) end,
    'taskTemplateSubtasks', case when task_template.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(subtask) order by subtask.sort_order, subtask.created_at, subtask.id)
      from public.task_template_subtasks subtask
      where subtask.task_template_id = task_template.id
    ), '[]'::jsonb) end
  )
  from public.exercise_assignments assignment
  left join lateral (
    select candidate.*
    from public.task_templates candidate
    where candidate.user_id = assignment.trainer_id
      and candidate.player_id = assignment.player_id
      and candidate.team_id is null
      and candidate.library_exercise_id = assignment.exercise_id
    order by candidate.created_at, candidate.id
    limit 1
  ) task_template on true
  where assignment.id = p_assignment_id;
$$;

create or replace function public.owner_bulk_target_state_hashes(
  p_content_type text,
  p_target_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_object_agg(
      target_id::text,
      md5((case p_content_type
          when 'activity' then public.owner_bulk_snapshot_activity(target_id)
          when 'exercise' then public.owner_bulk_snapshot_exercise_assignment(target_id)
          when 'training_template' then public.owner_bulk_snapshot_template_assignment(target_id)
          when 'program' then public.owner_bulk_snapshot_program_enrollment(target_id)
          else null
        end)::text)
      order by target_id
    ) filter (where target_id is not null),
    '{}'::jsonb
  )
  from unnest(coalesce(p_target_ids, '{}'::uuid[])) target_id;
$$;

create or replace function public.owner_bulk_source_state_hash(
  p_owner_account_id uuid,
  p_content_type text,
  p_content_id uuid,
  p_program_version_id uuid default null,
  p_template_version_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $source_state_hash$
declare
  v_state jsonb;
begin
  if p_content_type = 'activity' then
    v_state := public.owner_bulk_snapshot_activity(p_content_id);
  elsif p_content_type = 'exercise' then
    select to_jsonb(exercise) into v_state
    from public.exercise_library exercise
    where exercise.id = p_content_id;
  elsif p_content_type = 'training_template' then
    select jsonb_build_object(
      'template', to_jsonb(template),
      'version', to_jsonb(version),
      'linkedVersions', coalesce((
        select jsonb_agg(
          jsonb_build_object('template', to_jsonb(linked_template), 'version', to_jsonb(linked_version))
          order by linked_template.id
        )
        from jsonb_array_elements(coalesce(version.snapshot -> 'items', '[]'::jsonb)) item
        join public.training_templates linked_template
          on linked_template.owner_account_id = p_owner_account_id
         and linked_template.id::text = item ->> 'linkedTemplateId'
         and linked_template.status = 'active'
        join public.template_versions linked_version
          on linked_version.owner_account_id = linked_template.owner_account_id
         and linked_version.template_id = linked_template.id
         and linked_version.id = linked_template.active_version_id
        where item ->> 'itemType' = 'session_template'
      ), '[]'::jsonb)
    ) into v_state
    from public.training_templates template
    join public.template_versions version
      on version.owner_account_id = template.owner_account_id
     and version.template_id = template.id
     and version.id = p_template_version_id
    where template.owner_account_id = p_owner_account_id
      and template.id = p_content_id
      and template.active_version_id = version.id;
  elsif p_content_type = 'program' then
    select jsonb_build_object(
      'program', to_jsonb(program),
      'version', to_jsonb(version),
      'templateVersions', coalesce((
        select jsonb_agg(
          jsonb_build_object('template', to_jsonb(template), 'version', to_jsonb(template_version))
          order by template.id
        )
        from (
          select distinct item ->> 'training_template_id' as template_id
          from jsonb_array_elements(coalesce(version.snapshot -> 'items', '[]'::jsonb)) item
          where nullif(item ->> 'training_template_id', '') is not null
        ) required
        join public.training_templates template
          on template.owner_account_id = p_owner_account_id
         and template.id::text = required.template_id
         and template.status = 'active'
        join public.template_versions template_version
          on template_version.owner_account_id = template.owner_account_id
         and template_version.template_id = template.id
         and template_version.id = template.active_version_id
      ), '[]'::jsonb)
    ) into v_state
    from public.training_programs program
    join public.program_versions version
      on version.owner_account_id = program.owner_account_id
     and version.program_id = program.id
     and version.id = p_program_version_id
    where program.owner_account_id = p_owner_account_id
      and program.id = p_content_id
      and program.published_version = version.version_number;
  end if;

  if p_content_type in ('training_template', 'program') and v_state is not null then
    v_state := v_state || jsonb_build_object(
      'taskTemplateSubtasks', coalesce((
        select jsonb_agg(to_jsonb(subtask) order by subtask.task_template_id, subtask.sort_order, subtask.created_at, subtask.id)
        from public.task_template_subtasks subtask
        where subtask.task_template_id::text in (
          select distinct referenced.value #>> '{}'
          from jsonb_path_query(v_state, '$.**.snapshot') version_snapshot(value)
          cross join lateral jsonb_path_query(
            version_snapshot.value,
            '$.**.sourceTaskTemplateId'
          ) referenced(value)
          where jsonb_typeof(version_snapshot.value) = 'object'
            and coalesce((version_snapshot.value ->> 'taskTemplateSubtasksCaptured')::boolean, false) is false
            and jsonb_typeof(version_snapshot.value #> '{enrollmentMaterialization,templates}') is distinct from 'object'
            and jsonb_typeof(referenced.value) = 'string'
        )
      ), '[]'::jsonb)
    );
  end if;

  return case when v_state is null then null else md5(v_state::text) end;
end;
$source_state_hash$;

create or replace function public.owner_bulk_lock_source_state(
  p_owner_account_id uuid,
  p_content_type text,
  p_content_id uuid,
  p_program_version_id uuid default null,
  p_template_version_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $lock_source_state$
declare
  v_snapshot_bundle jsonb := '[]'::jsonb;
begin
  if p_content_type = 'activity' then
    perform 1
    from public.activities activity
    where activity.id = p_content_id
    for update;

    perform 1
    from public.activity_tasks task
    where task.activity_id = p_content_id
    order by task.id
    for update;

    perform 1
    from public.activity_task_subtasks subtask
    join public.activity_tasks task on task.id = subtask.activity_task_id
    where task.activity_id = p_content_id
    order by subtask.id
    for update of subtask;
  elsif p_content_type = 'exercise' then
    perform 1
    from public.exercise_library exercise
    where exercise.id = p_content_id
    for update;
  elsif p_content_type = 'training_template' then
    -- Lock the root and every linked template in UUID order. Locking the
    -- template parents first freezes status/active_version_id while their
    -- immutable version snapshots are selected below.
    perform template.id
    from public.training_templates template
    where template.owner_account_id = p_owner_account_id
      and (
        template.id = p_content_id
        or template.id::text in (
          select distinct item ->> 'linkedTemplateId'
          from public.template_versions root_version
          cross join lateral jsonb_array_elements(
            coalesce(root_version.snapshot -> 'items', '[]'::jsonb)
          ) item
          where root_version.owner_account_id = p_owner_account_id
            and root_version.id = p_template_version_id
            and item ->> 'itemType' = 'session_template'
            and nullif(item ->> 'linkedTemplateId', '') is not null
        )
      )
    order by template.id
    for update;

    perform version.id
    from public.template_versions version
    where version.owner_account_id = p_owner_account_id
      and (
        version.id = p_template_version_id
        or version.id in (
          select template.active_version_id
          from public.training_templates template
          where template.owner_account_id = p_owner_account_id
            and template.status = 'active'
            and template.id::text in (
              select distinct item ->> 'linkedTemplateId'
              from public.template_versions root_version
              cross join lateral jsonb_array_elements(
                coalesce(root_version.snapshot -> 'items', '[]'::jsonb)
              ) item
              where root_version.owner_account_id = p_owner_account_id
                and root_version.id = p_template_version_id
                and item ->> 'itemType' = 'session_template'
                and nullif(item ->> 'linkedTemplateId', '') is not null
            )
        )
      )
    order by version.id
    for update;

    select coalesce(jsonb_agg(version.snapshot order by version.id), '[]'::jsonb)
    into v_snapshot_bundle
    from public.template_versions version
    where version.owner_account_id = p_owner_account_id
      and (
        version.id = p_template_version_id
        or version.id in (
          select template.active_version_id
          from public.training_templates template
          where template.owner_account_id = p_owner_account_id
            and template.status = 'active'
            and template.id::text in (
              select distinct item ->> 'linkedTemplateId'
              from public.template_versions root_version
              cross join lateral jsonb_array_elements(
                coalesce(root_version.snapshot -> 'items', '[]'::jsonb)
              ) item
              where root_version.owner_account_id = p_owner_account_id
                and root_version.id = p_template_version_id
                and item ->> 'itemType' = 'session_template'
            )
        )
      );
  elsif p_content_type = 'program' then
    perform program.id
    from public.training_programs program
    where program.owner_account_id = p_owner_account_id
      and program.id = p_content_id
    for update;

    perform version.id
    from public.program_versions version
    where version.owner_account_id = p_owner_account_id
      and version.id = p_program_version_id
    for update;

    perform template.id
    from public.training_templates template
    where template.owner_account_id = p_owner_account_id
      and template.id::text in (
        select distinct item ->> 'training_template_id'
        from public.program_versions root_version
        cross join lateral jsonb_array_elements(
          coalesce(root_version.snapshot -> 'items', '[]'::jsonb)
        ) item
        where root_version.owner_account_id = p_owner_account_id
          and root_version.id = p_program_version_id
          and nullif(item ->> 'training_template_id', '') is not null
      )
    order by template.id
    for update;

    perform version.id
    from public.template_versions version
    where version.owner_account_id = p_owner_account_id
      and version.id in (
        select template.active_version_id
        from public.training_templates template
        where template.owner_account_id = p_owner_account_id
          and template.status = 'active'
          and template.id::text in (
            select distinct item ->> 'training_template_id'
            from public.program_versions root_version
            cross join lateral jsonb_array_elements(
              coalesce(root_version.snapshot -> 'items', '[]'::jsonb)
            ) item
            where root_version.owner_account_id = p_owner_account_id
              and root_version.id = p_program_version_id
              and nullif(item ->> 'training_template_id', '') is not null
          )
      )
    order by version.id
    for update;

    select jsonb_build_array(root_version.snapshot) || coalesce((
      select jsonb_agg(version.snapshot order by version.id)
      from public.template_versions version
      where version.owner_account_id = p_owner_account_id
        and version.id in (
          select template.active_version_id
          from public.training_templates template
          where template.owner_account_id = p_owner_account_id
            and template.status = 'active'
            and template.id::text in (
              select distinct item ->> 'training_template_id'
              from jsonb_array_elements(
                coalesce(root_version.snapshot -> 'items', '[]'::jsonb)
              ) item
              where nullif(item ->> 'training_template_id', '') is not null
            )
        )
    ), '[]'::jsonb)
    into v_snapshot_bundle
    from public.program_versions root_version
    where root_version.owner_account_id = p_owner_account_id
      and root_version.id = p_program_version_id;
  end if;

  if p_content_type in ('training_template', 'program') then
    -- Lock every referenced parent against deletion. For legacy snapshots,
    -- the parent lock also conflicts with FK key-share for new subtask inserts;
    -- existing legacy children are locked against update/delete below.
    perform template.id
    from public.task_templates template
    where template.id::text in (
      select distinct referenced.value #>> '{}'
      from jsonb_array_elements(v_snapshot_bundle) version_snapshot(value)
      cross join lateral jsonb_path_query(
        version_snapshot.value,
        '$.**.sourceTaskTemplateId'
      ) referenced(value)
      where jsonb_typeof(referenced.value) = 'string'
    )
    order by template.id
    for update;

    perform subtask.id
    from public.task_template_subtasks subtask
    where subtask.task_template_id::text in (
      select distinct referenced.value #>> '{}'
      from jsonb_array_elements(v_snapshot_bundle) version_snapshot(value)
      cross join lateral jsonb_path_query(
        version_snapshot.value,
        '$.**.sourceTaskTemplateId'
      ) referenced(value)
      where coalesce((version_snapshot.value ->> 'taskTemplateSubtasksCaptured')::boolean, false) is false
        and jsonb_typeof(version_snapshot.value #> '{enrollmentMaterialization,templates}') is distinct from 'object'
        and jsonb_typeof(referenced.value) = 'string'
    )
    order by subtask.task_template_id, subtask.sort_order, subtask.created_at, subtask.id
    for update;
  end if;
end;
$lock_source_state$;

create or replace function public.owner_bulk_lock_target_state(
  p_content_type text,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $lock_target_state$
declare
  v_exercise_assignment public.exercise_assignments%rowtype;
  v_template_assignment public.training_template_assignments%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_activity_id uuid;
  v_task_template_id uuid;
begin
  if p_content_type = 'activity' then
    perform 1 from public.activities where id = p_target_id for update;
    perform 1 from public.activity_tasks where activity_id = p_target_id order by id for update;
    perform 1
    from public.activity_task_subtasks subtask
    join public.activity_tasks task on task.id = subtask.activity_task_id
    where task.activity_id = p_target_id
    order by subtask.id
    for update of subtask;
    perform 1 from public.training_reflections where activity_id = p_target_id order by id for update;
    perform 1 from public.task_template_self_feedback where activity_id = p_target_id order by id for update;
    perform 1
    from public.trainer_activity_feedback
    where activity_context_type = 'internal' and activity_context_id = p_target_id
    order by id
    for update;
    perform 1 from public.activities where source_activity_id = p_target_id order by id for update;
    perform 1 from public.activity_assignment_team_exclusions where source_activity_id = p_target_id order by id for update;
  elsif p_content_type = 'exercise' then
    select * into v_exercise_assignment
    from public.exercise_assignments assignment
    where assignment.id = p_target_id
    for update;
    if v_exercise_assignment.id is not null then
      select template.id into v_task_template_id
      from public.task_templates template
      where template.user_id = v_exercise_assignment.trainer_id
        and template.player_id = v_exercise_assignment.player_id
        and template.team_id is null
        and template.library_exercise_id = v_exercise_assignment.exercise_id
      order by template.created_at, template.id
      limit 1
      for update;
      if v_task_template_id is not null then
        perform 1 from public.task_template_subtasks where task_template_id = v_task_template_id order by id for update;
      end if;
    end if;
  elsif p_content_type = 'training_template' then
    select * into v_template_assignment
    from public.training_template_assignments assignment
    where assignment.id = p_target_id
    for update;
    if v_template_assignment.id is not null then
      perform 1 from public.tasks where id = any(v_template_assignment.materialized_task_ids) order by id for update;
      for v_activity_id in select unnest(v_template_assignment.materialized_activity_ids) order by 1 loop
        perform public.owner_bulk_lock_target_state('activity', v_activity_id);
      end loop;
    end if;
  elsif p_content_type = 'program' then
    select * into v_enrollment
    from public.program_enrollments enrollment
    where enrollment.id = p_target_id
    for update;
    if v_enrollment.id is not null then
      perform 1 from public.program_enrollment_items where enrollment_id = p_target_id order by id for update;
      perform 1
      from public.tasks task
      join public.program_enrollment_items item on item.task_id = task.id
      where item.enrollment_id = p_target_id
      order by task.id
      for update of task;
      for v_activity_id in
        select item.activity_id
        from public.program_enrollment_items item
        where item.enrollment_id = p_target_id and item.activity_id is not null
        order by item.activity_id
      loop
        perform public.owner_bulk_lock_target_state('activity', v_activity_id);
      end loop;
    end if;
  end if;
end;
$lock_target_state$;

create or replace function public.owner_bulk_restore_activity(
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $restore_activity$
declare
  v_activity jsonb;
  v_activity_id uuid;
  v_task_entry jsonb;
  v_task jsonb;
  v_subtask jsonb;
begin
  if jsonb_typeof(p_snapshot) <> 'object'
     or jsonb_typeof(p_snapshot -> 'activity') <> 'object'
     or jsonb_typeof(coalesce(p_snapshot -> 'tasks', '[]'::jsonb)) <> 'array' then
    raise exception 'BULK_ROLLBACK_SNAPSHOT_INVALID: Activity snapshot is invalid.'
      using errcode = '22023';
  end if;

  v_activity := p_snapshot -> 'activity';
  begin
    v_activity_id := (v_activity ->> 'id')::uuid;
  exception when others then
    raise exception 'BULK_ROLLBACK_SNAPSHOT_INVALID: Activity ID is invalid.'
      using errcode = '22023';
  end;

  if exists (select 1 from public.activities where id = v_activity_id) then
    raise exception 'BULK_ROLLBACK_CONFLICT: Activity ID already exists.'
      using errcode = '23505';
  end if;

  insert into public.activities
  select (jsonb_populate_record(null::public.activities, v_activity)).*;

  -- Category triggers can create current automatic tasks; rollback must restore
  -- the exact captured assignment state instead.
  delete from public.activity_tasks where activity_id = v_activity_id;

  for v_task_entry in
    select entry.value
    from jsonb_array_elements(coalesce(p_snapshot -> 'tasks', '[]'::jsonb)) entry(value)
  loop
    v_task := v_task_entry -> 'task';
    if jsonb_typeof(v_task) <> 'object' then
      raise exception 'BULK_ROLLBACK_SNAPSHOT_INVALID: Activity task snapshot is invalid.'
        using errcode = '22023';
    end if;

    insert into public.activity_tasks
    select (jsonb_populate_record(null::public.activity_tasks, v_task)).*;

    for v_subtask in
      select entry.value
      from jsonb_array_elements(coalesce(v_task_entry -> 'subtasks', '[]'::jsonb)) entry(value)
    loop
      insert into public.activity_task_subtasks
      select (jsonb_populate_record(null::public.activity_task_subtasks, v_subtask)).*;
    end loop;
  end loop;

  return v_activity_id;
end;
$restore_activity$;

create or replace function public.owner_bulk_delete_program_enrollment(
  p_enrollment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $delete_program_enrollment$
begin
  delete from public.tasks task
  using public.program_enrollment_items item
  where item.enrollment_id = p_enrollment_id
    and item.task_id = task.id
    and not exists (
      select 1
      from public.program_enrollment_items other_item
      where other_item.task_id = task.id
        and other_item.enrollment_id <> p_enrollment_id
    );

  delete from public.activities activity
  using public.program_enrollment_items item
  where item.enrollment_id = p_enrollment_id
    and item.activity_id = activity.id
    and not exists (
      select 1
      from public.program_enrollment_items other_item
      where other_item.activity_id = activity.id
        and other_item.enrollment_id <> p_enrollment_id
    );

  delete from public.program_enrollments where id = p_enrollment_id;
end;
$delete_program_enrollment$;

create or replace function public.owner_bulk_enroll_training_program(
  p_owner_account_id uuid,
  p_program_id uuid,
  p_program_version_id uuid,
  p_source_team_id uuid,
  p_start_date date,
  p_enrolled_by uuid,
  p_player_plans jsonb
)
returns table (
  enrollment_id uuid,
  player_id uuid,
  reused boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $owner_bulk_enroll_program$
declare
  v_result record;
begin
  if p_source_team_id is not null and not exists (
    select 1
    from public.owner_accounts owner
    join public.teams team
      on team.id = p_source_team_id
     and (
       (owner.owner_type = 'club' and owner.club_id is not null and team.club_id = owner.club_id)
       or (
         owner.owner_type = 'private_coach_business'
         and owner.coach_account_id is not null
         and team.coach_account_id = owner.coach_account_id
       )
     )
    where owner.id = p_owner_account_id
  ) then
    raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Source team does not belong to this owner.'
      using errcode = '22023';
  end if;

  -- The shared atomic enrollment function predates private coach businesses
  -- and validates source teams through club_id only. Materialize without a
  -- source team, then apply the already owner-validated scope to new rows.
  for v_result in
    select result.enrollment_id, result.player_id, result.reused
    from public.enroll_training_program_atomic(
      p_owner_account_id,
      p_program_id,
      p_program_version_id,
      null,
      p_start_date,
      p_enrolled_by,
      p_player_plans
    ) result
  loop
    if v_result.reused is false and p_source_team_id is not null then
      update public.program_enrollments enrollment
      set source_team_id = p_source_team_id,
          updated_at = now()
      where enrollment.id = v_result.enrollment_id
        and enrollment.owner_account_id = p_owner_account_id;

      update public.activities activity
      set team_id = p_source_team_id,
          updated_at = now()
      from public.program_enrollment_items item
      where item.owner_account_id = p_owner_account_id
        and item.enrollment_id = v_result.enrollment_id
        and item.activity_id = activity.id;
    end if;

    enrollment_id := v_result.enrollment_id;
    player_id := v_result.player_id;
    reused := v_result.reused;
    return next;
  end loop;
end;
$owner_bulk_enroll_program$;

create or replace function public.owner_bulk_materialize_template_assignment(
  p_assignment_id uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $materialize_template_assignment$
declare
  v_assignment public.training_template_assignments%rowtype;
  v_task jsonb;
  v_activity jsonb;
  v_activity_task jsonb;
  v_subtask jsonb;
  v_task_id uuid;
  v_activity_id uuid;
  v_activity_task_id uuid;
  v_source_category_id uuid;
  v_player_category_id uuid;
  v_task_template_id uuid;
  v_training_template_id uuid;
  v_task_ids uuid[] := array[]::uuid[];
  v_activity_ids uuid[] := array[]::uuid[];
  v_category_ids uuid[] := array[]::uuid[];
  v_category_text text;
begin
  select * into v_assignment
  from public.training_template_assignments assignment
  where assignment.id = p_assignment_id
    and assignment.status = 'active'
  for update;

  if v_assignment.id is null then
    raise exception 'BULK_TEMPLATE_ASSIGNMENT_NOT_FOUND: Template assignment was not found.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_plan) <> 'object'
     or jsonb_typeof(coalesce(p_plan -> 'tasks', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_plan -> 'activities', '[]'::jsonb)) <> 'array' then
    raise exception 'BULK_TEMPLATE_PLAN_INVALID: Template materialization plan is invalid.'
      using errcode = '22023';
  end if;

  for v_task in
    select task.value
    from jsonb_array_elements(coalesce(p_plan -> 'tasks', '[]'::jsonb)) task(value)
  loop
    if nullif(btrim(v_task ->> 'title'), '') is null then
      raise exception 'BULK_TEMPLATE_PLAN_INVALID: Standalone task title is required.'
        using errcode = '22023';
    end if;

    v_category_ids := array[]::uuid[];
    for v_category_text in
      select category.value
      from jsonb_array_elements_text(
        case when jsonb_typeof(v_task -> 'categoryIds') = 'array' then v_task -> 'categoryIds' else '[]'::jsonb end
      ) category(value)
    loop
      begin
        v_source_category_id := v_category_text::uuid;
      exception when others then
        raise exception 'BULK_TEMPLATE_PLAN_INVALID: Task category IDs must be UUIDs.'
          using errcode = '22023';
      end;
      v_player_category_id := public.ensure_player_category_copy(v_source_category_id, v_assignment.player_id);
      if v_player_category_id is not null and not (v_player_category_id = any(v_category_ids)) then
        v_category_ids := array_append(v_category_ids, v_player_category_id);
      end if;
    end loop;

    insert into public.tasks (
      user_id,
      title,
      description,
      completed,
      is_template,
      category_ids,
      reminder_minutes,
      subtasks
    ) values (
      v_assignment.player_id,
      btrim(v_task ->> 'title'),
      coalesce(v_task ->> 'description', ''),
      false,
      false,
      v_category_ids,
      nullif(v_task ->> 'reminderMinutes', '')::integer,
      case when jsonb_typeof(v_task -> 'subtasks') = 'array' then v_task -> 'subtasks' else '[]'::jsonb end
    )
    returning id into v_task_id;
    v_task_ids := array_append(v_task_ids, v_task_id);
  end loop;

  for v_activity in
    select activity.value
    from jsonb_array_elements(coalesce(p_plan -> 'activities', '[]'::jsonb)) activity(value)
  loop
    if nullif(btrim(v_activity ->> 'title'), '') is null
       or nullif(v_activity ->> 'activityDate', '') is null
       or nullif(v_activity ->> 'activityTime', '') is null then
      raise exception 'BULK_TEMPLATE_PLAN_INVALID: Activity title, date and time are required.'
        using errcode = '22023';
    end if;

    begin
      v_source_category_id := nullif(v_activity ->> 'sourceCategoryId', '')::uuid;
    exception when others then
      raise exception 'BULK_TEMPLATE_PLAN_INVALID: sourceCategoryId must be a UUID.'
        using errcode = '22023';
    end;
    v_player_category_id := public.ensure_player_category_copy(v_source_category_id, v_assignment.player_id);

    insert into public.activities (
      user_id,
      player_id,
      team_id,
      title,
      activity_date,
      activity_time,
      activity_end_time,
      location,
      category_id,
      intensity,
      intensity_enabled,
      intensity_note,
      is_external,
      source_activity_id,
      series_id,
      series_instance_date
    ) values (
      v_assignment.player_id,
      v_assignment.player_id,
      v_assignment.source_team_id,
      btrim(v_activity ->> 'title'),
      (v_activity ->> 'activityDate')::date,
      (v_activity ->> 'activityTime')::time,
      nullif(btrim(v_activity ->> 'activityEndTime'), ''),
      nullif(v_activity ->> 'location', ''),
      v_player_category_id,
      null,
      false,
      null,
      false,
      null,
      null,
      null
    )
    returning id into v_activity_id;
    v_activity_ids := array_append(v_activity_ids, v_activity_id);

    -- Remove tasks created by category automation. The immutable assignment
    -- snapshot is the source of truth for this materialized session.
    delete from public.activity_tasks where activity_id = v_activity_id;

    for v_activity_task in
      select task.value
      from jsonb_array_elements(
        case when jsonb_typeof(v_activity -> 'tasks') = 'array' then v_activity -> 'tasks' else '[]'::jsonb end
      ) task(value)
      order by coalesce((task.value ->> 'sortOrder')::integer, 0)
    loop
      if nullif(btrim(v_activity_task ->> 'title'), '') is null then
        raise exception 'BULK_TEMPLATE_PLAN_INVALID: Activity task title is required.'
          using errcode = '22023';
      end if;

      begin
        v_task_template_id := nullif(v_activity_task ->> 'taskTemplateId', '')::uuid;
        v_training_template_id := nullif(v_activity_task ->> 'trainingTemplateId', '')::uuid;
      exception when others then
        raise exception 'BULK_TEMPLATE_PLAN_INVALID: Template IDs must be UUIDs.'
          using errcode = '22023';
      end;

      insert into public.activity_tasks (
        activity_id,
        title,
        description,
        completed,
        reminder_minutes,
        task_template_id,
        training_template_id,
        training_template_type,
        exercise_timer,
        video_urls,
        media_names,
        after_training_enabled,
        after_training_delay_minutes,
        task_duration_enabled,
        task_duration_minutes,
        feedback_template_id,
        is_feedback_task,
        template_sync_enabled
      ) values (
        v_activity_id,
        btrim(v_activity_task ->> 'title'),
        coalesce(v_activity_task ->> 'description', ''),
        false,
        nullif(v_activity_task ->> 'reminderMinutes', '')::integer,
        v_task_template_id,
        v_training_template_id,
        nullif(v_activity_task ->> 'trainingTemplateType', ''),
        case when jsonb_typeof(v_activity_task -> 'exerciseTimer') = 'object' then v_activity_task -> 'exerciseTimer' else null end,
        case when jsonb_typeof(v_activity_task -> 'videoUrls') = 'array' then v_activity_task -> 'videoUrls' else '[]'::jsonb end,
        array(
          select media.value
          from jsonb_array_elements_text(
            case when jsonb_typeof(v_activity_task -> 'mediaNames') = 'array' then v_activity_task -> 'mediaNames' else '[]'::jsonb end
          ) media(value)
        ),
        coalesce((v_activity_task ->> 'afterTrainingEnabled')::boolean, false),
        nullif(v_activity_task ->> 'afterTrainingDelayMinutes', '')::integer,
        coalesce((v_activity_task ->> 'taskDurationEnabled')::boolean, false),
        nullif(v_activity_task ->> 'taskDurationMinutes', '')::integer,
        null,
        false,
        false
      )
      returning id into v_activity_task_id;

      for v_subtask in
        select subtask.value
        from jsonb_array_elements(
          case when jsonb_typeof(v_activity_task -> 'subtasks') = 'array' then v_activity_task -> 'subtasks' else '[]'::jsonb end
        ) with ordinality subtask(value, ordinality)
      loop
        if nullif(btrim(v_subtask ->> 'title'), '') is not null then
          insert into public.activity_task_subtasks (activity_task_id, title, completed, sort_order)
          values (
            v_activity_task_id,
            btrim(v_subtask ->> 'title'),
            false,
            coalesce(nullif(v_subtask ->> 'sortOrder', '')::integer, 0)
          );
        end if;
      end loop;

      if v_task_template_id is not null
         and coalesce((v_activity_task ->> 'afterTrainingEnabled')::boolean, false) then
        insert into public.activity_tasks (
          activity_id,
          task_template_id,
          feedback_template_id,
          is_feedback_task,
          title,
          description,
          completed,
          reminder_minutes,
          template_sync_enabled
        ) values (
          v_activity_id,
          null,
          v_task_template_id,
          true,
          'Feedback på ' || btrim(v_activity_task ->> 'title'),
          'Del din feedback efter træningen direkte til træneren. [auto-after-training:' || v_task_template_id::text || ']',
          false,
          nullif(v_activity_task ->> 'afterTrainingDelayMinutes', '')::integer,
          false
        );
      end if;
    end loop;
  end loop;

  update public.training_template_assignments assignment
  set materialized_task_ids = v_task_ids,
      materialized_activity_ids = v_activity_ids,
      updated_at = now()
  where assignment.id = v_assignment.id;

  return jsonb_build_object(
    'taskIds', to_jsonb(v_task_ids),
    'activityIds', to_jsonb(v_activity_ids)
  );
end;
$materialize_template_assignment$;

create or replace function public.apply_owner_bulk_assignment(
  p_owner_account_id uuid,
  p_actor_user_id uuid,
  p_operation text,
  p_content_type text,
  p_content_id uuid,
  p_idempotency_key text,
  p_canonical_request_hash text,
  p_recipient_fingerprint text,
  p_request_payload jsonb,
  p_recipient_plans jsonb,
  p_assignment jsonb,
  p_program_version_id uuid,
  p_template_version_id uuid,
  p_target_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $apply_owner_bulk_assignment$
declare
  v_batch_id uuid;
  v_existing_batch_id uuid;
  v_plan jsonb;
  v_player_id uuid;
  v_source_team_id uuid;
  v_existing_target_id uuid;
  v_target_id uuid;
  v_new_target_id uuid;
  v_source_activity public.activities%rowtype;
  v_activity public.activities%rowtype;
  v_source_task public.activity_tasks%rowtype;
  v_new_activity_task_id uuid;
  v_exercise public.exercise_library%rowtype;
  v_exercise_assignment public.exercise_assignments%rowtype;
  v_task_template public.task_templates%rowtype;
  v_task_template_id uuid;
  v_template_assignment public.training_template_assignments%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_materialized jsonb := '{}'::jsonb;
  v_item_status text;
  v_reason_code text;
  v_message text;
  v_start_date date;
  v_old_start_date date;
  v_enrollment_status text;
  v_player_category_id uuid;
  v_created integer := 0;
  v_updated integer := 0;
  v_removed integer := 0;
  v_duplicates integer := 0;
  v_conflicts integer := 0;
  v_failed integer := 0;
  v_total integer := 0;
  v_batch_status text;
  v_reused boolean;
  v_preview_summary jsonb;
  v_rows integer;
  v_rows_two integer;
  v_target_proven boolean;
  v_task_template_created boolean;
  v_expected_state_hash text;
  v_current_state jsonb;
  v_legacy_unscoped boolean;
  v_expected_source_state_hash text;
  v_current_source_state_hash text;
begin
  if p_owner_account_id is null
     or p_actor_user_id is null
     or p_content_id is null
     or nullif(btrim(p_canonical_request_hash), '') is null
     or nullif(btrim(p_recipient_fingerprint), '') is null then
    raise exception 'BULK_VALIDATION_ERROR: Required bulk assignment identifiers are missing.'
      using errcode = '22023';
  end if;

  if p_operation not in ('assign', 'update', 'remove') then
    raise exception 'BULK_VALIDATION_ERROR: operation must be assign, update or remove.'
      using errcode = '22023';
  end if;
  if p_content_type not in ('activity', 'exercise', 'training_template', 'program') then
    raise exception 'BULK_VALIDATION_ERROR: content type is invalid.'
      using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'BULK_VALIDATION_ERROR: idempotencyKey must contain 8-200 characters.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_request_payload) <> 'object'
     or jsonb_typeof(coalesce(p_assignment, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(p_recipient_plans) <> 'array'
     or jsonb_array_length(p_recipient_plans) = 0 then
    raise exception 'BULK_VALIDATION_ERROR: Bulk assignment payload is invalid.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.owner_accounts owner
    where owner.id = p_owner_account_id
      and owner.status = 'active'
  ) then
    raise exception 'BULK_OWNER_NOT_FOUND: Active owner account was not found.'
      using errcode = '22023';
  end if;

  if public.has_owner_account_coach_access(p_owner_account_id, p_actor_user_id) is not true then
    raise exception 'BULK_FORBIDDEN: Actor does not have coach access to this owner.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_owner_account_id::text || ':' || p_actor_user_id::text || ':' || p_idempotency_key,
      287
    )
  );

  select batch.id into v_existing_batch_id
  from public.assignment_batches batch
  where batch.owner_account_id = p_owner_account_id
    and batch.requested_by = p_actor_user_id
    and batch.idempotency_key = p_idempotency_key
  limit 1;

  if v_existing_batch_id is not null then
    if not exists (
      select 1
      from public.assignment_batches batch
      where batch.id = v_existing_batch_id
        and batch.operation = p_operation
        and batch.content_type = p_content_type
        and batch.content_id = p_content_id
        and batch.canonical_request_hash = p_canonical_request_hash
    ) then
      raise exception 'BULK_IDEMPOTENCY_CONFLICT: idempotencyKey was already used for a different command.'
        using errcode = '23505';
    end if;
    return jsonb_build_object('batchId', v_existing_batch_id, 'replayed', true);
  end if;

  if p_target_batch_id is not null and not exists (
    select 1
    from public.assignment_batches batch
    where batch.id = p_target_batch_id
      and batch.owner_account_id = p_owner_account_id
      and batch.content_type = p_content_type
      and batch.content_id = p_content_id
  ) then
    raise exception 'BULK_TARGET_BATCH_NOT_FOUND: targetBatchId does not belong to this owner and content.'
      using errcode = '22023';
  end if;

  if p_content_type = 'activity' then
    select activity.* into v_source_activity
    from public.activities activity
    left join public.teams team on team.id = activity.team_id
    left join public.owner_accounts owner on owner.id = p_owner_account_id
    where activity.id = p_content_id
      and coalesce(activity.is_external, false) = false
      and activity.player_id is null
      and (
        activity.user_id = p_actor_user_id
        or (team.id is not null and (team.club_id = owner.club_id or team.coach_account_id = owner.coach_account_id))
      )
    limit 1;
    if v_source_activity.id is null then
      raise exception 'BULK_CONTENT_NOT_FOUND: Assignable activity was not found for this owner.'
        using errcode = '22023';
    end if;
  elsif p_content_type = 'exercise' then
    select exercise.* into v_exercise
    from public.exercise_library exercise
    where exercise.id = p_content_id
      and (
        exercise.is_system is true
        or exercise.trainer_id = p_actor_user_id
      );
    if v_exercise.id is null then
      raise exception 'BULK_CONTENT_NOT_FOUND: Assignable exercise was not found for this owner.'
        using errcode = '22023';
    end if;
  elsif p_content_type = 'training_template' then
    if p_template_version_id is null or not exists (
      select 1
      from public.training_templates template
      join public.template_versions version
        on version.owner_account_id = template.owner_account_id
       and version.template_id = template.id
       and version.id = p_template_version_id
      where template.id = p_content_id
        and template.owner_account_id = p_owner_account_id
        and template.status = 'active'
        and template.active_version_id = version.id
    ) then
      raise exception 'BULK_CONTENT_NOT_FOUND: Active training template version was not found.'
        using errcode = '22023';
    end if;
  else
    if p_program_version_id is null or not exists (
      select 1
      from public.training_programs program
      join public.program_versions version
        on version.owner_account_id = program.owner_account_id
       and version.program_id = program.id
       and version.id = p_program_version_id
       and version.version_number = program.published_version
      where program.id = p_content_id
        and program.owner_account_id = p_owner_account_id
        and program.status = 'published'
    ) then
      raise exception 'BULK_CONTENT_NOT_FOUND: Published program version was not found.'
        using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_owner_account_id::text || ':' || p_content_type || ':' || p_content_id::text,
      287
    )
  );

  v_expected_source_state_hash := nullif(p_request_payload ->> 'expectedSourceStateHash', '');
  if v_expected_source_state_hash is null then
    raise exception 'BULK_PREVIEW_STALE: Source state hash is missing.'
      using errcode = '40001';
  end if;

  perform public.owner_bulk_lock_source_state(
    p_owner_account_id,
    p_content_type,
    p_content_id,
    p_program_version_id,
    p_template_version_id
  );

  v_current_source_state_hash := public.owner_bulk_source_state_hash(
    p_owner_account_id,
    p_content_type,
    p_content_id,
    p_program_version_id,
    p_template_version_id
  );
  if v_current_source_state_hash is null
     or v_current_source_state_hash is distinct from v_expected_source_state_hash then
    raise exception 'BULK_PREVIEW_STALE: Source content changed after preview.'
      using errcode = '40001';
  end if;

  insert into public.assignment_batches (
    owner_account_id,
    requested_by,
    operation,
    content_type,
    content_id,
    target_batch_id,
    idempotency_key,
    canonical_request_hash,
    recipient_fingerprint,
    request_payload,
    status
  ) values (
    p_owner_account_id,
    p_actor_user_id,
    p_operation,
    p_content_type,
    p_content_id,
    p_target_batch_id,
    p_idempotency_key,
    p_canonical_request_hash,
    p_recipient_fingerprint,
    p_request_payload,
    'applying'
  )
  returning id into v_batch_id;

  for v_plan in
    select plan.value
    from jsonb_array_elements(p_recipient_plans) plan(value)
    order by plan.value ->> 'playerId'
  loop
    v_total := v_total + 1;
    v_player_id := null;
    v_source_team_id := null;
    v_existing_target_id := null;
    v_target_id := null;
    v_new_target_id := null;
    v_before := null;
    v_after := null;
    v_materialized := '{}'::jsonb;
    v_reason_code := null;
    v_message := null;
    v_item_status := null;
    v_rows := 0;
    v_rows_two := 0;
    v_task_template_created := false;
    v_expected_state_hash := nullif(v_plan ->> 'expectedStateHash', '');
    v_current_state := null;
    v_legacy_unscoped := false;

    begin
      begin
        v_player_id := nullif(v_plan ->> 'playerId', '')::uuid;
        v_source_team_id := nullif(v_plan ->> 'sourceTeamId', '')::uuid;
        v_existing_target_id := nullif(v_plan ->> 'existingTargetId', '')::uuid;
      exception when others then
        raise exception 'Recipient identifiers must be UUIDs.';
      end;

      v_target_proven := v_existing_target_id is not null and exists (
        select 1
        from public.assignment_batch_items prior_item
        join public.assignment_batches prior_batch
          on prior_batch.id = prior_item.batch_id
         and prior_batch.owner_account_id = prior_item.owner_account_id
        where prior_item.owner_account_id = p_owner_account_id
          and prior_item.player_id = v_player_id
          and prior_item.target_id = v_existing_target_id
          and prior_item.status in ('created', 'updated')
          and prior_batch.content_type = p_content_type
          and prior_batch.content_id = p_content_id
      );

      if v_player_id is null or not exists (
        select 1
        from public.owner_players owner_player
        where owner_player.owner_account_id = p_owner_account_id
          and owner_player.player_id = v_player_id
          and owner_player.status = 'active'
      ) then
        v_item_status := 'conflict';
        v_reason_code := 'PLAYER_NOT_ACTIVE';
        v_message := 'Player is no longer active for this owner.';
      end if;

      if v_item_status is null and p_operation <> 'remove' and v_source_team_id is not null and not exists (
        select 1
        from public.owner_accounts owner
        join public.teams team
          on team.id = v_source_team_id
         and (team.club_id = owner.club_id or team.coach_account_id = owner.coach_account_id)
        join public.team_members member
          on member.team_id = team.id
         and member.player_id = v_player_id
        where owner.id = p_owner_account_id
      ) then
        v_item_status := 'conflict';
        v_reason_code := 'TEAM_SCOPE_INVALID';
        v_message := 'The selected team does not belong to this owner/player.';
      end if;

      if v_item_status is null
         and p_operation <> 'assign'
         and v_existing_target_id is not null then
        perform public.owner_bulk_lock_target_state(p_content_type, v_existing_target_id);
        if p_content_type = 'activity' then
          v_current_state := public.owner_bulk_snapshot_activity(v_existing_target_id);
        elsif p_content_type = 'exercise' then
          v_current_state := public.owner_bulk_snapshot_exercise_assignment(v_existing_target_id);
        elsif p_content_type = 'training_template' then
          v_current_state := public.owner_bulk_snapshot_template_assignment(v_existing_target_id);
        else
          v_current_state := public.owner_bulk_snapshot_program_enrollment(v_existing_target_id);
        end if;

        if v_expected_state_hash is null
           or v_current_state is null
           or md5(v_current_state::text) is distinct from v_expected_state_hash then
          v_item_status := 'conflict';
          v_reason_code := 'ASSIGNMENT_CHANGED_SINCE_PREVIEW';
          v_message := 'Assignment or materialized child content changed after preview.';
        end if;
      end if;

      if v_item_status is null and p_content_type = 'activity' then
        v_target_id := null;
        if p_operation <> 'assign' and v_existing_target_id is not null then
          select activity.id into v_target_id
          from public.activities activity
          where activity.id = v_existing_target_id
            and activity.source_activity_id = p_content_id
            and activity.user_id = v_player_id
            and activity.player_id = v_player_id
            and (activity.assignment_owner_account_id = p_owner_account_id or v_target_proven);
        else
          select activity.id into v_target_id
          from public.activities activity
          where activity.source_activity_id = p_content_id
            and activity.user_id = v_player_id
            and coalesce(activity.is_external, false) = false
            and (
              activity.assignment_owner_account_id = p_owner_account_id
              or exists (
                select 1
                from public.assignment_batch_items prior_item
                join public.assignment_batches prior_batch on prior_batch.id = prior_item.batch_id
                where prior_item.owner_account_id = p_owner_account_id
                  and prior_item.player_id = v_player_id
                  and prior_item.target_id = activity.id
                  and prior_item.status in ('created', 'updated')
                  and prior_batch.content_type = 'activity'
                  and prior_batch.content_id = p_content_id
              )
            )
          order by activity.created_at
          limit 1;
        end if;

        if v_existing_target_id is null and v_target_id is null then
          v_legacy_unscoped := exists (
            select 1
            from public.activities legacy_activity
            where legacy_activity.source_activity_id = p_content_id
              and legacy_activity.user_id = v_player_id
              and legacy_activity.player_id = v_player_id
              and legacy_activity.assignment_owner_account_id is null
              and coalesce(legacy_activity.is_external, false) = false
          );
        end if;

        if v_legacy_unscoped then
          v_item_status := 'conflict';
          v_reason_code := 'LEGACY_ASSIGNMENT_UNSCOPED';
          v_message := 'An existing direct activity has no owner provenance and was preserved.';
        elsif p_operation = 'assign' and v_target_id is not null then
          v_item_status := 'duplicate';
          v_reason_code := 'ASSIGNMENT_EXISTS';
          v_message := 'Activity is already assigned to this player.';
        elsif p_operation <> 'assign' and v_target_id is null then
          v_item_status := 'conflict';
          v_reason_code := 'ASSIGNMENT_NOT_FOUND';
          v_message := 'Activity assignment was not found.';
        elsif p_operation <> 'assign' and public.owner_bulk_activity_started(v_target_id) then
          v_item_status := 'conflict';
          v_reason_code := 'PLAYER_PROGRESS_EXISTS';
          v_message := 'Activity cannot be changed after player progress exists.';
        elsif p_operation = 'assign' then
          v_player_category_id := public.ensure_player_category_copy(v_source_activity.category_id, v_player_id);
          insert into public.activities (
            user_id, player_id, team_id, title, activity_date, activity_time, activity_end_time,
            location, category_id, intensity, intensity_enabled, intensity_note, is_external,
            source_activity_id, series_id, series_instance_date, assignment_owner_account_id
          ) values (
            v_player_id,
            v_player_id,
            v_source_team_id,
            coalesce(nullif(btrim(p_assignment ->> 'title'), ''), v_source_activity.title),
            coalesce(nullif(p_assignment ->> 'activityDate', '')::date, v_source_activity.activity_date),
            coalesce(nullif(p_assignment ->> 'activityTime', '')::time, v_source_activity.activity_time),
            case when p_assignment ? 'activityEndTime' then nullif(btrim(p_assignment ->> 'activityEndTime'), '') else v_source_activity.activity_end_time end,
            case when p_assignment ? 'location' then nullif(p_assignment ->> 'location', '') else v_source_activity.location end,
            v_player_category_id,
            null,
            coalesce(v_source_activity.intensity_enabled, false),
            null,
            false,
            p_content_id,
            null,
            null,
            p_owner_account_id
          ) returning id into v_target_id;

          delete from public.activity_tasks where activity_id = v_target_id;
          for v_source_task in
            select * from public.activity_tasks source_task
            where source_task.activity_id = p_content_id
            order by source_task.created_at, source_task.id
          loop
            insert into public.activity_tasks (
              activity_id, title, description, completed, reminder_minutes, task_template_id,
              feedback_template_id, is_feedback_task, video_urls, media_names,
              after_training_enabled, after_training_delay_minutes, task_duration_enabled,
              task_duration_minutes, training_template_id, training_template_type,
              exercise_timer, template_sync_enabled
            ) values (
              v_target_id, v_source_task.title, v_source_task.description, false,
              v_source_task.reminder_minutes, v_source_task.task_template_id,
              v_source_task.feedback_template_id, v_source_task.is_feedback_task,
              v_source_task.video_urls, v_source_task.media_names,
              v_source_task.after_training_enabled, v_source_task.after_training_delay_minutes,
              v_source_task.task_duration_enabled, v_source_task.task_duration_minutes,
              v_source_task.training_template_id, v_source_task.training_template_type,
              v_source_task.exercise_timer, false
            ) returning id into v_new_activity_task_id;

            insert into public.activity_task_subtasks (activity_task_id, title, completed, sort_order)
            select v_new_activity_task_id, subtask.title, false, subtask.sort_order
            from public.activity_task_subtasks subtask
            where subtask.activity_task_id = v_source_task.id;
          end loop;
          v_after := public.owner_bulk_snapshot_activity(v_target_id);
          v_item_status := 'created';
        elsif p_operation = 'update' then
          v_before := public.owner_bulk_snapshot_activity(v_target_id);
          update public.activities activity
          set assignment_owner_account_id = p_owner_account_id,
              team_id = v_source_team_id,
              title = coalesce(nullif(btrim(p_assignment ->> 'title'), ''), activity.title),
              activity_date = coalesce(nullif(p_assignment ->> 'activityDate', '')::date, activity.activity_date),
              activity_time = coalesce(nullif(p_assignment ->> 'activityTime', '')::time, activity.activity_time),
              activity_end_time = case when p_assignment ? 'activityEndTime' then nullif(btrim(p_assignment ->> 'activityEndTime'), '') else activity.activity_end_time end,
              location = case when p_assignment ? 'location' then nullif(p_assignment ->> 'location', '') else activity.location end,
              updated_at = now()
          where activity.id = v_target_id
            and (
              activity.assignment_owner_account_id is distinct from p_owner_account_id
              or activity.team_id is distinct from v_source_team_id
              or activity.title is distinct from coalesce(nullif(btrim(p_assignment ->> 'title'), ''), activity.title)
              or activity.activity_date is distinct from coalesce(nullif(p_assignment ->> 'activityDate', '')::date, activity.activity_date)
              or activity.activity_time is distinct from coalesce(nullif(p_assignment ->> 'activityTime', '')::time, activity.activity_time)
              or activity.activity_end_time is distinct from case when p_assignment ? 'activityEndTime' then nullif(btrim(p_assignment ->> 'activityEndTime'), '') else activity.activity_end_time end
              or activity.location is distinct from case when p_assignment ? 'location' then nullif(p_assignment ->> 'location', '') else activity.location end
            );
          get diagnostics v_rows = row_count;
          v_after := public.owner_bulk_snapshot_activity(v_target_id);
          v_item_status := case when v_rows = 0 then 'duplicate' else 'updated' end;
          if v_item_status = 'duplicate' then
            v_reason_code := 'NO_CHANGES';
            v_message := 'Assignment already has the requested values.';
          end if;
        else
          v_before := public.owner_bulk_snapshot_activity(v_target_id);
          delete from public.activities where id = v_target_id;
          v_item_status := 'removed';
        end if;
        v_materialized := jsonb_build_object('activityIds', case when p_operation = 'remove' then '[]'::jsonb else jsonb_build_array(v_target_id) end);

      elsif v_item_status is null and p_content_type = 'exercise' then
        v_target_id := null;
        if v_existing_target_id is not null then
          select assignment.id into v_target_id
          from public.exercise_assignments assignment
          where assignment.id = v_existing_target_id
            and assignment.exercise_id = p_content_id
            and assignment.player_id = v_player_id
            and (assignment.owner_account_id = p_owner_account_id or v_target_proven);
        else
          select assignment.id into v_target_id
          from public.exercise_assignments assignment
          where assignment.exercise_id = p_content_id
            and assignment.player_id = v_player_id
            and assignment.owner_account_id = p_owner_account_id
          order by assignment.created_at
          limit 1;
        end if;

        if v_existing_target_id is null and v_target_id is null then
          v_legacy_unscoped := exists (
            select 1
            from public.exercise_assignments legacy_assignment
            where legacy_assignment.exercise_id = p_content_id
              and legacy_assignment.player_id = v_player_id
              and legacy_assignment.team_id is null
              and legacy_assignment.owner_account_id is null
          );
        end if;

        if v_legacy_unscoped then
          v_item_status := 'conflict';
          v_reason_code := 'LEGACY_ASSIGNMENT_UNSCOPED';
          v_message := 'An existing direct exercise assignment has no owner provenance and was preserved.';
        elsif p_operation = 'assign' and (
          v_target_id is not null
          or exists (
            select 1
            from public.exercise_assignments team_assignment
            join public.team_members member on member.team_id = team_assignment.team_id
            join public.teams team on team.id = team_assignment.team_id
            join public.owner_accounts owner on owner.id = p_owner_account_id
            where team_assignment.exercise_id = p_content_id
              and member.player_id = v_player_id
              and (team.club_id = owner.club_id or team.coach_account_id = owner.coach_account_id)
          )
        ) then
          v_item_status := 'duplicate';
          v_reason_code := 'ASSIGNMENT_EXISTS';
          v_message := 'Exercise is already assigned directly or through a team.';
        elsif p_operation <> 'assign' and v_target_id is null then
          v_item_status := 'conflict';
          v_reason_code := case when exists (
            select 1
            from public.exercise_assignments team_assignment
            join public.team_members member on member.team_id = team_assignment.team_id
            join public.teams team on team.id = team_assignment.team_id
            join public.owner_accounts owner on owner.id = p_owner_account_id
            where team_assignment.exercise_id = p_content_id and member.player_id = v_player_id
              and (team.club_id = owner.club_id or team.coach_account_id = owner.coach_account_id)
          ) then 'SHARED_TEAM_ASSIGNMENT' else 'ASSIGNMENT_NOT_FOUND' end;
          v_message := case when v_reason_code = 'SHARED_TEAM_ASSIGNMENT'
            then 'Team-owned exercise assignments cannot be changed for one player.'
            else 'Exercise assignment was not found.' end;
        elsif p_operation = 'update' and exists (
          select 1
          from public.exercise_assignments other_assignment
          where other_assignment.id <> v_target_id
            and other_assignment.exercise_id = p_content_id
            and other_assignment.player_id = v_player_id
        ) then
          v_item_status := 'conflict';
          v_reason_code := 'SHARED_EXERCISE_TEMPLATE';
          v_message := 'The player exercise template is shared by another assignment and was preserved.';
        elsif p_operation = 'update' then
          v_before := public.owner_bulk_snapshot_exercise_assignment(v_target_id);
          v_after := v_before;
          v_item_status := 'duplicate';
          v_reason_code := 'NO_CHANGES';
          v_message := 'Exercise assignments have no mutable scheduling fields.';
        elsif p_operation = 'assign' and exists (
          select 1
          from public.task_templates archived_template
          where archived_template.user_id = p_actor_user_id
            and archived_template.player_id = v_player_id
            and archived_template.team_id is null
            and archived_template.library_exercise_id = p_content_id
            and archived_template.archived_at is not null
        ) then
          v_item_status := 'conflict';
          v_reason_code := 'EXERCISE_TEMPLATE_ARCHIVED';
          v_message := 'A matching archived player exercise exists and was preserved.';
        elsif p_operation = 'assign' then
          insert into public.exercise_assignments (exercise_id, trainer_id, player_id, team_id, owner_account_id)
          values (p_content_id, p_actor_user_id, v_player_id, null, p_owner_account_id)
          returning * into v_exercise_assignment;
          v_target_id := v_exercise_assignment.id;
          select * into v_task_template
          from public.task_templates task_template
          where task_template.user_id = p_actor_user_id
            and task_template.player_id = v_player_id
            and task_template.team_id is null
            and task_template.library_exercise_id = p_content_id
          order by task_template.created_at, task_template.id
          limit 1;
          if v_task_template.id is null then
            insert into public.task_templates (
              user_id, title, description, video_url, video_urls, media_names, source_folder,
              library_exercise_id, player_id, team_id, after_training_enabled,
              after_training_delay_minutes, after_training_feedback_enable_score,
              after_training_feedback_score_explanation, after_training_feedback_enable_intensity,
              after_training_feedback_enable_note, auto_add_to_activities
            ) values (
              p_actor_user_id, v_exercise.title, coalesce(v_exercise.description, ''), v_exercise.video_url,
              case when nullif(v_exercise.video_url, '') is null then '[]'::jsonb else jsonb_build_array(v_exercise.video_url) end,
              case when nullif(v_exercise.video_url, '') is null then '{}'::text[] else array['Library media']::text[] end,
              'From coach', p_content_id, v_player_id, null, false, null, true, null, true, true, false
            ) returning * into v_task_template;
            v_task_template_created := true;
          end if;
          v_after := public.owner_bulk_snapshot_exercise_assignment(v_target_id);
          v_materialized := jsonb_build_object(
            'taskTemplateIds', jsonb_build_array(v_task_template.id),
            'taskTemplateCreated', v_task_template_created
          );
          v_item_status := 'created';
        else
          v_before := public.owner_bulk_snapshot_exercise_assignment(v_target_id);
          delete from public.exercise_assignments where id = v_target_id;
          v_materialized := jsonb_build_object(
            'retainedTaskTemplateId', v_before #>> '{taskTemplate,id}'
          );
          v_item_status := 'removed';
        end if;

      elsif v_item_status is null and p_content_type = 'training_template' then
        v_start_date := coalesce(nullif(p_assignment ->> 'startDate', '')::date, current_date);
        v_target_id := null;
        if p_operation <> 'assign' and v_existing_target_id is not null then
          select assignment.id into v_target_id
          from public.training_template_assignments assignment
          where assignment.id = v_existing_target_id
            and assignment.owner_account_id = p_owner_account_id
            and assignment.template_id = p_content_id
            and assignment.player_id = v_player_id
            and assignment.status = 'active';
        else
          select assignment.id into v_target_id
          from public.training_template_assignments assignment
          where assignment.owner_account_id = p_owner_account_id
            and assignment.template_id = p_content_id
            and assignment.player_id = v_player_id
            and assignment.start_date = v_start_date
            and assignment.status = 'active'
          limit 1;
        end if;

        if p_operation = 'assign' and v_target_id is not null then
          v_item_status := 'duplicate';
          v_reason_code := 'ASSIGNMENT_EXISTS';
          v_message := 'Training template is already assigned for this start date.';
        elsif p_operation <> 'assign' and v_target_id is null then
          v_item_status := 'conflict';
          v_reason_code := 'ASSIGNMENT_NOT_FOUND';
          v_message := 'Training template assignment was not found.';
        elsif p_operation = 'update' and exists (
          select 1
          from public.training_template_assignments collision
          where collision.owner_account_id = p_owner_account_id
            and collision.template_id = p_content_id
            and collision.player_id = v_player_id
            and collision.start_date = v_start_date
            and collision.status = 'active'
            and collision.id <> v_target_id
        ) then
          v_item_status := 'conflict';
          v_reason_code := 'ASSIGNMENT_EXISTS_FOR_START_DATE';
          v_message := 'Another template assignment already exists for the requested start date.';
        elsif p_operation <> 'assign' and public.owner_bulk_template_assignment_started(v_target_id) then
          v_item_status := 'conflict';
          v_reason_code := 'PLAYER_PROGRESS_EXISTS';
          v_message := 'Training template cannot be changed after player progress exists.';
        elsif p_operation = 'assign' then
          insert into public.training_template_assignments (
            owner_account_id, template_id, template_version_id, player_id, source_team_id,
            start_date, status, snapshot, assigned_by
          ) values (
            p_owner_account_id, p_content_id, p_template_version_id, v_player_id,
            v_source_team_id, v_start_date, 'active',
            jsonb_build_object(
              'templateVersionSnapshot', coalesce(p_assignment -> 'templateVersionSnapshot', '{}'::jsonb),
              'materializationPlan', coalesce(v_plan -> 'templatePlan', '{}'::jsonb)
            ),
            p_actor_user_id
          ) returning * into v_template_assignment;
          v_target_id := v_template_assignment.id;
          v_materialized := public.owner_bulk_materialize_template_assignment(v_target_id, v_plan -> 'templatePlan');
          select * into v_template_assignment from public.training_template_assignments where id = v_target_id;
          v_after := public.owner_bulk_snapshot_template_assignment(v_target_id);
          v_item_status := 'created';
        elsif p_operation = 'update' then
          select * into v_template_assignment from public.training_template_assignments where id = v_target_id for update;
          v_before := public.owner_bulk_snapshot_template_assignment(v_target_id);
          delete from public.tasks where id = any(v_template_assignment.materialized_task_ids);
          delete from public.activities where id = any(v_template_assignment.materialized_activity_ids);
          update public.training_template_assignments assignment
          set template_version_id = p_template_version_id,
              source_team_id = v_source_team_id,
              start_date = v_start_date,
              snapshot = jsonb_build_object(
                'templateVersionSnapshot', coalesce(p_assignment -> 'templateVersionSnapshot', '{}'::jsonb),
                'materializationPlan', coalesce(v_plan -> 'templatePlan', '{}'::jsonb)
              ),
              materialized_task_ids = '{}'::uuid[],
              materialized_activity_ids = '{}'::uuid[],
              updated_at = now()
          where assignment.id = v_target_id;
          v_materialized := public.owner_bulk_materialize_template_assignment(v_target_id, v_plan -> 'templatePlan');
          select * into v_template_assignment from public.training_template_assignments where id = v_target_id;
          v_after := public.owner_bulk_snapshot_template_assignment(v_target_id);
          v_item_status := 'updated';
        else
          select * into v_template_assignment from public.training_template_assignments where id = v_target_id for update;
          v_before := public.owner_bulk_snapshot_template_assignment(v_target_id);
          delete from public.tasks where id = any(v_template_assignment.materialized_task_ids);
          delete from public.activities where id = any(v_template_assignment.materialized_activity_ids);
          update public.training_template_assignments assignment
          set status = 'removed',
              materialized_task_ids = '{}'::uuid[],
              materialized_activity_ids = '{}'::uuid[],
              removed_by = p_actor_user_id,
              removed_at = now(),
              updated_at = now()
          where assignment.id = v_target_id
          returning * into v_template_assignment;
          v_after := public.owner_bulk_snapshot_template_assignment(v_target_id);
          v_item_status := 'removed';
        end if;

      elsif v_item_status is null and p_content_type = 'program' then
        v_start_date := nullif(p_assignment ->> 'startDate', '')::date;
        if p_operation <> 'remove' and v_start_date is null then
          raise exception 'Program startDate is required.';
        end if;
        v_enrollment_status := nullif(p_assignment ->> 'enrollmentStatus', '');
        if v_enrollment_status is not null and v_enrollment_status not in ('active', 'paused') then
          raise exception 'Program enrollmentStatus must be active or paused.';
        end if;

        v_target_id := null;
        if p_operation <> 'assign' and v_existing_target_id is not null then
          select enrollment.id into v_target_id
          from public.program_enrollments enrollment
          where enrollment.id = v_existing_target_id
            and enrollment.owner_account_id = p_owner_account_id
            and enrollment.program_id = p_content_id
            and enrollment.player_id = v_player_id;
        elsif p_operation = 'assign' then
          select enrollment.id into v_target_id
          from public.program_enrollments enrollment
          where enrollment.owner_account_id = p_owner_account_id
            and enrollment.program_id = p_content_id
            and enrollment.player_id = v_player_id
            and enrollment.start_date = v_start_date
          limit 1;
        else
          select enrollment.id into v_target_id
          from public.program_enrollments enrollment
          where enrollment.owner_account_id = p_owner_account_id
            and enrollment.program_id = p_content_id
            and enrollment.player_id = v_player_id
            and enrollment.status in ('active', 'paused')
          order by enrollment.start_date desc, enrollment.created_at desc
          limit 1;
        end if;

        if p_operation = 'assign' and v_target_id is not null then
          v_item_status := 'duplicate';
          v_reason_code := 'ASSIGNMENT_EXISTS';
          v_message := 'Program enrollment already exists for this start date.';
        elsif p_operation <> 'assign' and v_target_id is null then
          v_item_status := 'conflict';
          v_reason_code := 'ASSIGNMENT_NOT_FOUND';
          v_message := 'Program enrollment was not found.';
        elsif p_operation = 'update' and exists (
          select 1
          from public.program_enrollments collision
          where collision.owner_account_id = p_owner_account_id
            and collision.program_id = p_content_id
            and collision.player_id = v_player_id
            and collision.start_date = v_start_date
            and collision.id <> v_target_id
        ) then
          v_item_status := 'conflict';
          v_reason_code := 'ASSIGNMENT_EXISTS_FOR_START_DATE';
          v_message := 'Another program enrollment already exists for the requested start date.';
        elsif p_operation <> 'assign' and public.owner_bulk_program_started(v_target_id) then
          v_item_status := 'conflict';
          v_reason_code := 'PLAYER_PROGRESS_EXISTS';
          v_message := 'Program cannot be changed after player progress exists.';
        elsif p_operation = 'assign' then
          v_enrollment_status := coalesce(v_enrollment_status, 'active');
          if jsonb_typeof(v_plan -> 'programPlan') <> 'object' then
            raise exception 'Program materialization plan is missing.';
          end if;
          select result.enrollment_id, result.reused
            into v_target_id, v_reused
          from public.owner_bulk_enroll_training_program(
            p_owner_account_id,
            p_content_id,
            p_program_version_id,
            v_source_team_id,
            v_start_date,
            p_actor_user_id,
            jsonb_build_array(v_plan -> 'programPlan')
          ) result
          limit 1;
          if v_reused is false and v_enrollment_status = 'paused' then
            update public.program_enrollments
            set status = 'paused', paused_at = now()
            where id = v_target_id;
          end if;
          select * into v_enrollment from public.program_enrollments where id = v_target_id;
          v_after := public.owner_bulk_snapshot_program_enrollment(v_target_id)
            || jsonb_build_object('playerPlan', v_plan -> 'programPlan');
          v_item_status := case when v_reused then 'duplicate' else 'created' end;
          if v_reused then
            v_reason_code := 'ASSIGNMENT_EXISTS';
            v_message := 'Complete enrollment was reused idempotently.';
          end if;
        elsif p_operation = 'update' then
          if jsonb_typeof(v_plan -> 'programPlan') <> 'object' then
            raise exception 'Replacement program plan is required.';
          end if;
          select * into v_enrollment from public.program_enrollments where id = v_target_id for update;
          v_enrollment_status := coalesce(v_enrollment_status, v_enrollment.status);
          v_old_start_date := v_enrollment.start_date;
          v_before := public.owner_bulk_snapshot_program_enrollment(v_target_id);
          perform public.owner_bulk_delete_program_enrollment(v_target_id);
          select result.enrollment_id, result.reused
            into v_new_target_id, v_reused
          from public.owner_bulk_enroll_training_program(
            p_owner_account_id,
            p_content_id,
            p_program_version_id,
            v_source_team_id,
            v_start_date,
            p_actor_user_id,
            jsonb_build_array(v_plan -> 'programPlan')
          ) result
          limit 1;
          if v_reused then
            raise exception 'Program update collided with an existing enrollment for the requested start date.';
          end if;
          v_target_id := v_new_target_id;
          if v_enrollment_status = 'paused' then
            update public.program_enrollments set status = 'paused', paused_at = now() where id = v_target_id;
          end if;
          select * into v_enrollment from public.program_enrollments where id = v_target_id;
          v_after := public.owner_bulk_snapshot_program_enrollment(v_target_id)
            || jsonb_build_object('playerPlan', v_plan -> 'programPlan');
          v_item_status := 'updated';
        else
          select * into v_enrollment from public.program_enrollments where id = v_target_id for update;
          v_before := public.owner_bulk_snapshot_program_enrollment(v_target_id);
          perform public.owner_bulk_delete_program_enrollment(v_target_id);
          v_item_status := 'removed';
        end if;
      end if;

      insert into public.assignment_batch_items (
        owner_account_id, batch_id, player_id, status, target_type, target_id,
        before_snapshot, after_snapshot, materialized_target_ids, reason_code,
        message, rollback_status
      ) values (
        p_owner_account_id,
        v_batch_id,
        v_player_id,
        v_item_status,
        case p_content_type
          when 'activity' then 'activity'
          when 'exercise' then 'exercise_assignment'
          when 'training_template' then 'training_template_assignment'
          else 'program_enrollment'
        end,
        v_target_id,
        v_before,
        v_after,
        v_materialized,
        v_reason_code,
        v_message,
        case when v_item_status in ('created', 'updated', 'removed') then 'eligible' else 'not_applicable' end
      );

      case v_item_status
        when 'created' then v_created := v_created + 1;
        when 'updated' then v_updated := v_updated + 1;
        when 'removed' then v_removed := v_removed + 1;
        when 'duplicate' then v_duplicates := v_duplicates + 1;
        when 'conflict' then v_conflicts := v_conflicts + 1;
        else v_failed := v_failed + 1;
      end case;
    exception when others then
      insert into public.assignment_batch_items (
        owner_account_id, batch_id, player_id, status, target_type, target_id,
        reason_code, message, rollback_status
      ) values (
        p_owner_account_id,
        v_batch_id,
        coalesce(v_player_id, p_actor_user_id),
        'failed',
        case p_content_type
          when 'activity' then 'activity'
          when 'exercise' then 'exercise_assignment'
          when 'training_template' then 'training_template_assignment'
          else 'program_enrollment'
        end,
        v_target_id,
        'WRITE_FAILED',
        sqlerrm,
        'not_applicable'
      );
      v_failed := v_failed + 1;
    end;
  end loop;

  v_batch_status := case
    when v_created + v_updated + v_removed = 0 and v_failed + v_conflicts > 0 then 'failed'
    when v_failed + v_conflicts > 0 and v_created + v_updated + v_removed > 0 then 'partially_applied'
    else 'applied'
  end;

  v_preview_summary := case
    when jsonb_typeof(p_request_payload -> 'previewSummary') = 'object'
      then p_request_payload -> 'previewSummary'
    else '{}'::jsonb
  end;

  update public.assignment_batches batch
  set status = v_batch_status,
      summary = jsonb_build_object(
        'matched', coalesce(nullif(v_preview_summary ->> 'matched', '')::integer, v_total),
        'included', coalesce(nullif(v_preview_summary ->> 'included', '')::integer, v_total),
        'excluded', coalesce(nullif(v_preview_summary ->> 'excluded', '')::integer, 0),
        'duplicates', v_duplicates,
        'conflicts', v_conflicts,
        'created', v_created,
        'updated', v_updated,
        'removed', v_removed,
        'skipped', v_duplicates,
        'failed', v_failed
      ),
      applied_at = now(),
      updated_at = now()
  where batch.id = v_batch_id;

  return jsonb_build_object('batchId', v_batch_id, 'replayed', false);
end;
$apply_owner_bulk_assignment$;

create or replace function public.owner_bulk_exercise_template_has_dependencies(
  p_assignment_id uuid,
  p_exercise_id uuid,
  p_player_id uuid,
  p_task_template_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_task_template_id is not null and (
    exists (
      select 1
      from public.exercise_assignments assignment
      where assignment.id <> p_assignment_id
        and assignment.exercise_id = p_exercise_id
        and assignment.player_id = p_player_id
    )
    or exists (
      select 1
      from public.activity_tasks task
      where task.task_template_id = p_task_template_id
         or task.feedback_template_id = p_task_template_id
    )
    or exists (
      select 1
      from public.external_event_tasks task
      where task.task_template_id = p_task_template_id
         or task.feedback_template_id = p_task_template_id
    )
    or exists (
      select 1
      from public.task_template_self_feedback feedback
      where feedback.task_template_id = p_task_template_id
    )
    or exists (
      select 1
      from public.training_templates template
      where template.source_task_template_id = p_task_template_id
    )
    or exists (
      select 1
      from public.training_template_items item
      where item.source_task_template_id = p_task_template_id
    )
    or exists (
      select 1
      from public.task_template_categories category
      where category.task_template_id = p_task_template_id
    )
    or exists (
      select 1
      from public.task_template_category_periods period
      where period.task_template_id = p_task_template_id
    )
    or exists (
      select 1
      from public.task_template_archive_periods period
      where period.task_template_id = p_task_template_id
    )
    or exists (
      select 1
      from public.hidden_task_templates hidden
      where hidden.task_template_id = p_task_template_id
    )
  );
$$;

create or replace function public.owner_bulk_assignment_item_restore_state(
  p_owner_account_id uuid,
  p_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $rollback_item_preview$
declare
  v_item public.assignment_batch_items%rowtype;
  v_eligible boolean := false;
  v_applicable boolean := false;
  v_reason_code text;
  v_before_row jsonb;
  v_after_row jsonb;
  v_current jsonb;
  v_template_assignment public.training_template_assignments%rowtype;
begin
  select * into v_item
  from public.assignment_batch_items item
  where item.id = p_item_id
    and item.owner_account_id = p_owner_account_id;

  if v_item.id is null then
    return jsonb_build_object(
      'itemId', p_item_id,
      'playerId', null,
      'applicable', false,
      'eligible', false,
      'reasonCode', 'ITEM_NOT_FOUND'
    );
  end if;

  if v_item.rollback_status = 'rolled_back' then
    v_reason_code := 'ALREADY_ROLLED_BACK';
  elsif v_item.status not in ('created', 'updated', 'removed') then
    v_reason_code := 'NOT_APPLICABLE';
  else
    v_applicable := true;

    if v_item.target_type = 'activity' then
      if v_item.status = 'removed' then
        v_before_row := v_item.before_snapshot -> 'activity';
        v_eligible := not exists (
          select 1 from public.activities where id = v_item.target_id
        ) and not exists (
          select 1
          from public.activities activity
          where activity.source_activity_id::text = v_before_row ->> 'source_activity_id'
            and activity.user_id::text = v_before_row ->> 'user_id'
        );
        if not v_eligible then v_reason_code := 'ASSIGNMENT_CHANGED'; end if;
      else
        v_current := public.owner_bulk_snapshot_activity(v_item.target_id);
        v_eligible := v_current is not null
          and public.owner_bulk_activity_started(v_item.target_id) is false
          and v_current = v_item.after_snapshot;
        if not v_eligible then v_reason_code := 'PLAYER_PROGRESS_OR_ASSIGNMENT_CHANGED'; end if;
      end if;

    elsif v_item.target_type = 'exercise_assignment' then
      if v_item.status = 'removed' then
        v_before_row := v_item.before_snapshot -> 'assignment';
        v_after_row := v_item.before_snapshot -> 'taskTemplate';
        v_eligible := not exists (
          select 1
          from public.exercise_assignments assignment
          where assignment.id = v_item.target_id
             or (
               assignment.owner_account_id = p_owner_account_id
               and assignment.exercise_id::text = v_before_row ->> 'exercise_id'
               and assignment.player_id::text = v_before_row ->> 'player_id'
             )
        ) and (
          jsonb_typeof(v_after_row) <> 'object'
          or exists (
            select 1
            from public.task_templates task_template
            where task_template.id::text = v_after_row ->> 'id'
              and to_jsonb(task_template) = v_after_row
              and coalesce((
                select jsonb_agg(
                  to_jsonb(subtask)
                  order by subtask.sort_order, subtask.created_at, subtask.id
                )
                from public.task_template_subtasks subtask
                where subtask.task_template_id = task_template.id
              ), '[]'::jsonb) = coalesce(
                v_item.before_snapshot -> 'taskTemplateSubtasks',
                '[]'::jsonb
              )
          )
        );
        if not v_eligible then v_reason_code := 'ASSIGNMENT_CHANGED'; end if;
      else
        v_current := public.owner_bulk_snapshot_exercise_assignment(v_item.target_id);
        v_eligible := v_current is not null and v_current = v_item.after_snapshot;
        if v_item.status = 'updated' and exists (
          select 1
          from public.exercise_assignments other_assignment
          where other_assignment.id <> v_item.target_id
            and other_assignment.exercise_id::text = (v_item.after_snapshot #>> '{assignment,exercise_id}')
            and other_assignment.player_id::text = (v_item.after_snapshot #>> '{assignment,player_id}')
        ) then
          v_eligible := false;
        end if;
        if v_item.status = 'created'
           and coalesce((v_item.materialized_target_ids ->> 'taskTemplateCreated')::boolean, false)
           and jsonb_typeof(v_item.after_snapshot -> 'taskTemplate') = 'object'
           and public.owner_bulk_exercise_template_has_dependencies(
             v_item.target_id,
             nullif(v_item.after_snapshot #>> '{assignment,exercise_id}', '')::uuid,
             nullif(v_item.after_snapshot #>> '{assignment,player_id}', '')::uuid,
             nullif(v_item.after_snapshot #>> '{taskTemplate,id}', '')::uuid
           ) then
          v_eligible := false;
          v_reason_code := 'DOWNSTREAM_DEPENDENCIES';
        elsif not v_eligible then
          v_reason_code := 'ASSIGNMENT_CHANGED';
        end if;
      end if;

    elsif v_item.target_type = 'training_template_assignment' then
      select * into v_template_assignment
      from public.training_template_assignments assignment
      where assignment.id = v_item.target_id;

      if v_item.status = 'removed' then
        v_before_row := v_item.before_snapshot -> 'assignment';
        v_current := public.owner_bulk_snapshot_template_assignment(v_item.target_id);
        v_eligible := v_template_assignment.id is not null
          and v_template_assignment.status = 'removed'
          and v_current = v_item.after_snapshot
          and not exists (
            select 1
            from public.training_template_assignments other_assignment
            where other_assignment.owner_account_id = p_owner_account_id
              and other_assignment.template_id::text = v_before_row ->> 'template_id'
              and other_assignment.player_id::text = v_before_row ->> 'player_id'
              and other_assignment.start_date::text = v_before_row ->> 'start_date'
              and other_assignment.status = 'active'
          );
        if not v_eligible then v_reason_code := 'ASSIGNMENT_CHANGED'; end if;
      else
        v_current := public.owner_bulk_snapshot_template_assignment(v_item.target_id);
        v_eligible := v_current is not null
          and public.owner_bulk_template_assignment_started(v_item.target_id) is false
          and v_current = v_item.after_snapshot;
        if not v_eligible then v_reason_code := 'PLAYER_PROGRESS_OR_ASSIGNMENT_CHANGED'; end if;
      end if;

    elsif v_item.target_type = 'program_enrollment' then
      if v_item.status = 'removed' then
        v_before_row := v_item.before_snapshot -> 'enrollment';
        v_eligible := not exists (
          select 1 from public.program_enrollments where id = v_item.target_id
        ) and not exists (
          select 1
          from public.program_enrollments enrollment
          where enrollment.program_id::text = v_before_row ->> 'program_id'
            and enrollment.player_id::text = v_before_row ->> 'player_id'
            and enrollment.start_date::text = v_before_row ->> 'start_date'
        );
        if not v_eligible then v_reason_code := 'ASSIGNMENT_CHANGED'; end if;
      else
        v_current := public.owner_bulk_snapshot_program_enrollment(v_item.target_id);
        v_after_row := v_item.after_snapshot - 'playerPlan';
        v_eligible := v_current is not null
          and public.owner_bulk_program_started(v_item.target_id) is false
          and v_current = v_after_row;
        if not v_eligible then v_reason_code := 'PLAYER_PROGRESS_OR_ASSIGNMENT_CHANGED'; end if;
      end if;
    else
      v_reason_code := 'NOT_APPLICABLE';
      v_applicable := false;
    end if;
  end if;

  return jsonb_build_object(
    'itemId', v_item.id,
    'playerId', v_item.player_id,
    'applicable', v_applicable,
    'eligible', v_eligible,
    'reasonCode', v_reason_code
  );
end;
$rollback_item_preview$;

create or replace function public.get_owner_bulk_assignment_rollback_preview(
  p_owner_account_id uuid,
  p_actor_user_id uuid,
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $bulk_rollback_preview$
declare
  v_batch public.assignment_batches%rowtype;
  v_item public.assignment_batch_items%rowtype;
  v_eligible boolean;
  v_reason_code text;
  v_items jsonb := '[]'::jsonb;
  v_eligible_count integer := 0;
  v_conflict_count integer := 0;
  v_applicable_count integer := 0;
  v_before_row jsonb;
  v_after_row jsonb;
  v_current jsonb;
  v_template_assignment public.training_template_assignments%rowtype;
  v_enrollment public.program_enrollments%rowtype;
begin
  if public.has_owner_account_coach_access(p_owner_account_id, p_actor_user_id) is not true then
    raise exception 'BULK_FORBIDDEN: Actor does not have coach access to this owner.'
      using errcode = '42501';
  end if;

  select * into v_batch
  from public.assignment_batches batch
  where batch.id = p_batch_id
    and batch.owner_account_id = p_owner_account_id;

  if v_batch.id is null then
    raise exception 'BULK_BATCH_NOT_FOUND: Assignment batch was not found.'
      using errcode = '22023';
  end if;

  for v_item in
    select *
    from public.assignment_batch_items item
    where item.batch_id = p_batch_id
    order by item.created_at, item.id
  loop
    v_current := public.owner_bulk_assignment_item_restore_state(
      p_owner_account_id,
      v_item.id
    );
    v_eligible := coalesce((v_current ->> 'eligible')::boolean, false);
    v_reason_code := v_current ->> 'reasonCode';

    if coalesce((v_current ->> 'applicable')::boolean, false) then
      v_applicable_count := v_applicable_count + 1;
    end if;

    if v_eligible then
      v_eligible_count := v_eligible_count + 1;
    elsif coalesce((v_current ->> 'applicable')::boolean, false) then
      v_conflict_count := v_conflict_count + 1;
    end if;

    v_items := v_items || jsonb_build_array(v_current - 'applicable');
  end loop;

  return jsonb_build_object(
    'batchId', v_batch.id,
    'ownerAccountId', v_batch.owner_account_id,
    'eligible', v_eligible_count > 0,
    'eligibleCount', v_eligible_count,
    'conflictCount', v_conflict_count,
    'applicableCount', v_applicable_count,
    'items', v_items
  );
end;
$bulk_rollback_preview$;

create or replace function public.rollback_owner_bulk_assignment(
  p_owner_account_id uuid,
  p_actor_user_id uuid,
  p_batch_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $rollback_owner_bulk_assignment$
declare
  v_batch public.assignment_batches%rowtype;
  v_item public.assignment_batch_items%rowtype;
  v_preview jsonb;
  v_state jsonb;
  v_template_assignment public.training_template_assignments%rowtype;
  v_before_enrollment jsonb;
  v_before_assignment jsonb;
  v_before_template jsonb;
  v_after_template jsonb;
  v_restored_target_id uuid;
  v_reused boolean;
  v_snapshot_entry jsonb;
  v_rolled_back integer := 0;
  v_conflicts integer := 0;
  v_applicable integer := 0;
  v_batch_status text;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'BULK_VALIDATION_ERROR: rollback idempotencyKey must contain 8-200 characters.'
      using errcode = '22023';
  end if;

  if public.has_owner_account_coach_access(p_owner_account_id, p_actor_user_id) is not true then
    raise exception 'BULK_FORBIDDEN: Actor does not have coach access to this owner.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_account_id::text || ':' || p_batch_id::text || ':rollback', 287));

  select * into v_batch
  from public.assignment_batches batch
  where batch.id = p_batch_id
    and batch.owner_account_id = p_owner_account_id
  for update;

  if v_batch.id is null then
    raise exception 'BULK_BATCH_NOT_FOUND: Assignment batch was not found.'
      using errcode = '22023';
  end if;

  if v_batch.rollback_idempotency_key is not null
     and v_batch.rollback_idempotency_key <> p_idempotency_key then
    raise exception 'BULK_IDEMPOTENCY_CONFLICT: rollback was already requested with a different idempotencyKey.'
      using errcode = '23505';
  end if;

  if v_batch.rollback_idempotency_key is null then
    update public.assignment_batches batch
    set rollback_idempotency_key = p_idempotency_key,
        rollback_requested_by = p_actor_user_id,
        updated_at = now()
    where batch.id = p_batch_id
    returning * into v_batch;
  end if;

  if v_batch.status in ('rolled_back', 'partially_rolled_back')
     and v_batch.rolled_back_at is not null then
    return jsonb_build_object(
      'batchId', v_batch.id,
      'ownerAccountId', v_batch.owner_account_id,
      'replayed', true,
      'summary', v_batch.summary
    );
  end if;

  for v_item in
    select *
    from public.assignment_batch_items item
    where item.batch_id = p_batch_id
      and item.status in ('created', 'updated', 'removed')
      and item.rollback_status <> 'rolled_back'
    order by item.created_at desc, item.id desc
  loop
    v_applicable := v_applicable + 1;
    v_state := public.owner_bulk_assignment_item_restore_state(
      p_owner_account_id,
      v_item.id
    );

    if coalesce((v_state ->> 'eligible')::boolean, false) is not true then
      update public.assignment_batch_items item
      set rollback_status = 'conflict',
          rollback_reason_code = coalesce(v_state ->> 'reasonCode', 'ROLLBACK_CONFLICT'),
          rollback_message = 'Assignment changed or player progress exists; rollback was skipped.',
          updated_at = now()
      where item.id = v_item.id;
      v_conflicts := v_conflicts + 1;
      continue;
    end if;

    begin
      v_restored_target_id := null;

      if v_item.status = 'removed' then
        if v_item.target_type = 'activity' then
          perform 1
          from public.activities activity
          where activity.id = v_item.target_id
             or (
               activity.source_activity_id::text = v_item.before_snapshot #>> '{activity,source_activity_id}'
               and activity.user_id::text = v_item.before_snapshot #>> '{activity,user_id}'
             )
          order by activity.id
          for update;
        elsif v_item.target_type = 'exercise_assignment' then
          perform 1
          from public.exercise_assignments assignment
          where assignment.id = v_item.target_id
             or (
               assignment.exercise_id::text = v_item.before_snapshot #>> '{assignment,exercise_id}'
               and assignment.player_id::text = v_item.before_snapshot #>> '{assignment,player_id}'
             )
          order by assignment.id
          for update;
          if jsonb_typeof(v_item.before_snapshot -> 'taskTemplate') = 'object' then
            perform 1
            from public.task_templates template
            where template.id::text = v_item.before_snapshot #>> '{taskTemplate,id}'
            for update;
            perform 1
            from public.task_template_subtasks subtask
            where subtask.task_template_id::text = v_item.before_snapshot #>> '{taskTemplate,id}'
            order by subtask.id
            for update;
          end if;
        elsif v_item.target_type = 'training_template_assignment' then
          perform public.owner_bulk_lock_target_state('training_template', v_item.target_id);
        else
          perform 1
          from public.program_enrollments enrollment
          where enrollment.id = v_item.target_id
             or (
               enrollment.owner_account_id = p_owner_account_id
               and enrollment.program_id::text = v_item.before_snapshot #>> '{enrollment,program_id}'
               and enrollment.player_id::text = v_item.before_snapshot #>> '{enrollment,player_id}'
               and enrollment.start_date::text = v_item.before_snapshot #>> '{enrollment,start_date}'
             )
          order by enrollment.id
          for update;
        end if;
      else
        perform public.owner_bulk_lock_target_state(
          case v_item.target_type
            when 'activity' then 'activity'
            when 'exercise_assignment' then 'exercise'
            when 'training_template_assignment' then 'training_template'
            else 'program'
          end,
          v_item.target_id
        );
      end if;

      v_state := public.owner_bulk_assignment_item_restore_state(
        p_owner_account_id,
        v_item.id
      );
      if coalesce((v_state ->> 'eligible')::boolean, false) is not true then
        update public.assignment_batch_items item
        set rollback_status = 'conflict',
            rollback_reason_code = coalesce(v_state ->> 'reasonCode', 'ROLLBACK_CONFLICT'),
            rollback_message = 'Assignment changed or player progress exists; rollback was skipped.',
            updated_at = now()
        where item.id = v_item.id;
        v_conflicts := v_conflicts + 1;
        continue;
      end if;

      if v_item.target_type = 'activity' then
        if v_item.status in ('created', 'updated') then
          delete from public.activities where id = v_item.target_id;
        end if;
        if v_item.status in ('updated', 'removed') then
          v_restored_target_id := public.owner_bulk_restore_activity(v_item.before_snapshot);
        end if;

      elsif v_item.target_type = 'exercise_assignment' then
        v_after_template := v_item.after_snapshot -> 'taskTemplate';
        if v_item.status in ('created', 'updated') then
          if v_item.status = 'created'
             and coalesce((v_item.materialized_target_ids ->> 'taskTemplateCreated')::boolean, false)
             and jsonb_typeof(v_after_template) = 'object'
             and public.owner_bulk_exercise_template_has_dependencies(
               v_item.target_id,
               nullif(v_item.after_snapshot #>> '{assignment,exercise_id}', '')::uuid,
               nullif(v_item.after_snapshot #>> '{assignment,player_id}', '')::uuid,
               nullif(v_after_template ->> 'id', '')::uuid
             ) then
            update public.assignment_batch_items item
            set rollback_status = 'conflict',
                rollback_reason_code = 'DOWNSTREAM_DEPENDENCIES',
                rollback_message = 'Exercise assignment has downstream usage; rollback was skipped.',
                updated_at = now()
            where item.id = v_item.id;
            v_conflicts := v_conflicts + 1;
            continue;
          end if;

          delete from public.exercise_assignments where id = v_item.target_id;
          if v_item.status = 'created'
             and coalesce((v_item.materialized_target_ids ->> 'taskTemplateCreated')::boolean, false)
             and jsonb_typeof(v_after_template) = 'object'
          then
            delete from public.task_templates where id = (v_after_template ->> 'id')::uuid;
          end if;
        end if;

        if v_item.status in ('updated', 'removed') then
          v_before_assignment := v_item.before_snapshot -> 'assignment';
          v_before_template := v_item.before_snapshot -> 'taskTemplate';
          insert into public.exercise_assignments
          select (jsonb_populate_record(null::public.exercise_assignments, v_before_assignment)).*;
          v_restored_target_id := (v_before_assignment ->> 'id')::uuid;
          if jsonb_typeof(v_before_template) = 'object' and not exists (
            select 1 from public.task_templates where id = (v_before_template ->> 'id')::uuid
          ) then
            insert into public.task_templates
            select (jsonb_populate_record(null::public.task_templates, v_before_template)).*;
            for v_snapshot_entry in
              select entry.value
              from jsonb_array_elements(coalesce(v_item.before_snapshot -> 'taskTemplateSubtasks', '[]'::jsonb)) entry(value)
            loop
              insert into public.task_template_subtasks
              select (jsonb_populate_record(null::public.task_template_subtasks, v_snapshot_entry)).*;
            end loop;
          end if;
        end if;

      elsif v_item.target_type = 'training_template_assignment' then
        select * into v_template_assignment
        from public.training_template_assignments assignment
        where assignment.id = v_item.target_id
        for update;

        if v_template_assignment.id is not null then
          delete from public.tasks where id = any(v_template_assignment.materialized_task_ids);
          delete from public.activities where id = any(v_template_assignment.materialized_activity_ids);
          delete from public.training_template_assignments where id = v_template_assignment.id;
        end if;

        if v_item.status in ('updated', 'removed') then
          insert into public.training_template_assignments
          select (jsonb_populate_record(null::public.training_template_assignments, v_item.before_snapshot -> 'assignment')).*;
          v_restored_target_id := (v_item.before_snapshot #>> '{assignment,id}')::uuid;
          for v_snapshot_entry in
            select entry.value from jsonb_array_elements(coalesce(v_item.before_snapshot -> 'tasks', '[]'::jsonb)) entry(value)
          loop
            insert into public.tasks
            select (jsonb_populate_record(null::public.tasks, v_snapshot_entry)).*;
          end loop;
          for v_snapshot_entry in
            select entry.value from jsonb_array_elements(coalesce(v_item.before_snapshot -> 'activities', '[]'::jsonb)) entry(value)
          loop
            perform public.owner_bulk_restore_activity(v_snapshot_entry);
          end loop;
        end if;

      elsif v_item.target_type = 'program_enrollment' then
        if v_item.status in ('created', 'updated') then
          perform public.owner_bulk_delete_program_enrollment(v_item.target_id);
        end if;

        if v_item.status in ('updated', 'removed') then
          v_before_enrollment := v_item.before_snapshot -> 'enrollment';
          insert into public.program_enrollments
          select (jsonb_populate_record(null::public.program_enrollments, v_before_enrollment)).*;
          v_restored_target_id := (v_before_enrollment ->> 'id')::uuid;
          for v_snapshot_entry in
            select entry.value from jsonb_array_elements(coalesce(v_item.before_snapshot -> 'items', '[]'::jsonb)) entry(value)
          loop
            if jsonb_typeof(v_snapshot_entry -> 'task') = 'object' then
              insert into public.tasks
              select (jsonb_populate_record(null::public.tasks, v_snapshot_entry -> 'task')).*;
            end if;
            if jsonb_typeof(v_snapshot_entry -> 'activity') = 'object' then
              perform public.owner_bulk_restore_activity(v_snapshot_entry -> 'activity');
            end if;
            insert into public.program_enrollment_items
            select (jsonb_populate_record(null::public.program_enrollment_items, v_snapshot_entry -> 'item')).*;
          end loop;
        end if;
      end if;

      update public.assignment_batch_items item
      set rollback_status = 'rolled_back',
          rollback_reason_code = null,
          rollback_message = null,
          materialized_target_ids = item.materialized_target_ids || case
            when v_restored_target_id is null then '{}'::jsonb
            else jsonb_build_object('restoredTargetId', v_restored_target_id)
          end,
          rolled_back_at = now(),
          updated_at = now()
      where item.id = v_item.id;
      v_rolled_back := v_rolled_back + 1;
    exception when others then
      update public.assignment_batch_items item
      set rollback_status = 'conflict',
          rollback_reason_code = 'ROLLBACK_WRITE_FAILED',
          rollback_message = sqlerrm,
          updated_at = now()
      where item.id = v_item.id;
      v_conflicts := v_conflicts + 1;
    end;
  end loop;

  v_batch_status := case when v_conflicts = 0 then 'rolled_back' else 'partially_rolled_back' end;
  update public.assignment_batches batch
  set status = v_batch_status,
      summary = batch.summary || jsonb_build_object(
        'rolledBack', v_rolled_back,
        'rollbackConflicts', v_conflicts
      ),
      rolled_back_at = now(),
      updated_at = now()
  where batch.id = p_batch_id
  returning * into v_batch;

  return jsonb_build_object(
    'batchId', v_batch.id,
    'ownerAccountId', v_batch.owner_account_id,
    'replayed', false,
    'summary', v_batch.summary
  );
end;
$rollback_owner_bulk_assignment$;

do $owner_bulk_assignment_permissions$
begin
  execute 'revoke all on function public.guard_owner_assignment_provenance() from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_snapshot_activity(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_activity_started(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_program_started(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_template_assignment_started(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_snapshot_template_assignment(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_snapshot_program_enrollment(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_snapshot_exercise_assignment(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_target_state_hashes(text, uuid[]) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_source_state_hash(uuid, text, uuid, uuid, uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_lock_source_state(uuid, text, uuid, uuid, uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_lock_target_state(text, uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_restore_activity(jsonb) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_delete_program_enrollment(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_enroll_training_program(uuid, uuid, uuid, uuid, date, uuid, jsonb) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_materialize_template_assignment(uuid, jsonb) from public, anon, authenticated';
  execute 'revoke all on function public.apply_owner_bulk_assignment(uuid, uuid, text, text, uuid, text, text, text, jsonb, jsonb, jsonb, uuid, uuid, uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_exercise_template_has_dependencies(uuid, uuid, uuid, uuid) from public, anon, authenticated';
  execute 'revoke all on function public.owner_bulk_assignment_item_restore_state(uuid, uuid) from public, anon, authenticated';
  execute 'revoke all on function public.get_owner_bulk_assignment_rollback_preview(uuid, uuid, uuid) from public, anon, authenticated';
  execute 'revoke all on function public.rollback_owner_bulk_assignment(uuid, uuid, uuid, text) from public, anon, authenticated';

  execute 'grant execute on function public.owner_bulk_snapshot_activity(uuid) to service_role';
  execute 'grant execute on function public.guard_owner_assignment_provenance() to service_role';
  execute 'grant execute on function public.owner_bulk_activity_started(uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_program_started(uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_template_assignment_started(uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_snapshot_template_assignment(uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_snapshot_program_enrollment(uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_snapshot_exercise_assignment(uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_target_state_hashes(text, uuid[]) to service_role';
  execute 'grant execute on function public.owner_bulk_source_state_hash(uuid, text, uuid, uuid, uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_lock_source_state(uuid, text, uuid, uuid, uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_lock_target_state(text, uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_restore_activity(jsonb) to service_role';
  execute 'grant execute on function public.owner_bulk_delete_program_enrollment(uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_enroll_training_program(uuid, uuid, uuid, uuid, date, uuid, jsonb) to service_role';
  execute 'grant execute on function public.owner_bulk_materialize_template_assignment(uuid, jsonb) to service_role';
  execute 'grant execute on function public.apply_owner_bulk_assignment(uuid, uuid, text, text, uuid, text, text, text, jsonb, jsonb, jsonb, uuid, uuid, uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_exercise_template_has_dependencies(uuid, uuid, uuid, uuid) to service_role';
  execute 'grant execute on function public.owner_bulk_assignment_item_restore_state(uuid, uuid) to service_role';
  execute 'grant execute on function public.get_owner_bulk_assignment_rollback_preview(uuid, uuid, uuid) to service_role';
  execute 'grant execute on function public.rollback_owner_bulk_assignment(uuid, uuid, uuid, text) to service_role';
end;
$owner_bulk_assignment_permissions$;
