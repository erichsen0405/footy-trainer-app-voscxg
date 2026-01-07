-- Ensure intensity column and guard constraint exist on activities
alter table if exists public.activities
  add column if not exists intensity integer;

-- Normalize any legacy/invalid values so the constraint cannot fail on existing rows
update public.activities
set intensity = null
where intensity is not null
  and (intensity < 1 or intensity > 10);

-- Recreate the constraint only if it is missing to avoid migration failures
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.activities'::regclass
      AND conname = 'activities_intensity_valid'
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_intensity_valid
      CHECK (intensity IS NULL OR (intensity BETWEEN 1 AND 10));
  END IF;
END;
$$;
