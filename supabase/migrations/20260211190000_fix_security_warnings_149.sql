-- Issue #149: Supabase security lint fixes
-- 1) Security Definer View: public.activities_combined
-- 2) Function Search Path Mutable: public.get_user_role(uuid)

alter view public.activities_combined
  set (security_invoker = true);

alter function public.get_user_role(uuid)
  set search_path = public, pg_temp;
