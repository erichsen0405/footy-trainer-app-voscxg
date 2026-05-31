-- Allow authenticated users to upload task videos into their own folder.
insert into storage.buckets (id, name, public)
values ('drill-videos', 'drill-videos', true)
on conflict (id) do update
set public = true;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated upload task videos'
  ) then
    create policy "Authenticated upload task videos"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'drill-videos'
        and (storage.foldername(name))[1] = 'task-videos'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated update own task videos'
  ) then
    create policy "Authenticated update own task videos"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'drill-videos'
        and (storage.foldername(name))[1] = 'task-videos'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
      with check (
        bucket_id = 'drill-videos'
        and (storage.foldername(name))[1] = 'task-videos'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated delete own task videos'
  ) then
    create policy "Authenticated delete own task videos"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'drill-videos'
        and (storage.foldername(name))[1] = 'task-videos'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;
end $$;
