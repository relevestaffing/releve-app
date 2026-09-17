-- PART 31 — one talent can serve two executives, paid for each (C5, approved 16 Sep 2026)
--
-- Decision (Nona, 16 Sep 2026): a talent may work for two executives at once
-- if they have the capacity, and must be paid for both. Two faults stopped
-- that: talent pay was a single rate per talent (a second placement overwrote
-- the first), and payroll was keyed one payment per talent per month (a second
-- placement's pay was silently dropped). Both fixed here. Talent pay is now
-- per placement, taken from each offer; the per-talent talent_pay row stays as
-- the roster default and the fallback for placements made before this.
-- Idempotent and safe to re-run.
-- ============================================================

-- 1. per-placement talent pay
alter table placement_terms add column if not exists talent_pay_cents int;
comment on column placement_terms.talent_pay_cents is
  'What the talent is paid for THIS placement. A talent on two placements has two, one per executive. Falls back to talent_pay.rate_month_cents when unset.';

-- backfill existing placements from the talent's single roster rate, so nobody
-- already placed loses their pay the moment payroll starts reading per placement
update placement_terms t
   set talent_pay_cents = tp.rate_month_cents
  from placements pl
  join talent_pay tp on tp.talent_id = pl.talent_id
 where pl.id = t.placement_id
   and t.talent_pay_cents is null
   and tp.rate_month_cents is not null;

-- 2. a payment is unique per placement per month, not per talent per month —
--    the old key is exactly what dropped a second placement's pay. Drop it by
--    shape rather than by a guessed name: any unique constraint over exactly
--    (talent_id, period_start), whatever it is called. If it survived, a second
--    placement's INSERT would raise on it and fail the whole payroll run.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'talent_payments'::regclass and contype = 'u'
       and (select array_agg(attname::text order by attname) from pg_attribute
             where attrelid = 'talent_payments'::regclass and attnum = any(conkey))
           = array['period_start','talent_id']
  loop
    execute format('alter table talent_payments drop constraint %I', c);
  end loop;
end $$;
create unique index if not exists talent_payments_placement_period
  on talent_payments (placement_id, period_start);

-- 3. place_from_offer records the per-placement talent pay, and seeds the roster
--    default only if the talent has none yet (never overwriting from a later
--    placement, since per-placement pay is what payroll uses now)
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

  insert into placement_terms (placement_id, rate_month_cents, talent_pay_cents, minimum_months)
  values (pid, o.rate_month_cents, o.talent_pay_cents, o.minimum_months)
  on conflict (placement_id) do update
    set rate_month_cents = excluded.rate_month_cents,
        talent_pay_cents = excluded.talent_pay_cents,
        minimum_months   = excluded.minimum_months;

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

-- 4. payroll pays per placement, at the placement's rate (falling back to the
--    roster rate), keyed per placement so a second placement is never dropped.
--    Keeps PART 29's notice-stops-billing behaviour.
create or replace function pay_the_month(for_month date default current_date)
returns int language plpgsql security definer as $$
declare
  p_start date := date_trunc('month', for_month)::date;
  p_end   date := (date_trunc('month', for_month) + interval '1 month - 1 day')::date;
  made    int  := 0;
begin
  if not is_admin() then raise exception 'Relève team only'; end if;

  insert into talent_payments (talent_id, placement_id, period_start, period_end, amount_cents, currency)
  select pl.talent_id, pl.id, p_start, p_end,
         coalesce(t.talent_pay_cents, tp.rate_month_cents),
         coalesce(tp.currency, 'USD')
  from placements pl
  left join placement_terms t on t.placement_id = pl.id
  left join talent_pay tp on tp.talent_id = pl.talent_id
  where coalesce(t.talent_pay_cents, tp.rate_month_cents) is not null
    and pl.started_on <= p_end
    and (pl.ended_on is null or pl.ended_on >= p_start)
    and (t.notice_ends_on is null
         or date_trunc('month', t.notice_ends_on)::date > p_start)
  on conflict (placement_id, period_start) do nothing;

  get diagnostics made = row_count;
  return made;
end $$;

-- 5. margin reflects the per-placement talent pay
drop view if exists placement_margin;
create view placement_margin with (security_invoker = true) as
select
  pl.id            as placement_id,
  pl.client_id,
  pl.talent_id,
  pl.started_on,
  pl.ended_on,
  t.rate_month_cents                                                     as client_pays_cents,
  coalesce(t.talent_pay_cents, tp.rate_month_cents)                      as talent_paid_cents,
  t.rate_month_cents - coalesce(t.talent_pay_cents, tp.rate_month_cents) as margin_cents
from placements pl
left join placement_terms t on t.placement_id = pl.id
left join talent_pay tp     on tp.talent_id   = pl.talent_id;
comment on view placement_margin is
  'Team only by inheritance: placement_terms and talent_pay are both admin-only, and this view runs as its caller. Talent pay is per placement, falling back to the roster rate. Never exposed to either side.';

do $$ begin raise notice 'PART 31 applied: one talent can serve two executives, paid per placement.'; end $$;


-- ============================================================
-- PART 32 — a client can no longer read a candidate's validity or facets (RLS, approved 16 Sep 2026)
--
-- Row-level security filters ROWS, never COLUMNS. The signatures read policy
-- granted a client the whole signature row for any candidate released to them,
-- so validity (the honesty-check internals) and the eighteen facets (including
-- Drive) were readable from the browser dev-tools even though the screen hid
-- them. The Book's own rule is: validity is console-only; clients see a verified
-- badge and confidence bands.
--
-- Fix: clients lose direct read on the signatures table entirely. Their
-- candidate data now comes through candidate_directory, a definer view that
-- exposes only the safe columns — scores, confidence, conditions, archetype and
-- the validity VERDICT (the label, not the measures) — with facets blanked.
-- Matching needs nothing more than these. Admins keep the full picture through
-- talent_directory and the direct signatures read, both of which stay
-- admin-only. Idempotent and safe to re-run.
-- ============================================================

-- 1. clients lose direct read of candidate signatures; own + admin only
drop policy if exists "read own signature" on signatures;
create policy "read own signature" on signatures for select using (
  user_id = auth.uid() or is_admin()
);

-- 2. the client-safe candidate view. A DEFINER view (no security_invoker), so it
--    can read signatures as its owner, but it returns only safe columns and it
--    checks, per row, that the caller is an admin or has this candidate released
--    to them. auth.uid() still resolves to the calling client inside a definer
--    view, so the scoping is per-client.
drop view if exists candidate_directory;
create view candidate_directory as
select
  p.id, p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.stage, p.photo_url, p.intro_video_url,
  s.scores,
  '{}'::jsonb                                              as facets,     -- never a client's to see
  jsonb_build_object('verdict', s.validity->>'verdict')   as validity,   -- the label only
  s.confidence,
  s.conditions as cond,
  coalesce((select jsonb_array_length(sp.disciplines) from skills_profile sp
             where sp.talent_id = p.id), 0) > 0                          as has_disciplines,
  exists (select 1 from talent_verification_badges b
           where b.talent_id = p.id and b.verified_through_taking_the_watch) as watch_cleared
from profiles p
join signatures s on s.user_id = p.id and s.side = 'talent'
where p.role = 'talent'
  and (
    is_admin()
    or exists (
      select 1 from matches m
      where m.talent_id = p.id
        and m.released
        and (m.client_id = auth.uid()
             or exists (select 1 from searches se
                        where se.id = m.search_id and se.client_id = auth.uid()))
    )
  );
comment on view candidate_directory is
  'Client-safe candidate rows: scores, confidence, conditions, archetype and the validity verdict only — no validity internals, no facets. Definer view scoped per caller by auth.uid(). The app routes clients here; admins use talent_directory for the full picture.';
grant select on candidate_directory to authenticated;

do $$ begin raise notice 'PART 32 applied: clients can no longer read candidate validity or facets.'; end $$;
