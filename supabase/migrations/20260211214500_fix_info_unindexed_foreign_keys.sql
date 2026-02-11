-- Issue #149 INFO cleanup
-- Add covering indexes for foreign keys flagged as unindexed_foreign_keys.

create index if not exists idx_activity_series_category_id_fk
  on public.activity_series (category_id);

create index if not exists idx_activity_series_player_id_fk
  on public.activity_series (player_id);

create index if not exists idx_activity_series_team_id_fk
  on public.activity_series (team_id);

create index if not exists idx_category_mappings_internal_category_id_fk
  on public.category_mappings (internal_category_id);

create index if not exists idx_event_sync_log_external_event_id_fk
  on public.event_sync_log (external_event_id);

create index if not exists idx_event_sync_log_user_id_fk
  on public.event_sync_log (user_id);

create index if not exists idx_events_local_meta_player_id_fk
  on public.events_local_meta (player_id);

create index if not exists idx_events_local_meta_team_id_fk
  on public.events_local_meta (team_id);

create index if not exists idx_external_event_mappings_external_event_id_fk
  on public.external_event_mappings (external_event_id);

create index if not exists idx_hidden_activity_categories_category_id_fk
  on public.hidden_activity_categories (category_id);

create index if not exists idx_local_event_meta_category_id_fk
  on public.local_event_meta (category_id);

create index if not exists idx_local_event_meta_external_event_id_fk
  on public.local_event_meta (external_event_id);

create index if not exists idx_local_event_meta_user_id_fk
  on public.local_event_meta (user_id);

create index if not exists idx_player_invitations_player_id_fk
  on public.player_invitations (player_id);

create index if not exists idx_subscriptions_admin_id_fk
  on public.subscriptions (admin_id);

create index if not exists idx_subscriptions_plan_id_fk
  on public.subscriptions (plan_id);

create index if not exists idx_teams_admin_id_fk
  on public.teams (admin_id);

create index if not exists idx_weekly_performance_player_id_fk
  on public.weekly_performance (player_id);

create index if not exists idx_weekly_performance_team_id_fk
  on public.weekly_performance (team_id);
