import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260712221500_safe_complete_program_enrollment.sql'),
  'utf8',
);
const permissionsMigration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260712213100_atomic_program_enrollment_permissions.sql'),
  'utf8',
);

describe('atomic program enrollment migration', () => {
  it('keeps the complete multi-player write inside one service-role-only RPC', () => {
    expect(migration).toContain('create or replace function public.enroll_training_program_atomic');
    expect(migration).toContain('security definer');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('insert into public.program_enrollments');
    expect(migration).toContain('insert into public.program_enrollment_items');
    expect(migration).toContain('insert into public.activities');
    expect(migration).toContain('insert into public.activity_tasks');
    expect(migration).toContain('insert into public.tasks');
    expect(migration).toContain('set task_id = v_task_id');
    expect(migration).toContain('template_sync_enabled = false');
    expect(migration).toContain('v_activity_task_id');
    expect(migration).toContain('v_task_template_match_id <> v_training_template_match_id');
    expect(migration).toContain('set activity_id = v_activity_id');
    expect(migration).toContain('get diagnostics v_updated_count = row_count');
    expect(permissionsMigration).toContain('from anon, authenticated');
    expect(permissionsMigration).toContain('to service_role');
  });

  it('requires materialization time and resolves player-owned categories', () => {
    expect(migration).toContain("v_activity ->> 'activityTime'");
    expect(migration).toContain("activityTime is required for materialized sessions");
    expect(migration).toContain('public.ensure_player_category_copy');
    expect(migration).toContain('v_player_id,\n          v_player_id');
    expect(migration).toContain('p_source_team_id');
  });

  it('reuses complete retries and only repairs the proven legacy activity-time partial in place', () => {
    expect(migration).toContain('v_matched_count = v_expected_count');
    expect(migration).toContain('v_linked_activity_count = v_expected_activity_count');
    expect(migration).toContain('v_matched_activity_task_count = v_expected_activity_task_count');
    expect(migration).toContain('v_linked_standalone_task_count = v_expected_standalone_task_count');
    expect(migration).toContain('v_existing_program_version_id is distinct from p_program_version_id');
    expect(migration).toContain("pei.program_item_id::text = planned.value ->> 'programItemId'");
    expect(migration).toContain('reused := true');
    expect(migration).toContain("v_existing_created_at < timestamptz '2026-07-12 19:59:48+00'");
    expect(migration).toContain('v_existing_updated_at = v_existing_created_at');
    expect(migration).toContain("pei.status = 'upcoming'");
    expect(migration).toContain('v_enrollment_id := v_existing_enrollment_id');
    expect(migration).not.toContain('delete from public.program_enrollments');
    expect(migration).not.toContain('delete from public.activities');
    expect(migration).toContain('PROGRAM_ENROLLMENT_EXISTS:');
  });

  it('freezes session task fields and subtasks instead of relying on live template sync', () => {
    for (const field of ['video_urls', 'media_names', 'after_training_enabled', 'after_training_delay_minutes', 'task_duration_enabled', 'task_duration_minutes']) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain('delete from public.activity_task_subtasks');
    expect(migration).toContain('insert into public.activity_task_subtasks');
    expect(migration).toContain('feedback_template_id = null');
  });
});
