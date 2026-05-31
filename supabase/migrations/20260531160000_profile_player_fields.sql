alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists player_positions text[],
  add column if not exists club_name text,
  add column if not exists playing_level text;

alter table public.profiles
  alter column player_positions set default '{}'::text[];

update public.profiles
   set player_positions = '{}'::text[]
 where player_positions is null;

alter table public.profiles
  alter column player_positions set not null;

do $$
begin
  alter table public.profiles
    add constraint profiles_player_positions_max_5
    check (cardinality(player_positions) <= 5);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.profiles
    add constraint profiles_player_positions_allowed
    check (
      player_positions <@ array[
        'Målmand',
        'Back',
        'Midterforsvarer',
        'Central midtbane',
        'Offensiv midtbane',
        'Kant',
        'Angriber',
        'Midtbane'
      ]::text[]
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.profiles.avatar_url is 'Public URL for the user profile avatar image.';
comment on column public.profiles.player_positions is 'Up to five player positions selected from the app position list.';
comment on column public.profiles.club_name is 'Free-text name of the club the player represents.';
comment on column public.profiles.playing_level is 'Free-text playing level, e.g. Liga 1, Liga 2, Liga 3, Mesterrække.';

insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', true)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  create policy "Profile images are publicly readable"
    on storage.objects
    for select
    using (bucket_id = 'profile-images');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can upload their own profile images"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'profile-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can delete their own profile images"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'profile-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception
  when duplicate_object then null;
end $$;
