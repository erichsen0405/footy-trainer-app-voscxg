create or replace function public.set_task_template_archived_for_actor(
  p_task_id uuid,
  p_archived boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_actor is null then
    return false;
  end if;

  update public.task_templates tt
  set
    archived_at = case when p_archived then now() else null end,
    updated_at = now()
  where tt.id = p_task_id
    and (
      tt.user_id = v_actor
      or tt.player_id = v_actor
      or (
        tt.team_id is not null
        and exists (
          select 1
          from public.team_members tm
          where tm.team_id = tt.team_id
            and tm.player_id = v_actor
        )
      )
    );

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

grant execute on function public.set_task_template_archived_for_actor(uuid, boolean) to authenticated;
