-- Issue #149 performance batch 7 (final cleanup)
-- Remaining multiple_permissive_policies warnings:
-- - event_sync_log (service-role policy overlapped with user select policy)
-- - events_external (service-role policy overlapped with user select policy)
-- - task_template_categories (admin + user insert/delete policies for same role/action)

-- Restrict service policies to service_role only so they no longer overlap anon/authenticated reads.
alter policy "Service role can manage sync logs"
  on public.event_sync_log
  to service_role;

alter policy "Service role can manage external events"
  on public.events_external
  to service_role;

-- Consolidate INSERT policies on task_template_categories.
drop policy if exists "Users can insert their own task template categories" on public.task_template_categories;
drop policy if exists "Admins can insert their players task template categories" on public.task_template_categories;

create policy "Users/admins can insert task template categories"
  on public.task_template_categories
  as permissive
  for insert
  to public
with check (
  exists (
    select 1
    from public.task_templates tt
    where tt.id = task_template_categories.task_template_id
      and tt.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.task_templates tt
    join public.admin_player_relationships apr
      on apr.player_id = tt.user_id
    where tt.id = task_template_categories.task_template_id
      and apr.admin_id = auth.uid()
  )
);

-- Consolidate DELETE policies on task_template_categories.
drop policy if exists "Users can delete their own task template categories" on public.task_template_categories;
drop policy if exists "Admins can delete their players task template categories" on public.task_template_categories;

create policy "Users/admins can delete task template categories"
  on public.task_template_categories
  as permissive
  for delete
  to public
using (
  exists (
    select 1
    from public.task_templates tt
    where tt.id = task_template_categories.task_template_id
      and tt.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.task_templates tt
    join public.admin_player_relationships apr
      on apr.player_id = tt.user_id
    where tt.id = task_template_categories.task_template_id
      and apr.admin_id = auth.uid()
  )
);
