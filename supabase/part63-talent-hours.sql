-- Part 63: the role's size on the talent side of an offer (10 November 2026).
-- Nona: roles are 15, 25, 30 or 40 hours a week (15 is Starter; 25, 30 and 40
-- are Essential or Specialist), picked on the offer before it is sent, and the
-- talent's pay is $7 an hour on those hours, paid monthly, unless adjusted.
-- Strictly the talent's side: my_offer_client does not carry it.
-- Safe to re-run.

alter table offers add column if not exists talent_hours smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'offers_talent_hours_check') then
    alter table offers add constraint offers_talent_hours_check
      check (talent_hours is null or talent_hours in (15, 25, 30, 40));
  end if;
end $$;

drop view if exists my_offer_talent;
create view my_offer_talent with (security_invoker = true) as
select o.id, o.client_id, o.talent_id, o.role_title, o.starts_on, o.hours, o.scope,
       o.talent_pay_cents, o.minimum_months, o.state, o.talent_answer, o.sent_on,
       c.full_name as client_name, c.org_name,
       o.talent_hours
from offers o join profiles c on c.id = o.client_id
where o.talent_id = auth.uid() and o.state in ('sent','client_yes','talent_yes','accepted');
grant select on my_offer_talent to authenticated;
