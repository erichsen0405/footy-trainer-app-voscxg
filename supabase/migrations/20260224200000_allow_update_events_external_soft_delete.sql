drop policy if exists "Users/admins can update external events from accessible calendars" on public.events_external;

create policy "Users/admins can update external events from accessible calendars"
  on public.events_external
  as permissive
  for update
  to public
using (
  provider_calendar_id in (
    select ec.id
    from public.external_calendars ec
    where ec.user_id = auth.uid()
  )
  or provider_calendar_id in (
    select ec.id
    from public.external_calendars ec
    join public.admin_player_relationships apr
      on apr.player_id = ec.user_id
    where apr.admin_id = auth.uid()
  )
)
with check (
  provider_calendar_id is null
  or provider_calendar_id in (
    select ec.id
    from public.external_calendars ec
    where ec.user_id = auth.uid()
  )
  or provider_calendar_id in (
    select ec.id
    from public.external_calendars ec
    join public.admin_player_relationships apr
      on apr.player_id = ec.user_id
    where apr.admin_id = auth.uid()
  )
);
