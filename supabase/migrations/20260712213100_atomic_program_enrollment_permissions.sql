-- Keep the privilege change in one statement for compatibility with the
-- migration runner used by the linked Supabase project.

do $program_enrollment_permissions$
begin
  execute 'revoke all on function public.enroll_training_program_atomic(uuid, uuid, uuid, uuid, date, uuid, jsonb) from public';
  execute 'revoke all on function public.enroll_training_program_atomic(uuid, uuid, uuid, uuid, date, uuid, jsonb) from anon, authenticated';
  execute 'grant execute on function public.enroll_training_program_atomic(uuid, uuid, uuid, uuid, date, uuid, jsonb) to service_role';
  execute 'comment on function public.enroll_training_program_atomic(uuid, uuid, uuid, uuid, date, uuid, jsonb) is ''Service-role-only atomic program enrollment. Reuses complete retries and transactionally rebuilds active incomplete legacy enrollments.''';
end;
$program_enrollment_permissions$;
