-- Issue #47: stop auto-seeding task templates for new users

drop trigger if exists on_user_created on auth.users;
drop trigger if exists trigger_seed_new_user on auth.users;

drop function if exists public.trigger_seed_new_user();
drop function if exists public.seed_default_data_for_user(uuid);
