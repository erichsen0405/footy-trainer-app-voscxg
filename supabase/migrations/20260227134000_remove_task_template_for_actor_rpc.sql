create or replace function public.remove_task_template_for_actor(
  p_task_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template record;
  v_authorized boolean := false;
  v_deleted integer := 0;
begin
  if v_actor is null then
    return false;
  end if;

  select
    tt.id,
    tt.user_id,
    tt.player_id,
    tt.team_id,
    tt.library_exercise_id
  into v_template
  from public.task_templates tt
  where tt.id = p_task_id;

  if not found then
    return false;
  end if;

  v_authorized :=
    v_template.user_id = v_actor
    or (v_template.player_id is not null and v_template.player_id = v_actor)
    or (
      v_template.team_id is not null
      and exists (
        select 1
        from public.team_members tm
        where tm.team_id = v_template.team_id
          and tm.player_id = v_actor
      )
    );

  if not v_authorized then
    return false;
  end if;

  if v_template.library_exercise_id is not null then
    delete from public.exercise_assignments ea
    where ea.exercise_id = v_template.library_exercise_id
      and ea.trainer_id = v_template.user_id
      and (
        (v_template.player_id is not null and ea.player_id = v_template.player_id and ea.team_id is null)
        or
        (v_template.team_id is not null and ea.team_id = v_template.team_id and ea.player_id is null)
      );
  end if;

  delete from public.task_templates tt
  where tt.id = p_task_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function public.remove_task_template_for_actor(uuid) to authenticated;
