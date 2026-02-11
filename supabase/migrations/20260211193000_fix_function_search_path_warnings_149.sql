-- Issue #149: Function Search Path Mutable warnings
-- Harden search_path for functions flagged by Supabase Security Advisor.

alter function public.is_admin(uuid)
  set search_path = public, pg_temp;

alter function public.ensure_events_local_intensity_enabled()
  set search_path = public, pg_temp;

alter function public.get_player_admins(uuid)
  set search_path = public, pg_temp;

alter function public.update_series_activities()
  set search_path = public, pg_temp;

alter function public.update_profiles_updated_at()
  set search_path = public, pg_temp;

alter function public.update_category_updated_at()
  set search_path = public, pg_temp;

alter function public.fix_missing_activity_tasks()
  set search_path = public, pg_temp;

alter function public.trigger_fix_tasks_on_template_category_change()
  set search_path = public, pg_temp;

alter function public.migrate_external_activities()
  set search_path = public, pg_temp;

alter function public.check_player_limit()
  set search_path = public, pg_temp;

alter function public.get_subscription_status(uuid)
  set search_path = public, pg_temp;

alter function public.trigger_create_tasks_for_external_event()
  set search_path = public, pg_temp;

alter function public.handle_new_user_signup()
  set search_path = public, pg_temp;

alter function public.trigger_fix_external_tasks_on_template_category_change()
  set search_path = public, pg_temp;

alter function public.seed_default_data_for_user(uuid)
  set search_path = public, pg_temp;

alter function public.calculate_weekly_performance(uuid, integer, integer)
  set search_path = public, pg_temp;

alter function public.trigger_create_tasks_for_activity()
  set search_path = public, pg_temp;

alter function public.trigger_update_tasks_on_category_change()
  set search_path = public, pg_temp;

alter function public.trigger_update_timestamp()
  set search_path = public, pg_temp;

alter function public.trigger_update_weekly_performance()
  set search_path = public, pg_temp;

alter function public.update_weekly_performance(uuid, integer, integer)
  set search_path = public, pg_temp;
