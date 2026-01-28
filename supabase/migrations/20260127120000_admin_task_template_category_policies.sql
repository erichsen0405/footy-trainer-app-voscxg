drop policy if exists "Admins can insert their players task template categories" on public.task_template_categories;

create policy "Admins can insert their players task template categories"
  on public.task_template_categories
  as permissive
  for insert
  to authenticated
with check (
  exists (
    select 1
    from public.task_templates tt
    join public.admin_player_relationships apr
      on apr.player_id = tt.user_id
    where tt.id = task_template_categories.task_template_id
      and apr.admin_id = auth.uid()
  )
);

drop policy if exists "Admins can delete their players task template categories" on public.task_template_categories;

create policy "Admins can delete their players task template categories"
  on public.task_template_categories
  as permissive
  for delete
  to authenticated
using (
  exists (
    select 1
    from public.task_templates tt
    join public.admin_player_relationships apr
      on apr.player_id = tt.user_id
    where tt.id = task_template_categories.task_template_id
      and apr.admin_id = auth.uid()
  )
);

drop policy if exists "Admins can update their players task template categories" on public.task_template_categories;

create policy "Admins can update their players task template categories"
  on public.task_template_categories
  as permissive
  for update
  to authenticated
using (
  exists (
    select 1
    from public.task_templates tt
    join public.admin_player_relationships apr
      on apr.player_id = tt.user_id
    where tt.id = task_template_categories.task_template_id
      and apr.admin_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.task_templates tt
    join public.admin_player_relationships apr
      on apr.player_id = tt.user_id
    where tt.id = task_template_categories.task_template_id
      and apr.admin_id = auth.uid()
  )
);
