-- Issue #283: ensure CRM tag links cannot reference tags from another owner account.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'owner_player_tags_owner_id_unique'
      and conrelid = 'public.owner_player_tags'::regclass
  ) then
    alter table public.owner_player_tags
      add constraint owner_player_tags_owner_id_unique unique (owner_account_id, id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'owner_player_tag_links_owner_tag_fkey'
      and conrelid = 'public.owner_player_tag_links'::regclass
  ) then
    alter table public.owner_player_tag_links
      add constraint owner_player_tag_links_owner_tag_fkey
      foreign key (owner_account_id, tag_id)
      references public.owner_player_tags(owner_account_id, id)
      on delete cascade;
  end if;
end
$$;
