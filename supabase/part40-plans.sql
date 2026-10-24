-- PART 40 (18 Oct 2026): the three plans. Safe to re-run. Run AFTER schema.sql and part39-all.sql
-- (or on its own against a database that already has them).
-- Essential and Specialist: six-month commitment. Part-Time: $2,500 paid upfront, three months, 15 hrs/week.
alter table offers add column if not exists prepaid_total_cents int;
alter table placement_terms add column if not exists prepaid_total_cents int;
alter table offers alter column minimum_months set default 6;
alter table placement_terms alter column minimum_months set default 6;

drop view if exists my_offer_client;
create view my_offer_client with (security_invoker = true) as
select o.id, o.client_id, o.talent_id, o.role_title, o.starts_on, o.hours, o.scope,
       o.rate_month_cents, o.prepaid_total_cents, o.minimum_months, o.state, o.client_answer, o.sent_on,
       p.full_name as talent_name, p.headline as talent_role, p.photo_url
from offers o join profiles p on p.id = o.talent_id
where o.client_id = auth.uid() and o.state in ('sent','client_yes','talent_yes','accepted');
grant select on my_offer_client to authenticated;

create or replace function place_from_offer(offer uuid)
returns uuid language plpgsql security definer as $$
declare o offers%rowtype; pid uuid; fit int;
begin
  if not is_admin() then raise exception 'only Releve may place someone'; end if;
  select * into o from offers where id = offer;
  if not found then raise exception 'no such offer'; end if;
  if o.placement_id is not null then return o.placement_id; end if;
  if o.state <> 'accepted' then raise exception 'both sides have not accepted yet'; end if;

  select overall into fit from matches
   where client_id = o.client_id and talent_id = o.talent_id
   order by created_at desc limit 1;

  insert into placements (client_id, talent_id, started_on, predicted_fit, talent_reveal_seen, client_reveal_seen)
  values (o.client_id, o.talent_id, o.starts_on, fit, false, false)
  returning id into pid;

  insert into placement_terms (placement_id, rate_month_cents, talent_pay_cents, minimum_months, prepaid_total_cents)
  values (pid, o.rate_month_cents, o.talent_pay_cents, o.minimum_months, o.prepaid_total_cents)
  on conflict (placement_id) do update
    set rate_month_cents = excluded.rate_month_cents,
        talent_pay_cents = excluded.talent_pay_cents,
        minimum_months   = excluded.minimum_months,
        prepaid_total_cents = excluded.prepaid_total_cents;

  if o.talent_pay_cents is not null then
    insert into talent_pay (talent_id, rate_month, rate_month_cents)
    values (o.talent_id, round(o.talent_pay_cents / 100.0), o.talent_pay_cents)
    on conflict (talent_id) do nothing;
  end if;

  update offers set placement_id = pid where id = offer;
  update profiles set stage = 'Placed' where id = o.talent_id;
  perform note_action('placed_from_offer', 'offers', offer,
    jsonb_build_object('placement_id', pid, 'client_id', o.client_id, 'talent_id', o.talent_id));
  return pid;
end $$;
