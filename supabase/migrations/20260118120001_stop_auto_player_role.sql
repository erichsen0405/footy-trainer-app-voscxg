-- Disable triggers/functions that auto-insert user_roles with a default role (e.g., 'player')
DO $$
DECLARE
  trig record;
BEGIN
  FOR trig IN
    SELECT tgname
    FROM pg_trigger t
    WHERE t.tgrelid = 'auth.users'::regclass
      AND t.tgenabled <> 'D'
      AND pg_get_functiondef(t.tgfoid) ILIKE '%user_roles%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users;', trig.tgname);
  END LOOP;

  -- Optionally drop helper function if it only served the auto-role insert
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
    DROP FUNCTION IF EXISTS public.handle_new_user();
  END IF;
END $$;
