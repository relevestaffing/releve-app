-- ============================================================
-- PART 39 (Lane B) — billing, money, contracts, reporting
-- (2 Oct 2026 fix pass. Safe to run on top of everything above, and safe to
-- re-run: every statement is create-or-replace, add-if-not-exists, or a
-- guarded do-block.)
--
-- What this changes, in order of stakes:
--   B3  the monthly run could never run: pay_the_month() still checked
--       is_admin(), so the service-role cron raised every time.
--   B1  notice is the business rule now: thirty days' written notice,
--       effective at the END of the following billing month, never before the
--       three-month minimum ends. Client and console paths both store the end
--       date, and the exit reason is recorded.
--   B2  a guaranteed ending that is replaced never bills twice for one seat:
--       the ended placement bills only to its end date, and the replacement
--       inherits the remaining minimum.
--   B6  the $500 deposit credit is tracked in cents: processing deposits
--       count, a remainder carries to the next invoice, voiding a retainer
--       gives the credit back, and a waived deposit voids its invoice.
--   B7/B8 first, final and partial months are prorated by the day, for both
--       billing and payroll; a placement created after the run is caught up.
--   B13 a placement can be suspended (unpaid 14 days), which pauses payroll.
--   B10/B11/B14 refunded and disputed exist as states; Stripe's states can
--       only be moved by Stripe; processing deposits are a real state.
--   B17 invoices carry what a real document needs: subtotal, credit, service
--       dates; due_on resets to the day an invoice is actually sent.
--   B18 marking paid/void, changing an amount, and deleting a sent invoice are
--       the owner's alone, enforced here and not only in the route.
--   B27 talent payments are recorded in USD with the amount sent, any fee and
--       an FX note.
-- ============================================================

-- ---------- 0. helpers ----------

-- The business runs on Pacific. current_date is UTC on Supabase, which puts
-- anything done after 4pm Pacific on tomorrow.
create or replace function billing_today() returns date
language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date;
$$;

-- The two ending reasons that owe the client a free replacement. Mirrors
-- ENDED_REASONS in lib/care-public.ts; change one, change the other.
create or replace function guaranteed_reason(r text) returns boolean
language sql immutable as $$
  select coalesce(r in ('talent_left', 'not_working'), false);
$$;

-- ---------- 1. columns ----------

-- placements: a pause for an unpaid balance
alter table placements add column if not exists suspended_at     timestamptz;
alter table placements add column if not exists suspended_reason text;
alter table placements add column if not exists resumed_at       timestamptz;
comment on column placements.suspended_at is
  'Set when an invoice for this placement has gone fourteen days unpaid (Terms, Section 5). Payroll is not created while set. Cleared the moment the balance is settled.';

-- placement_terms: why notice was given, and who recorded it
alter table placement_terms add column if not exists notice_reason      text;
alter table placement_terms add column if not exists notice_note        text;
alter table placement_terms add column if not exists notice_recorded_by uuid references profiles(id) on delete set null;

-- invoices: everything a printable document and an honest ledger need
alter table invoices add column if not exists subtotal_cents       int;
alter table invoices add column if not exists deposit_credit_cents int not null default 0;
alter table invoices add column if not exists credit_source        uuid references invoices(id) on delete set null;
alter table invoices add column if not exists credited_cents       int not null default 0;
alter table invoices add column if not exists days_billed          int;
alter table invoices add column if not exists days_in_period       int;
alter table invoices add column if not exists service_from         date;
alter table invoices add column if not exists service_to           date;
alter table invoices add column if not exists charge_attempts      int not null default 0;
alter table invoices add column if not exists checkout_session     text;
alter table invoices add column if not exists checkout_expires_at  timestamptz;
alter table invoices add column if not exists refunded_cents       int not null default 0;
alter table invoices add column if not exists refunded_on          date;
alter table invoices add column if not exists dispute_id           text;
alter table invoices add column if not exists dispute_status       text;
alter table invoices add column if not exists disputed_at          timestamptz;
alter table invoices add column if not exists reminders_sent       int[] not null default '{}';
comment on column invoices.subtotal_cents is
  'The retainer before any deposit credit. amount_cents is what is actually owed: subtotal_cents - deposit_credit_cents.';
comment on column invoices.credited_cents is
  'On a deposit invoice: how much of it has been credited against retainers so far. Whatever is left carries to the next one.';
comment on column invoices.checkout_session is
  'An open Stripe Checkout for this invoice. Autopay will not charge while one is open, so one invoice cannot be paid twice.';

-- A deposit credited before this part existed was credited in full.
update invoices set credited_cents = amount_cents
 where kind = 'deposit' and credited_on is not null and credited_cents = 0;

-- statuses: refunded and disputed are Stripe's to set
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('draft', 'sent', 'processing', 'paid', 'failed', 'void', 'refunded', 'disputed'));

-- searches: a deposit can be clearing, and a pre-signup payer's Stripe
-- customer is kept so the mandate is not orphaned (B16)
alter table searches drop constraint if exists searches_deposit_status_ck;
alter table searches add constraint searches_deposit_status_ck
  check (deposit_status in ('due', 'processing', 'paid', 'waived'));
alter table searches add column if not exists deposit_stripe_customer text;
alter table searches add column if not exists deposit_payment_method  text;
alter table searches add column if not exists deposit_method_kind     text;
alter table searches add column if not exists deposit_bank_name       text;
alter table searches add column if not exists deposit_last4           text;

-- talent payments: US dollars, with what was actually sent
alter table talent_payments add column if not exists sent_cents int;
alter table talent_payments add column if not exists fee_cents  int;
alter table talent_payments add column if not exists fx_note    text;
update talent_payments set currency = 'USD' where currency is distinct from 'USD';
alter table talent_payments alter column currency set default 'USD';
comment on column talent_payments.amount_cents is 'What is owed, in US cents. Every rate in Relève is set in US dollars.';
comment on column talent_payments.sent_cents is 'What was actually sent, in US cents, when it differs from amount_cents.';
comment on column talent_payments.fee_cents  is 'Any transfer fee Relève paid on top, in US cents.';
comment on column talent_payments.fx_note    is 'What landed in the local currency, if known. A note, never a second amount.';

-- ---------- 2. the minimum term, inherited by a replacement ----------

-- Kept for anything that still calls it.
create or replace function minimum_term_ends(t placement_terms, started date) returns date
language sql stable as $$
  select (started + (coalesce(t.minimum_months, 3) || ' months')::interval)::date;
$$;

-- The first day AFTER the minimum term (exclusive end). A placement that
-- replaces one which ended for a guaranteed reason inherits only what was left
-- of that one's minimum, counted in days, so the client pays three months for
-- the seat, not three months per person.
create or replace function placement_minimum_ends(p_id uuid, depth int default 0) returns date
language plpgsql stable security definer set search_path = public as $$
declare pl record; prev record; prev_end date; remaining int;
begin
  select p.id, p.started_on, p.replaces_id, coalesce(t.minimum_months, 3) as months
    into pl
    from placements p left join placement_terms t on t.placement_id = p.id
   where p.id = p_id;
  if not found then return null; end if;

  if pl.replaces_id is not null and depth < 10 then
    select p.id, p.ended_on, p.ended_reason into prev from placements p where p.id = pl.replaces_id;
    if found and prev.id <> pl.id and prev.ended_on is not null and guaranteed_reason(prev.ended_reason) then
      prev_end := placement_minimum_ends(prev.id, depth + 1);
      remaining := greatest(0, prev_end - prev.ended_on - 1);
      return pl.started_on + remaining;
    end if;
  end if;

  return (pl.started_on + (pl.months || ' months')::interval)::date;
end $$;
revoke all on function placement_minimum_ends(uuid, int) from public, anon;
grant execute on function placement_minimum_ends(uuid, int) to authenticated, service_role;

-- The last day a placement is billed through (inclusive), or null while it is
-- open-ended. The one place the business rule for "what is owed" lives:
--   * a guaranteed ending bills to its end date and no further: the client is
--     owed a replacement, and the replacement carries the remaining minimum;
--   * any other ending is payable through the minimum and any notice period;
--   * notice, while still running, bills through its effective date.
create or replace function placement_bill_through(p_id uuid) returns date
language plpgsql stable security definer set search_path = public as $$
declare pl record; min_last date;
begin
  select p.id, p.ended_on, p.ended_reason, t.notice_ends_on
    into pl
    from placements p left join placement_terms t on t.placement_id = p.id
   where p.id = p_id;
  if not found then return null; end if;
  min_last := placement_minimum_ends(p_id) - 1;

  if pl.ended_on is not null then
    if guaranteed_reason(pl.ended_reason) then return pl.ended_on; end if;
    return greatest(pl.ended_on, min_last, coalesce(pl.notice_ends_on, pl.ended_on));
  end if;
  if pl.notice_ends_on is not null then
    return greatest(pl.notice_ends_on, min_last);
  end if;
  return null;
end $$;
revoke all on function placement_bill_through(uuid) from public, anon;
grant execute on function placement_bill_through(uuid) to authenticated, service_role;

-- Thirty days' written notice, effective at the end of the following billing
-- month. The three-month minimum always applies.
create or replace function notice_end_date(p_id uuid, p_given date) returns date
language sql stable security definer set search_path = public as $$
  select greatest(
    (date_trunc('month', p_given) + interval '2 months - 1 day')::date,
    placement_minimum_ends(p_id) - 1
  );
$$;
revoke all on function notice_end_date(uuid, date) from public, anon;
grant execute on function notice_end_date(uuid, date) to authenticated, service_role;

-- What a client may read about their own terms: my_placement_terms stays
-- exactly as PART 35 defines it (schema.sql re-creates it with
-- "create or replace view" on every run, and Postgres refuses to drop a
-- column that way, so adding one here would break the next schema.sql run).
-- The minimum's end is a PostgREST computed column instead: selecting
-- 'minimum_ends' from my_placement_terms calls this function per row, and the
-- row is already scoped to the caller by the view.
do $$ begin
  -- an earlier draft of this part appended minimum_ends to the view itself
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'my_placement_terms'
                and column_name = 'minimum_ends') then
    drop view my_placement_terms cascade;
    create view my_placement_terms as
    select t.placement_id, t.rate_month_cents, t.minimum_months, t.notice_given_on, t.notice_ends_on, t.updated_at
    from placement_terms t
    where is_admin() or exists (
      select 1 from placements p where p.id = t.placement_id and p.client_id = auth.uid()
    );
    grant select on my_placement_terms to authenticated;
  end if;
end $$;

create or replace function minimum_ends(my_placement_terms) returns date
language sql stable as $$
  select placement_minimum_ends($1.placement_id);
$$;
revoke all on function minimum_ends(my_placement_terms) from public, anon;
grant execute on function minimum_ends(my_placement_terms) to authenticated, service_role;

-- ---------- 3. notice, from either side ----------

-- The single writer. Not callable directly: only through give_notice (the
-- executive) and give_notice_admin (the console).
create or replace function record_notice(p_placement uuid, p_on date, p_reason text, p_note text, p_by uuid)
returns date language plpgsql security definer set search_path = public as $$
declare d date;
begin
  insert into placement_terms (placement_id) values (p_placement) on conflict do nothing;
  update placement_terms
     set notice_given_on    = coalesce(notice_given_on, p_on),
         notice_reason      = coalesce(notice_reason, nullif(trim(p_reason), '')),
         notice_note        = coalesce(notice_note, nullif(left(trim(coalesce(p_note, '')), 1000), '')),
         notice_recorded_by = coalesce(notice_recorded_by, p_by),
         updated_at         = now()
   where placement_id = p_placement
   returning notice_given_on into d;
  update placement_terms
     set notice_ends_on = notice_end_date(p_placement, d)
   where placement_id = p_placement;
  return d;
end $$;
revoke all on function record_notice(uuid, date, text, text, uuid) from public, anon, authenticated;

-- The executive's own notice. Returns the date notice was given (unchanged
-- contract with PART 28); the end date is on my_placement_terms.
drop function if exists give_notice(uuid);
create or replace function give_notice(p_placement uuid, p_reason text default null, p_note text default null)
returns date language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from placements p
                  where p.id = p_placement and p.client_id = auth.uid() and p.ended_on is null) then
    raise exception 'not your placement';
  end if;
  return record_notice(p_placement, billing_today(), p_reason, p_note, auth.uid());
end $$;
revoke all on function give_notice(uuid, text, text) from public, anon;
grant execute on function give_notice(uuid, text, text) to authenticated;

-- Written notice received by Relève (an email, a call followed by a letter)
-- and recorded from the console, optionally on the day it actually arrived.
create or replace function give_notice_admin(p_placement uuid, p_on date default null,
                                             p_reason text default null, p_note text default null)
returns date language plpgsql security definer set search_path = public as $$
declare pl record; d date := coalesce(p_on, billing_today());
begin
  if not is_admin() then raise exception 'Relève team only'; end if;
  select id, started_on, ended_on into pl from placements where id = p_placement;
  if not found then raise exception 'That placement does not exist.'; end if;
  if pl.ended_on is not null then raise exception 'That placement has already ended.'; end if;
  if d > billing_today() then raise exception 'Notice cannot be dated in the future.'; end if;
  if d < pl.started_on then raise exception 'Notice cannot be dated before the placement started.'; end if;
  return record_notice(p_placement, d, p_reason, p_note, auth.uid());
end $$;
revoke all on function give_notice_admin(uuid, date, text, text) from public, anon;
grant execute on function give_notice_admin(uuid, date, text, text) to authenticated;

-- Notice recorded in error, or withdrawn by agreement.
create or replace function withdraw_notice(p_placement uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Relève team only'; end if;
  update placement_terms
     set notice_given_on = null, notice_ends_on = null, notice_reason = null,
         notice_note = null, notice_recorded_by = null, updated_at = now()
   where placement_id = p_placement;
end $$;
revoke all on function withdraw_notice(uuid) from public, anon;
grant execute on function withdraw_notice(uuid) to authenticated;

-- Placements with notice recorded before this part: recompute the end date
-- under the real rule. Only ones still running; an ended one is history.
update placement_terms t
   set notice_ends_on = notice_end_date(t.placement_id, t.notice_given_on)
  from placements p
 where p.id = t.placement_id and p.ended_on is null and t.notice_given_on is not null
   and t.notice_ends_on is distinct from notice_end_date(t.placement_id, t.notice_given_on);

-- ---------- 4. the owner's powers, enforced in the database (B18) ----------

-- Money functions set this for their own transaction, so the guard below can
-- tell "the billing engine adjusted a draft" from "somebody edited an amount".
create or replace function money_trusted() returns boolean
language sql stable as $$
  select coalesce(current_setting('releve.money_trusted', true), '') = 'on'
      or coalesce(auth.role(), '') = 'service_role'
      -- the database owner (SQL editor, scripts) is not a browser session
      or current_user not in ('anon', 'authenticated');
$$;

create or replace function guard_invoice_money() returns trigger
language plpgsql as $$
begin
  if money_trusted() then return new; end if;

  -- What Stripe is doing, only Stripe can change.
  if old.status = 'processing' and new.status is distinct from old.status then
    raise exception 'That invoice is clearing with the bank. Its status changes when Stripe reports back.';
  end if;
  if new.status in ('processing', 'refunded', 'disputed') and new.status is distinct from old.status then
    raise exception 'Only Stripe can move an invoice to %.', new.status;
  end if;
  if old.status in ('refunded', 'disputed') and new.status is distinct from old.status then
    raise exception 'That invoice is with Stripe (%). Its status changes when Stripe reports back.', old.status;
  end if;

  if not is_owner() then
    if new.status is distinct from old.status
       and (new.status in ('paid', 'void') or old.status in ('paid', 'void'))
       and not (new.status = 'paid' and new.amount_cents = 0) then
      raise exception 'Only the owner can mark an invoice paid or void.';
    end if;
    if new.amount_cents is distinct from old.amount_cents
       or new.deposit_credit_cents is distinct from old.deposit_credit_cents
       or new.refunded_cents is distinct from old.refunded_cents then
      raise exception 'Only the owner can change an invoice amount.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_invoice_money_t on invoices;
create trigger guard_invoice_money_t before update on invoices
for each row execute function guard_invoice_money();

create or replace function guard_invoice_delete() returns trigger
language plpgsql as $$
begin
  if money_trusted() then return old; end if;
  if old.status <> 'draft' and not is_owner() then
    raise exception 'Only a draft can be deleted. Void it instead.';
  end if;
  if old.status not in ('draft', 'void') then
    raise exception 'An issued invoice is never deleted. Void it instead.';
  end if;
  return old;
end $$;
drop trigger if exists guard_invoice_delete_t on invoices;
create trigger guard_invoice_delete_t before delete on invoices
for each row execute function guard_invoice_delete();

-- An invoice drafted on the first Monday and sent on the twelfth is due on
-- the twelfth: due on receipt means receipt.
create or replace function invoice_sent_dates() returns trigger
language plpgsql as $$
begin
  if new.status = 'sent' and old.status = 'draft' then
    if new.due_on is null or new.due_on < billing_today() then
      new.due_on := billing_today();
    end if;
    new.reminders_sent := '{}';
  end if;
  return new;
end $$;
drop trigger if exists invoice_sent_dates_t on invoices;
create trigger invoice_sent_dates_t before update on invoices
for each row execute function invoice_sent_dates();

-- Invoice numbers, as PART 4, with paid_on in Pacific rather than UTC.
create or replace function number_invoice() returns trigger language plpgsql as $$
declare n int;
begin
  if new.status <> 'draft' and new.number is null then
    select coalesce(max(substring(number from '\d+$')::int), 0) + 1
      into n from invoices
     where number like 'REL-' || extract(year from new.issued_on)::text || '-%';
    new.number := 'REL-' || extract(year from new.issued_on)::text || '-' || lpad(n::text, 4, '0');
  end if;
  if new.status = 'paid' and new.paid_on is null then
    new.paid_on := billing_today();
  end if;
  return new;
end $$;

-- ---------- 5. the deposit credit, in cents (B6) ----------

-- Money functions mark their own work as trusted for the guard above, and put
-- the flag back exactly as they found it when they finish, so the trust never
-- outlives the call (a later row in the same statement is guarded again).
create or replace function money_trust_on() returns text
language plpgsql volatile as $$
declare prev text := coalesce(current_setting('releve.money_trusted', true), '');
begin
  perform set_config('releve.money_trusted', 'on', true);
  return prev;
end $$;
create or replace function money_trust_restore(prev text) returns void
language plpgsql volatile as $$
begin
  perform set_config('releve.money_trusted', coalesce(prev, ''), true);
end $$;
revoke all on function money_trust_on() from public, anon, authenticated;
revoke all on function money_trust_restore(text) from public, anon, authenticated;

-- Applies every paid or clearing deposit's unused credit to that client's
-- draft retainers, oldest first. A remainder carries forward; nothing is lost
-- to greatest(0, ...). Internal: callers are the run and the triggers below.
create or replace function _apply_deposit_credits(p_client uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare d record; inv record; avail int; take int; n int := 0; prev_trust text;
begin
  prev_trust := money_trust_on();
  for d in
    select i.id, i.client_id, i.amount_cents, i.credited_cents
      from invoices i
     where i.kind = 'deposit' and i.status in ('paid', 'processing')
       and i.amount_cents - i.credited_cents > 0
       and (p_client is null or i.client_id = p_client)
     order by i.issued_on, i.created_at
  loop
    avail := d.amount_cents - d.credited_cents;
    for inv in
      select r.id, r.amount_cents
        from invoices r
       where r.client_id = d.client_id and r.kind = 'retainer'
         and r.status = 'draft' and r.amount_cents > 0
       order by r.period_start, r.created_at
    loop
      exit when avail <= 0;
      take := least(avail, inv.amount_cents);
      update invoices
         set subtotal_cents       = coalesce(subtotal_cents, amount_cents + deposit_credit_cents),
             amount_cents         = amount_cents - take,
             deposit_credit_cents = deposit_credit_cents + take,
             credit_source        = d.id
       where id = inv.id;
      avail := avail - take;
      n := n + 1;
    end loop;
    update invoices
       set credited_cents = amount_cents - avail,
           credited_on    = case when avail = 0 then coalesce(credited_on, billing_today()) else null end
     where id = d.id;
  end loop;
  perform money_trust_restore(prev_trust);
  return n;
end $$;
revoke all on function _apply_deposit_credits(uuid) from public, anon, authenticated;

create or replace function apply_deposit_credits(p_client uuid default null) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not is_team_or_service() then raise exception 'Relève team only'; end if;
  return _apply_deposit_credits(p_client);
end $$;
revoke all on function apply_deposit_credits(uuid) from public, anon;
grant execute on function apply_deposit_credits(uuid) to authenticated, service_role;

-- Voiding a retainer that carried credit gives the credit back to its deposit,
-- so the next draft picks it up. A deposit that becomes paid or clearing
-- after its first retainer was drafted is credited then, not never.
create or replace function invoice_credit_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev_trust text;
begin
  prev_trust := money_trust_on();
  if new.kind = 'retainer' and new.status = 'void' and old.status is distinct from 'void'
     and new.deposit_credit_cents > 0 and new.credit_source is not null then
    update invoices
       set credited_cents = greatest(0, credited_cents - new.deposit_credit_cents),
           credited_on = null
     where id = new.credit_source;
    perform _apply_deposit_credits(new.client_id);
  end if;
  if new.kind = 'deposit' and new.status in ('paid', 'processing')
     and old.status is distinct from new.status then
    perform _apply_deposit_credits(new.client_id);
  end if;
  perform money_trust_restore(prev_trust);
  return new;
end $$;
drop trigger if exists invoice_credit_events_t on invoices;
create trigger invoice_credit_events_t after update of status on invoices
for each row execute function invoice_credit_events();

-- The search keeps its own deposit invoice honest: paid by hand creates or
-- settles it (PART 28), and now waived voids it, so a waived deposit can never
-- be mailed or charged (B15).
create or replace function sync_deposit_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev_trust text;
begin
  prev_trust := money_trust_on();
  if new.client_id is not null and new.deposit_status = 'paid'
     and (old.deposit_status is distinct from 'paid') then
    insert into invoices (client_id, search_id, kind, amount_cents,
                          issued_on, due_on, status, paid_on, stripe_payment_intent, note)
    select new.client_id, new.id, 'deposit', new.deposit_cents,
           coalesce(new.deposit_paid_on, billing_today()), coalesce(new.deposit_paid_on, billing_today()),
           'paid', coalesce(new.deposit_paid_on, billing_today()), new.deposit_payment_intent,
           'Search deposit. Non-refundable, credited against the first monthly invoice.'
    where not exists (select 1 from invoices where search_id = new.id and kind = 'deposit');
    update invoices
       set status = 'paid', paid_on = coalesce(paid_on, new.deposit_paid_on, billing_today())
     where search_id = new.id and kind = 'deposit' and status not in ('paid', 'refunded', 'disputed');
    perform _apply_deposit_credits(new.client_id);
  end if;
  if new.deposit_status = 'waived' and old.deposit_status is distinct from 'waived' then
    update invoices
       set status = 'void',
           note = 'Search deposit waived by Relève.'
     where search_id = new.id and kind = 'deposit' and status in ('draft', 'sent', 'failed');
  end if;
  perform money_trust_restore(prev_trust);
  return new;
end $$;
drop trigger if exists sync_deposit_invoice_t on searches;
create trigger sync_deposit_invoice_t after update of deposit_status on searches
for each row execute function sync_deposit_invoice();

-- A deposit paid (or still clearing) before the account existed becomes a
-- real invoice the moment the account is claimed, and the payment method
-- Checkout saved becomes the account's mandate instead of an orphan (B16).
create or replace function backfill_deposit_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev_trust text;
begin
  prev_trust := money_trust_on();
  if new.client_id is not null and old.client_id is null
     and new.deposit_status in ('paid', 'processing') then
    insert into invoices (client_id, search_id, kind, amount_cents,
                          issued_on, due_on, status, paid_on,
                          stripe_payment_intent, note)
    select new.client_id, new.id, 'deposit', new.deposit_cents,
           coalesce(new.deposit_paid_on, billing_today()), coalesce(new.deposit_paid_on, billing_today()),
           new.deposit_status, case when new.deposit_status = 'paid' then new.deposit_paid_on end,
           new.deposit_payment_intent,
           'Search deposit. Paid before the account existed, via the onboarding email.'
    where not exists (select 1 from invoices where search_id = new.id and kind = 'deposit')
      and not exists (select 1 from invoices where new.deposit_payment_intent is not null
                                               and stripe_payment_intent = new.deposit_payment_intent);
    perform _apply_deposit_credits(new.client_id);
  end if;

  if new.client_id is not null and old.client_id is null
     and new.deposit_stripe_customer is not null
     and not exists (select 1 from billing_accounts b
                      where b.stripe_customer = new.deposit_stripe_customer
                        and b.client_id <> new.client_id) then
    insert into billing_accounts (client_id, stripe_customer, payment_method, method_kind,
                                  bank_name, last4, mandate_ok, set_up_at, updated_at)
    values (new.client_id, new.deposit_stripe_customer, new.deposit_payment_method,
            case when new.deposit_method_kind in ('us_bank_account', 'card') then new.deposit_method_kind end,
            new.deposit_bank_name, new.deposit_last4,
            new.deposit_payment_method is not null, now(), now())
    on conflict (client_id) do update
      set stripe_customer = coalesce(billing_accounts.stripe_customer, excluded.stripe_customer),
          payment_method  = excluded.payment_method,
          method_kind     = excluded.method_kind,
          bank_name       = excluded.bank_name,
          last4           = excluded.last4,
          mandate_ok      = excluded.mandate_ok,
          set_up_at       = excluded.set_up_at,
          updated_at      = now()
      where billing_accounts.payment_method is null
        and (billing_accounts.stripe_customer is null
             or billing_accounts.stripe_customer = excluded.stripe_customer);
  end if;
  perform money_trust_restore(prev_trust);
  return new;
end $$;
drop trigger if exists backfill_deposit_invoice_t on searches;
create trigger backfill_deposit_invoice_t after update of client_id on searches
for each row execute function backfill_deposit_invoice();

-- ---------- 6. drafts and payroll follow the placement ----------

-- When a placement ends, takes notice, or changes rate, its draft retainers are
-- re-priced to what the rule now says is owed. Only drafts created by this
-- part (subtotal_cents set) are touched: an older draft may have a deposit
-- netted into it that nothing here could see.
create or replace function _reprice_draft_retainers(p_placement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pl record; through date; d record; b_start date; b_end date; dim int; days int;
        new_sub int; credit int; excess int; prev_trust text;
begin
  select p.id, p.started_on, t.rate_month_cents into pl
    from placements p join placement_terms t on t.placement_id = p.id
   where p.id = p_placement;
  if not found or pl.rate_month_cents is null then return; end if;
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

-- Payroll not yet sent follows the same window: work that stops mid-month is
-- paid to the day it stopped; a month after the end is not owed at all.
create or replace function _reprice_due_payroll(p_placement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pl record; r record; w_start date; w_end date; dim int; days int;
begin
  select p.id, p.started_on, p.ended_on, t.notice_ends_on,
         coalesce(t.talent_pay_cents, tp.rate_month_cents) as pay
    into pl
    from placements p
    left join placement_terms t on t.placement_id = p.id
    left join talent_pay tp on tp.talent_id = p.talent_id
   where p.id = p_placement;
  if not found or pl.pay is null then return; end if;

  for r in select * from talent_payments where placement_id = p_placement and state = 'due' loop
    w_start := greatest(r.period_start, pl.started_on);
    w_end   := least(r.period_end, coalesce(pl.ended_on, pl.notice_ends_on, r.period_end));
    if w_end < w_start then
      delete from talent_payments where id = r.id;
      continue;
    end if;
    dim  := r.period_end - r.period_start + 1;
    days := w_end - w_start + 1;
    update talent_payments
       set amount_cents = case when days = dim then pl.pay else round(pl.pay::numeric * days / dim)::int end,
           currency = 'USD',
           note = case when days = dim then null else 'Prorated: ' || days || ' of ' || dim || ' days' end
     where id = r.id;
  end loop;
end $$;
revoke all on function _reprice_due_payroll(uuid) from public, anon, authenticated;

create or replace function placement_money_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'placements' then
    perform _reprice_draft_retainers(new.id);
    perform _reprice_due_payroll(new.id);
    perform _apply_deposit_credits(new.client_id);
  else
    perform _reprice_draft_retainers(new.placement_id);
    perform _reprice_due_payroll(new.placement_id);
    perform _apply_deposit_credits((select client_id from placements where id = new.placement_id));
  end if;
  return new;
end $$;
drop trigger if exists placement_money_follow_t on placements;
create trigger placement_money_follow_t after update of ended_on, ended_reason, started_on on placements
for each row execute function placement_money_follow();
drop trigger if exists placement_terms_money_follow_t on placement_terms;
create trigger placement_terms_money_follow_t after update of rate_month_cents, notice_ends_on, talent_pay_cents, minimum_months on placement_terms
for each row execute function placement_money_follow();

-- ---------- 7. the retainer run (B2, B6, B7, B8) ----------

-- One retainer per placement per calendar month, priced by the day:
--   amount = rate x (days billable in the month / days in the month)
-- where billable runs from the start date to placement_bill_through(). A
-- placement never billed before is caught up for the month before the target
-- too, so one created the day after a run is not skipped. Idempotent.
create or replace function issue_monthly_retainers(for_month date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  target  date := date_trunc('month', coalesce(for_month, billing_today()))::date;
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
begin
  if not is_team_or_service() then
    raise exception 'only Relève may issue invoices';
  end if;
  prev_trust := money_trust_on();

  -- Notice that has taken effect ends the placement, the day after it ends.
  -- (Not before: ending it on the first of its final month made a placement
  -- read "ended" while the person was still at work.)
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
    select pl.id, pl.client_id, pl.started_on, pl.created_at, pl.suspended_at,
           t.rate_month_cents, placement_bill_through(pl.id) as through
      from placements pl
      join placement_terms t on t.placement_id = pl.id
     where t.rate_month_cents is not null
       and pl.started_on <= (target + interval '1 month - 1 day')::date
  loop
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
        -- Dated on the period's first Monday, never before the work began.
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

-- ---------- 8. payroll, prorated the same way, paused while suspended ----------
create or replace function pay_the_month(for_month date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  p_start date := date_trunc('month', coalesce(for_month, billing_today()))::date;
  p_end   date;
  dim int; days int; amt int; rc int;
  made int := 0;
  r record;
  w_start date; w_end date;
begin
  if not is_team_or_service() then raise exception 'Relève team only'; end if;
  p_end := (p_start + interval '1 month - 1 day')::date;
  dim := p_end - p_start + 1;

  for r in
    select pl.id, pl.talent_id, pl.started_on, pl.ended_on, t.notice_ends_on,
           coalesce(t.talent_pay_cents, tp.rate_month_cents) as pay
      from placements pl
      left join placement_terms t on t.placement_id = pl.id
      left join talent_pay tp on tp.talent_id = pl.talent_id
     where coalesce(t.talent_pay_cents, tp.rate_month_cents) is not null
       and pl.started_on <= p_end
       and (pl.ended_on is null or pl.ended_on >= p_start)
       and pl.suspended_at is null
  loop
    w_start := greatest(p_start, r.started_on);
    w_end   := least(p_end, coalesce(r.ended_on, r.notice_ends_on, p_end));
    continue when w_end < w_start;
    days := w_end - w_start + 1;
    amt  := case when days = dim then r.pay else round(r.pay::numeric * days / dim)::int end;

    insert into talent_payments (talent_id, placement_id, period_start, period_end, amount_cents, currency, note)
    values (r.talent_id, r.id, p_start, p_end, amt, 'USD',
            case when days < dim then 'Prorated: ' || days || ' of ' || dim || ' days' end)
    on conflict (placement_id, period_start) do nothing;
    get diagnostics rc = row_count;
    made := made + rc;
  end loop;

  return made;
end $$;

create or replace function run_the_month(for_month date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv int; pay int;
begin
  if not is_team_or_service() then raise exception 'Relève team only'; end if;
  inv := issue_monthly_retainers(for_month);
  pay := pay_the_month(for_month);
  return jsonb_build_object('invoices', inv, 'payments', pay);
end $$;

-- Old one-argument signatures stay callable by name; nothing else to grant.
revoke all on function issue_monthly_retainers(date) from public, anon;
revoke all on function pay_the_month(date) from public, anon;
revoke all on function run_the_month(date) from public, anon;
grant execute on function issue_monthly_retainers(date) to authenticated, service_role;
grant execute on function pay_the_month(date) to authenticated, service_role;
grant execute on function run_the_month(date) to authenticated, service_role;

-- ---------- 9. margin, by placement, as actually paid ----------
drop view if exists placement_margin;
create view placement_margin with (security_invoker = true) as
select
  pl.id            as placement_id,
  pl.client_id,
  pl.talent_id,
  pl.started_on,
  pl.ended_on,
  pl.suspended_at,
  t.rate_month_cents                                                     as client_pays_cents,
  coalesce(t.talent_pay_cents, tp.rate_month_cents)                      as talent_paid_cents,
  t.rate_month_cents - coalesce(t.talent_pay_cents, tp.rate_month_cents) as margin_cents
from placements pl
left join placement_terms t on t.placement_id = pl.id
left join talent_pay tp     on tp.talent_id   = pl.talent_id;
comment on view placement_margin is
  'Team only by inheritance: placement_terms and talent_pay are both admin-only, and this view runs as its caller.';


-- ---------- 10. a signed agreement is never overwritten (B21) ----------
-- client_agreements is one row per client, so re-sending the agreement
-- replaced the record of the one actually signed. The signed version is now
-- kept, every time, before anything replaces it.
create table if not exists client_agreement_history (
  id            bigserial primary key,
  client_id     uuid not null references profiles(id) on delete cascade,
  state         text,
  envelope_id   text,
  file_path     text,
  file_name     text,
  submitted_at  timestamptz,
  verified_at   timestamptz,
  signed_on     date,
  archived_at   timestamptz not null default now()
);
create index if not exists client_agreement_history_client on client_agreement_history (client_id, archived_at desc);
alter table client_agreement_history enable row level security;
drop policy if exists "read agreement history" on client_agreement_history;
create policy "read agreement history" on client_agreement_history for select
  using (client_id = auth.uid() or is_admin());
-- no write policy: only the trigger below writes here

create or replace function archive_client_agreement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.state = 'verified'
     and (new.state is distinct from old.state
          or new.envelope_id is distinct from old.envelope_id
          or new.file_path is distinct from old.file_path) then
    insert into client_agreement_history (client_id, state, envelope_id, file_path, file_name,
                                          submitted_at, verified_at, signed_on)
    values (old.client_id, old.state, old.envelope_id, old.file_path, old.file_name,
            old.submitted_at, old.verified_at, old.signed_on);
  end if;
  return new;
end $$;

do $$ begin
  if to_regclass('public.client_agreements') is not null then
    execute 'drop trigger if exists archive_client_agreement_t on client_agreements';
    execute 'create trigger archive_client_agreement_t before update on client_agreements
             for each row execute function archive_client_agreement()';
  end if;
end $$;

do $$ begin
  raise notice 'PART 39 (billing) applied: notice rule, inherited minimum, prorated billing and payroll, deposit credit ledger, owner-only money edits, refunds/disputes, suspension.';
end $$;
