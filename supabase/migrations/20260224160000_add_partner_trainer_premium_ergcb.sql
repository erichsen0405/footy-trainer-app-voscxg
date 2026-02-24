insert into public.partner_email_entitlements (email, entitlement, source, notes, is_active)
values
  ('ergcb@hotmail.com', U&'tr\00E6ner_premium', 'partner', 'Lifetime partner entitlement', true)
on conflict (email, entitlement)
do update set
  source = excluded.source,
  notes = excluded.notes,
  is_active = excluded.is_active,
  updated_at = now();

update public.user_entitlements ue
set
  source = pee.source,
  is_active = true,
  expires_at = null,
  notes = coalesce(pee.notes, 'Auto-assigned from partner email list')
from auth.users au
join public.partner_email_entitlements pee
  on pee.email = lower(trim(coalesce(au.email, '')))
where pee.is_active
  and pee.email = 'ergcb@hotmail.com'
  and ue.user_id = au.id
  and ue.entitlement = pee.entitlement
  and ue.is_active = false;

insert into public.user_entitlements (user_id, entitlement, source, is_active, expires_at, notes)
select
  au.id,
  pee.entitlement,
  pee.source,
  true,
  null,
  coalesce(pee.notes, 'Auto-assigned from partner email list')
from auth.users au
join public.partner_email_entitlements pee
  on pee.email = lower(trim(coalesce(au.email, '')))
where pee.is_active
  and pee.email = 'ergcb@hotmail.com'
  and not exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = au.id
      and ue.entitlement = pee.entitlement
  );
