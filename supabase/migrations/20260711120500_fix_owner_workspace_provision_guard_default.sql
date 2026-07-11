-- Make the owner/coach workspace provisioning guard fail closed.

create or replace function public.owner_workspace_provision_allowed()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.allow_owner_workspace_provision', true), '') = 'on';
$$;

revoke all on function public.owner_workspace_provision_allowed() from public;
grant execute on function public.owner_workspace_provision_allowed() to service_role;

comment on function public.owner_workspace_provision_allowed() is
  'Transaction-local guard that defaults to false; only Apple trainer subscription and platform-admin create flows may create owner/coach workspaces.';
