alter table if exists public.exercise_library
add column if not exists video_key text;

update public.exercise_library
set video_key = case
  when position('/storage/v1/object/public/' in video_url) > 0 then
    regexp_replace(
      split_part(split_part(video_url, '/storage/v1/object/public/', 2), '?', 1),
      '^/+',
      ''
    )
  when video_url ~* '^https?://' then video_url
  else trim(both '/' from video_url)
end
where coalesce(trim(video_key), '') = ''
  and coalesce(trim(video_url), '') <> '';
