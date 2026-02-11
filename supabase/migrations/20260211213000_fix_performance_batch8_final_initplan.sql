-- Issue #149 performance batch 8 (final)
-- Fix remaining auth_rls_initplan warnings on task_template_categories.

drop policy if exists "Users/admins can insert task template categories" on public.task_template_categories;

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
      and tt.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.task_templates tt
    join public.admin_player_relationships apr
      on apr.player_id = tt.user_id
    where tt.id = task_template_categories.task_template_id
      and apr.admin_id = (select auth.uid())
  )
);

drop policy if exists "Users/admins can delete task template categories" on public.task_template_categories;

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
      and tt.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.task_templates tt
    join public.admin_player_relationships apr
      on apr.player_id = tt.user_id
    where tt.id = task_template_categories.task_template_id
      and apr.admin_id = (select auth.uid())
  )
);
