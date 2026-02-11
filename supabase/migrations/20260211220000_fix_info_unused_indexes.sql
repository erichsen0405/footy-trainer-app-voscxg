-- Issue #149 INFO cleanup
-- Drop indexes flagged as unused (non-FK indexes only).

DROP INDEX IF EXISTS public.apple_entitlements_original_transaction_id_idx;
DROP INDEX IF EXISTS public.idx_activities_category_updated_at;
DROP INDEX IF EXISTS public.idx_activity_categories_is_system;
DROP INDEX IF EXISTS public.idx_activity_categories_team_id;
DROP INDEX IF EXISTS public.idx_events_external_uid;
DROP INDEX IF EXISTS public.idx_player_invitations_code;
DROP INDEX IF EXISTS public.idx_player_invitations_status;
DROP INDEX IF EXISTS public.idx_profiles_subscription_product_id;
DROP INDEX IF EXISTS public.idx_profiles_subscription_tier;
DROP INDEX IF EXISTS public.idx_task_templates_team_id;
DROP INDEX IF EXISTS public.idx_tasks_is_template;
DROP INDEX IF EXISTS public.idx_trophies_week_year;
DROP INDEX IF EXISTS public.idx_user_roles_role;
DROP INDEX IF EXISTS public.ix_external_events_dtstart_summary;
DROP INDEX IF EXISTS public.ix_external_events_summary;
DROP INDEX IF EXISTS public.ix_mappings_provider_uid;
DROP INDEX IF EXISTS public.user_entitlements_user_id_idx;
DROP INDEX IF EXISTS public.weekly_performance_year_week_idx;