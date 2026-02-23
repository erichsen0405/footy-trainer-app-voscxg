-- Model A: public storage bucket for direct CDN playback without login.
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
      and policyname = 'Public read drill-videos objects'
  ) then
    create policy "Public read drill-videos objects"
      on storage.objects
      for select
      to public
      using (bucket_id = 'drill-videos');
  end if;
end $$;
