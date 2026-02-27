-- Allow players to view all exercises created by trainers they are linked to
-- (not only exercises explicitly assigned via exercise_assignments).

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'exercise_library'
      and policyname = 'Players can view linked trainers exercises'
  ) then
    create policy "Players can view linked trainers exercises"
      on public.exercise_library
      as permissive
      for select
      to public
      using (
        exists (
          select 1
          from public.admin_player_relationships apr
          where apr.player_id = (select auth.uid())
            and apr.admin_id = exercise_library.trainer_id
        )
      );
  end if;
end
$$;

-- Keep subtasks readable for those newly visible linked-trainer exercises.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'exercise_subtasks'
      and policyname = 'Players can view subtasks for linked trainers exercises'
  ) then
    create policy "Players can view subtasks for linked trainers exercises"
      on public.exercise_subtasks
      as permissive
      for select
      to public
      using (
        exists (
          select 1
          from public.exercise_library el
          join public.admin_player_relationships apr
            on apr.admin_id = el.trainer_id
          where el.id = exercise_subtasks.exercise_id
            and apr.player_id = (select auth.uid())
        )
      );
  end if;
end
$$;
