-- ============================================================
-- PART 41: three-month renewal terms (Sage, 19 October 2026)
-- ------------------------------------------------------------
-- After the minimum term (six months on Essential and Specialist, three on
-- Part-Time) a placement renews in three-month terms. To end it, either side
-- gives thirty days' written notice before the current term ends; the
-- placement then runs and bills to the last day of that term.
--
--   * placement_term_end(): the last day of the term a date falls in.
--   * notice_end_date():    now the end of the first term that ends at least
--                           thirty days after notice is given (was: the end
--                           of the month after notice, month to month).
--   * issue_monthly_retainers(): Part-Time placements are invoiced upfront
--                           for each renewal term too, not only the first.
--
-- Safe to re-run.
-- ============================================================

-- The last day (inclusive) of the term that contains p_on. Terms are the
-- minimum term, then consecutive three-month terms, each counted from the
-- minimum's end so month-end clamping matches the TypeScript mirror.
create or replace function placement_term_end(p_id uuid, p_on date) returns date
language plpgsql stable security definer set search_path = public as $$
declare min_end date; k int := 0; e date;
begin
  min_end := placement_minimum_ends(p_id);          -- exclusive
  if min_end is null then return null; end if;
  e := min_end;
  while e - 1 < p_on loop
    k := k + 1;
    e := (min_end + make_interval(months => 3 * k))::date;
    exit when k > 400;
  end loop;
  return e - 1;
end $$;
revoke all on function placement_term_end(uuid, date) from public, anon;
grant execute on function placement_term_end(uuid, date) to authenticated, service_role;

-- Thirty days' written notice before the current term ends. Notice given
-- with fewer than thirty days left runs to the end of the next term.
create or replace function notice_end_date(p_id uuid, p_given date) returns date
language sql stable security definer set search_path = public as $$
  select placement_term_end(p_id, p_given + 30);
$$;
revoke all on function notice_end_date(uuid, date) from public, anon;
grant execute on function notice_end_date(uuid, date) to authenticated, service_role;

-- Running placements with notice already recorded: recompute under the new
-- rule. Ended placements are history and are left alone.
update placement_terms t
   set notice_ends_on = notice_end_date(t.placement_id, t.notice_given_on)
  from placements p
 where p.id = t.placement_id and p.ended_on is null and t.notice_given_on is not null
   and t.notice_ends_on is distinct from notice_end_date(t.placement_id, t.notice_given_on);

-- The retainer run, unchanged for monthly plans. Part-Time: one upfront
-- invoice per term, the first at the start date and one at the start of each
-- three-month renewal, unless notice ends the placement before that term.
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
                       then 'Part-Time plan, paid upfront for ' || coalesce(r.minimum_months, 3) || ' months'
                       else 'Part-Time plan, three-month renewal paid upfront' end)
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
        issued := greatest(first_monday(p_start), r.started_on);
        note := case when days = dim then 'Monthly retainer'
                     when b_start > p_start and b_end < p_end
                       then 'Partial month, ' || to_char(b_start, 'FMMonth FMDD') || ' to ' || to_char(b_end, 'FMMonth FMDD')
                     when b_start > p_start then 'First month, prorated from ' || to_char(b_start, 'FMMonth FMDD')
                     else 'Final month, prorated to ' || to_char(b_end, 'FMMonth FMDD') end;
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
