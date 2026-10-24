-- ============================================================
-- PART 42: eLIVate Club member pricing (Sage, 19 October 2026)
-- ------------------------------------------------------------
-- eLIVate Club members receive $500 off each month for the first three
-- months on Essential and Specialist. Recorded on the offer, carried onto the
-- placement terms, and taken off the monthly retainer for the service days
-- that fall inside the first three months from the start date (so a mid-month
-- start still totals exactly three months of discount). Part-Time is not
-- eligible. Safe to re-run. Run after part41-renewals.sql.
-- ============================================================

alter table offers          add column if not exists intro_discount_cents int;
alter table offers          add column if not exists intro_discount_months int;
alter table placement_terms add column if not exists intro_discount_cents int;
alter table placement_terms add column if not exists intro_discount_months int;

-- The discount owed on a billed span [b_start, b_end] of a month of dim days.
create or replace function _intro_discount(p_id uuid, b_start date, b_end date, dim int) returns int
language plpgsql stable security definer set search_path = public as $$
declare pl record; w_end date; s date; e date;
begin
  select p.started_on, t.intro_discount_cents c, t.intro_discount_months m, t.prepaid_total_cents
    into pl
    from placements p join placement_terms t on t.placement_id = p.id
   where p.id = p_id;
  if not found or pl.c is null or pl.c <= 0 or coalesce(pl.m, 0) <= 0 then return 0; end if;
  if pl.prepaid_total_cents is not null then return 0; end if;
  w_end := (pl.started_on + make_interval(months => pl.m))::date - 1;
  s := greatest(b_start, pl.started_on);
  e := least(b_end, w_end);
  if e < s then return 0; end if;
  return round(pl.c::numeric * (e - s + 1) / dim)::int;
end $$;
revoke all on function _intro_discount(uuid, date, date, int) from public, anon, authenticated;

drop view if exists my_offer_client;
create view my_offer_client with (security_invoker = true) as
select o.id, o.client_id, o.talent_id, o.role_title, o.starts_on, o.hours, o.scope,
       o.rate_month_cents, o.prepaid_total_cents, o.minimum_months, o.state, o.client_answer, o.sent_on,
       p.full_name as talent_name, p.headline as talent_role, p.photo_url,
       o.intro_discount_cents, o.intro_discount_months
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

  insert into placement_terms (placement_id, rate_month_cents, talent_pay_cents, minimum_months, prepaid_total_cents,
                               intro_discount_cents, intro_discount_months)
  values (pid, o.rate_month_cents, o.talent_pay_cents, o.minimum_months, o.prepaid_total_cents,
          o.intro_discount_cents, o.intro_discount_months)
  on conflict (placement_id) do update
    set rate_month_cents = excluded.rate_month_cents,
        talent_pay_cents = excluded.talent_pay_cents,
        minimum_months   = excluded.minimum_months,
        prepaid_total_cents = excluded.prepaid_total_cents,
        intro_discount_cents = excluded.intro_discount_cents,
        intro_discount_months = excluded.intro_discount_months;

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

create or replace function _reprice_draft_retainers(p_placement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pl record; through date; d record; b_start date; b_end date; dim int; days int;
        new_sub int; credit int; excess int; prev_trust text;
begin
  select p.id, p.started_on, t.rate_month_cents, t.prepaid_total_cents into pl
    from placements p join placement_terms t on t.placement_id = p.id
   where p.id = p_placement;
  if not found or pl.rate_month_cents is null then return; end if;
  if pl.prepaid_total_cents is not null then return; end if;  -- prepaid plans are one fixed invoice
  prev_trust := money_trust_on();
  through := placement_bill_through(p_placement);

  for d in
    select * from invoices
     where placement_id = p_placement and kind = 'retainer'
       and status = 'draft' and subtotal_cents is not null
  loop
    b_start := greatest(d.period_start, pl.started_on);
    b_end   := least(d.period_end, coalesce(through, d.period_end));
    if b_end < b_start then
      update invoices
         set status = 'void',
             note = 'Not billable: the placement ended before this period began.'
       where id = d.id;
      continue;
    end if;
    dim  := d.period_end - d.period_start + 1;
    days := b_end - b_start + 1;
    new_sub := case when days = dim then pl.rate_month_cents
                    else round(pl.rate_month_cents::numeric * days / dim)::int end;
    new_sub := greatest(0, new_sub - _intro_discount(p_placement, b_start, b_end, dim));
    if new_sub is distinct from d.subtotal_cents
       or days is distinct from d.days_billed then
      credit := least(d.deposit_credit_cents, new_sub);
      excess := d.deposit_credit_cents - credit;
      update invoices
         set subtotal_cents = new_sub,
             amount_cents = new_sub - credit,
             deposit_credit_cents = credit,
             days_billed = days, days_in_period = dim,
             service_from = b_start, service_to = b_end,
             note = case when days = dim then 'Monthly retainer'
                         when b_start > d.period_start and b_end < d.period_end
                           then 'Partial month, ' || to_char(b_start, 'FMMonth FMDD') || ' to ' || to_char(b_end, 'FMMonth FMDD')
                         when b_start > d.period_start then 'First month, prorated from ' || to_char(b_start, 'FMMonth FMDD')
                         else 'Final month, prorated to ' || to_char(b_end, 'FMMonth FMDD') end
       where id = d.id;
      if excess > 0 and d.credit_source is not null then
        update invoices
           set credited_cents = greatest(0, credited_cents - excess), credited_on = null
         where id = d.credit_source;
      end if;
    end if;
  end loop;
  perform money_trust_restore(prev_trust);
end $$;
revoke all on function _reprice_draft_retainers(uuid) from public, anon, authenticated;

create or replace function issue_monthly_retainers(for_month date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  target  date := date_trunc('month', coalesce(for_month, billing_today()))::date;
  t_end   date;
  made    int  := 0;
  rc      int;
  r       record;
  m       date;
  first_m date;
  p_start date; p_end date;
  b_start date; b_end date;
  dim int; days int; amt int;
  issued  date;
  note    text;
  prev_trust text;
  term_start date; term_end date; min_end date; k int;
  disc int;
begin
  if not is_team_or_service() then
    raise exception 'only Relève may issue invoices';
  end if;
  prev_trust := money_trust_on();
  t_end := (target + interval '1 month - 1 day')::date;

  -- Notice that has taken effect ends the placement, the day after it ends.
  for r in
    select pl.id, pl.talent_id
      from placements pl join placement_terms t on t.placement_id = pl.id
     where t.notice_ends_on is not null and pl.ended_on is null
       and t.notice_ends_on < billing_today()
  loop
    update placements p
       set ended_on = t.notice_ends_on,
           ended_reason = coalesce(p.ended_reason, 'client_ended')
      from placement_terms t
     where t.placement_id = p.id and p.id = r.id;
    if not exists (select 1 from placements where talent_id = r.talent_id and ended_on is null) then
      update profiles set stage = 'Vetted' where id = r.talent_id and stage = 'Placed';
    end if;
  end loop;

  for r in
    select pl.id, pl.client_id, pl.started_on, pl.created_at, pl.suspended_at, pl.ended_on,
           t.rate_month_cents, t.prepaid_total_cents, t.minimum_months, t.notice_ends_on,
           placement_bill_through(pl.id) as through
      from placements pl
      join placement_terms t on t.placement_id = pl.id
     where t.rate_month_cents is not null
       and pl.started_on <= t_end
  loop
    -- Part-Time plan: paid upfront, one invoice per term.
    if r.prepaid_total_cents is not null then
      min_end := placement_minimum_ends(r.id);
      k := 0;
      term_start := r.started_on;
      term_end   := min_end - 1;
      while term_start <= t_end and k <= 400 loop
        exit when r.ended_on is not null and r.ended_on < term_start;
        exit when r.notice_ends_on is not null and r.notice_ends_on < term_start;
        p_start := date_trunc('month', term_start)::date;
        if not exists (select 1 from invoices i
                        where i.placement_id = r.id and i.kind = 'retainer' and i.period_start = p_start) then
          dim := term_end - term_start + 1;
          insert into invoices (client_id, placement_id, kind, period_start, period_end,
                                amount_cents, subtotal_cents, days_billed, days_in_period,
                                service_from, service_to, issued_on, due_on, status, note)
          values (r.client_id, r.id, 'retainer', p_start, term_end,
                  r.prepaid_total_cents, r.prepaid_total_cents, dim, dim,
                  term_start, term_end, term_start, term_start, 'draft',
                  case when k = 0
                       then 'Starter plan, paid in full for ' || coalesce(r.minimum_months, 3) || ' months'
                       else 'Starter plan, three-month renewal paid in full' end)
          on conflict do nothing;
          get diagnostics rc = row_count;
          made := made + rc;
        end if;
        k := k + 1;
        term_start := (min_end + make_interval(months => 3 * (k - 1)))::date;
        term_end   := (min_end + make_interval(months => 3 * k))::date - 1;
      end loop;
      continue;
    end if;

    if exists (select 1 from invoices i where i.placement_id = r.id and i.kind = 'retainer') then
      first_m := target;
    else
      first_m := greatest(date_trunc('month', r.started_on)::date,
                          (target - interval '1 month')::date);
    end if;

    m := first_m;
    while m <= target loop
      p_start := m;
      p_end   := (m + interval '1 month - 1 day')::date;
      b_start := greatest(p_start, r.started_on);
      b_end   := least(p_end, coalesce(r.through, p_end));

      if b_end >= b_start and not exists (
           select 1 from invoices i
            where i.placement_id = r.id and i.kind = 'retainer' and i.period_start = p_start) then
        dim  := p_end - p_start + 1;
        days := b_end - b_start + 1;
        amt  := case when days = dim then r.rate_month_cents
                     else round(r.rate_month_cents::numeric * days / dim)::int end;
        disc := _intro_discount(r.id, b_start, b_end, dim);
        amt  := greatest(0, amt - disc);
        issued := greatest(first_monday(p_start), r.started_on);
        note := case when days = dim then 'Monthly retainer'
                     when b_start > p_start and b_end < p_end
                       then 'Partial month, ' || to_char(b_start, 'FMMonth FMDD') || ' to ' || to_char(b_end, 'FMMonth FMDD')
                     when b_start > p_start then 'First month, prorated from ' || to_char(b_start, 'FMMonth FMDD')
                     else 'Final month, prorated to ' || to_char(b_end, 'FMMonth FMDD') end;
        if disc > 0 then
          note := note || '. eLIVate Club member discount, ' || to_char(disc / 100.0, 'FM$999,990') || ' off';
        end if;
        if r.suspended_at is not null then
          note := note || '. Placement paused for an unpaid balance';
        end if;

        insert into invoices (client_id, placement_id, kind, period_start, period_end,
                              amount_cents, subtotal_cents, days_billed, days_in_period,
                              service_from, service_to, issued_on, due_on, status, note)
        values (r.client_id, r.id, 'retainer', p_start, p_end,
                amt, amt, days, dim, b_start, b_end, issued, issued, 'draft', note)
        on conflict do nothing;
        get diagnostics rc = row_count;
        made := made + rc;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;

  perform _apply_deposit_credits(null);
  perform money_trust_restore(prev_trust);
  return made;
end $$;
revoke all on function issue_monthly_retainers(date) from public, anon;
grant execute on function issue_monthly_retainers(date) to authenticated, service_role;
