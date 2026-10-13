-- ============================================================
-- PART 40 — archiving a person, instead of destroying them
-- 13 October 2026. Run AFTER schema.sql (PARTs 1 to 38) and part39-all.sql.
-- Idempotent: safe to run twice.
--
-- WHY THIS EXISTS
-- The console had exactly one way to get somebody out of a list: delete the
-- account, which cascades their Signature, interviews, matches, placements,
-- invoices and payment history and cannot be undone. That is the right tool
-- for a test row typed in while building. It is the wrong tool for a real
-- client who finished an engagement, because Relève's own commercial terms
-- depend on those records surviving: invoices are the evidence behind money
-- collected, and the 12-month non-circumvention clause is unenforceable
-- against a placement history that no longer exists.
--
-- So: archiving. One timestamp on the profile. The person leaves every list,
-- count and alert in the console; everything they did stays on file and can
-- be restored in one click. Deleting stays, for the rows that genuinely have
-- nothing worth keeping.
-- ============================================================

-- ---------- 1. the columns ----------
alter table profiles add column if not exists archived_at     timestamptz;
alter table profiles add column if not exists archived_by     uuid references profiles(id) on delete set null;
alter table profiles add column if not exists archive_reason  text;

comment on column profiles.archived_at is
  'Set when the team archives this person. Non-null means: hidden from every console list, count and alert, and excluded from matching — but every record they are attached to survives. Null means active. Restoring is setting this back to null.';

/* Partial index: every list in the app asks "archived_at is null", and the
   archived rows are the rare ones, so index only those that are set. */
create index if not exists profiles_archived on profiles(archived_at) where archived_at is not null;

-- ---------- 2. only the team may archive ----------
/* "update own profile" lets a person write their own row, which is correct
   for their name, timezone and headline. It must not let them clear an
   archive the team set, or archive themselves out of their own invoices.
   guard_profile_edit already pins the fields the team owns on a self-edit;
   these three join them. Rewritten in full rather than patched, because the
   function is replaced wholesale and every earlier line has to survive. */
create or replace function guard_profile_edit() returns trigger language plpgsql as $$
declare i_am_admin boolean;
begin
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') into i_am_admin;

  if auth.uid() = new.id and not i_am_admin then
    new.stage      := old.stage;        -- the team owns the pipeline stage
    new.assigned_by_releve := old.assigned_by_releve;

    -- PART 40: and the team owns whether you are archived.
    new.archived_at    := old.archived_at;
    new.archived_by    := old.archived_by;
    new.archive_reason := old.archive_reason;

    if old.role_chosen_at is not null or old.assigned_by_releve = true or old.role = 'admin' then
      new.role           := old.role;   -- every later attempt: ignored
      new.role_chosen_at := old.role_chosen_at;
    elsif new.role = 'client' then
      raise exception 'An executive account starts with a discovery call, not a sign-up form — talk to your Client Success Manager.';
    elsif new.role = 'talent' then
      new.role_chosen_at := now();      -- the one-time choice: allowed, and stamped
    else
      new.role           := old.role;
      new.role_chosen_at := old.role_chosen_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profile_edit_guard on profiles;
create trigger profile_edit_guard before update on profiles
for each row execute function guard_profile_edit();

-- ---------- 3. archiving is logged, like every other consequential act ----------
/* Same reasoning as PART 36's rate and payout-detail logging: "who took this
   person out of the roster, and when" has to be answerable later. */
create or replace function audit_archive() returns trigger
language plpgsql security definer as $$
begin
  if new.archived_at is distinct from old.archived_at then
    perform note_action(
      case when new.archived_at is null then 'person_restored' else 'person_archived' end,
      'profiles', new.id,
      jsonb_build_object('role', new.role, 'reason', new.archive_reason));
  end if;
  return new;
end $$;

drop trigger if exists audit_archive_t on profiles;
create trigger audit_archive_t after update of archived_at on profiles
for each row execute function audit_archive();

-- ---------- 4. the directories stop returning archived people ----------
/* Filtering here rather than in the app is the whole point: every reader of
   the roster — the console, matching, the client's candidate list, anything
   written later — inherits it without having to remember. Both views are
   recreated verbatim from PART 33 and PART 32 with one clause added. */

drop view if exists talent_directory;
create view talent_directory with (security_invoker = true) as
select
  p.id, p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.stage, p.photo_url, p.intro_video_url,
  s.scores, s.facets, s.validity, s.confidence, s.conditions as cond,
  (s.user_id is not null) as has_signature,
  coalesce((select jsonb_array_length(sp.disciplines) from skills_profile sp
             where sp.talent_id = p.id), 0) > 0                          as has_disciplines,
  exists (select 1 from talent_verification_badges b
           where b.talent_id = p.id and b.verified_through_taking_the_watch) as watch_cleared
from profiles p
left join signatures s on s.user_id = p.id and s.side = 'talent'
where p.role = 'talent'
  and p.archived_at is null;

comment on view talent_directory is
  'Admin-only full talent roster. Left-joined to signatures (PART 33) so a talent mid-onboarding with no Signature yet still appears, flagged via has_signature = false. Archived people are excluded (PART 40).';

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
  and p.archived_at is null
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
  'Client-safe candidate rows: scores, confidence, conditions, archetype and the validity verdict only — no validity internals, no facets. Definer view scoped per caller by auth.uid(). Archived people are excluded (PART 40).';
grant select on candidate_directory to authenticated;

/* WHAT IS DELIBERATELY NOT HERE. The rule for what blocks a permanent
   removal — a live placement, an unpaid invoice, money still owed — lives in
   the app, in lib/archive.ts, not in a database function. It was written
   here first and moved out, for one reason: the Remove button has to keep
   working on a database where this file has not been run yet. A guard that
   only exists after a migration is a guard that is absent exactly when
   somebody is mid-migration and least careful. */

do $$ begin raise notice 'PART 40 applied: profiles can be archived; talent_directory and candidate_directory exclude archived people.'; end $$;
