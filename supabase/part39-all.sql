-- ============================================================
-- PART 39 (all lanes), combined and ordered for production.
-- 2 Oct 2026 fix pass. Run AFTER the whole of schema.sql (PARTs 1 to 38),
-- in the same session. Idempotent: verified locally to run clean twice in a
-- row, each time preceded by a full schema.sql run, on a database that
-- already had PARTs 1 to 36 applied.
--
-- Order: security (Lane A), billing (Lane B), experience (Lane C). None of
-- the three depends on another; this order keeps the guards in place before
-- the billing triggers that run under them.
--
-- Generated from part39-security.sql, part39-billing.sql and
-- part39-experience.sql. Edit those, then regenerate this file.
-- ============================================================


-- >>>>>>>>>> part39-security.sql
-- ============================================================
-- PART 39 (Lane A) — security and database access
-- Audit of 2 Oct 2026, findings S1, S3 to S11, S15.
--
-- Idempotent and safe to re-run: every object is create-or-replace,
-- every policy is dropped before it is created, and every grant runs
-- inside a check that the function exists.
--
-- Does NOT touch pay_the_month, run_the_month, issue_monthly_retainers,
-- give_notice or any billing function (Lane B).
--
-- One pattern runs through this file. A guard trigger asks
--     current_user in ('anon', 'authenticated')
-- to decide whether a write came straight from a person's own Supabase
-- session (the REST API, or the app acting as them). Inside a security
-- definer function such as claim_pending() or team_promote(), current_user
-- is the function's owner, and the service role is 'service_role', so the
-- database's own trusted paths are never blocked by a guard meant for a
-- person.
-- ============================================================

-- ---------- 0. helpers ----------

-- True for a write made directly by a signed-in or anonymous person who is
-- not on the Relève team. Deliberately NOT security definer: it must see the
-- real current_user.
create or replace function acting_as_end_user() returns boolean
language sql stable as $$
  select current_user in ('anon', 'authenticated') and not coalesce(is_admin(), false);
$$;

-- The signed-in person's own address as Supabase Auth holds it. A person can
-- read only their own, so nothing here is a lookup into anybody else.
create or replace function my_auth_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select u.email from auth.users u where u.id = auth.uid();
$$;

-- Is this person an owner? Same rule as is_owner(), for any account.
create or replace function is_owner_id(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    left join team_roles t on t.user_id = p.id
    where p.id = person and p.role = 'admin'
      and coalesce(t.team_role, 'owner') = 'owner'
  );
$$;

-- How many owners Relève would have left without this person.
create or replace function owners_besides(person uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from profiles p
  left join team_roles t on t.user_id = p.id
  where p.role = 'admin' and coalesce(t.team_role, 'owner') = 'owner'
    and p.id <> person;
$$;


-- ---------- 1. S1: nobody inserts their own way into a role ----------
-- "insert own profile" only checked id = auth.uid(). With sign-ups open,
-- anyone could create an auth user and POST a profile row with role 'admin',
-- or with someone else's email so claim_pending() handed them that person's
-- pending role. This fixes every column that decides access, for anyone who
-- is not Relève, before the row exists.
create or replace function guard_profile_insert() returns trigger
language plpgsql as $$
declare em text;
begin
  if current_user in ('anon', 'authenticated') and not coalesce(is_admin(), false) then
    if auth.uid() is null or new.id is distinct from auth.uid() then
      raise exception 'A profile can only be created for your own account.';
    end if;
    em := my_auth_email();
    if em is null then
      raise exception 'Your account has no email address on file.';
    end if;
    new.email              := lower(em);
    new.role               := 'talent';   -- a placeholder; the person picks a side, or claim_pending() sets it
    new.role_chosen_at     := null;
    new.assigned_by_releve := false;
    new.stage              := 'Applied';
    new.onboarded_at       := null;
    new.photo_url          := null;
    new.intro_video_url    := null;
    new.full_name          := nullif(left(btrim(coalesce(new.full_name, '')), 120), '');
  end if;
  return new;
end $$;
drop trigger if exists profile_insert_guard on profiles;
create trigger profile_insert_guard before insert on profiles
  for each row execute function guard_profile_insert();

-- The policy itself is unchanged: your own row only. The trigger above is
-- what decides what that row may say.
drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles for insert
  with check (id = auth.uid());

-- The update guard, restated. Changes from PART 21:
--   * it stands aside for the database's own trusted paths (claim_pending,
--     the team functions, the service role) instead of reverting them. The
--     PART 21 version reverted, or raised on, claim_pending's own update, so
--     a pending executive or a pending admin could not be claimed at all.
--   * a person's email follows their sign-in, never a self-edit.
--   * photo and intro links can only point at the app's own viewer route for
--     that same person.
--   * only an owner can move anyone into or out of the admin role.
--   * Relève can never be left without an owner.
create or replace function guard_profile_edit() returns trigger language plpgsql as $$
declare i_am_admin boolean := coalesce(is_admin(), false);
begin
  if current_user in ('anon', 'authenticated') then
    if not i_am_admin then
      new.id                 := old.id;
      new.email              := old.email;
      new.stage              := old.stage;          -- the team owns the pipeline stage
      new.assigned_by_releve := old.assigned_by_releve;

      if old.role_chosen_at is not null or old.assigned_by_releve = true or old.role = 'admin' then
        new.role           := old.role;              -- every later attempt: ignored
        new.role_chosen_at := old.role_chosen_at;
      elsif new.role = 'client' then
        raise exception 'An executive account starts with a discovery call. Talk to your Client Success Manager.';
      elsif new.role = 'talent' then
        new.role_chosen_at := now();                 -- the one-time choice: allowed, and stamped
      else
        new.role           := old.role;
        new.role_chosen_at := old.role_chosen_at;
      end if;

      if new.photo_url is distinct from old.photo_url and new.photo_url is not null
         and new.photo_url not like '/api/photo/view?u=' || new.id::text || '%' then
        new.photo_url := old.photo_url;
      end if;
      if new.intro_video_url is distinct from old.intro_video_url and new.intro_video_url is not null
         and new.intro_video_url not like '/api/video/view?u=' || new.id::text || '%' then
        new.intro_video_url := old.intro_video_url;
      end if;
    elsif new.role is distinct from old.role
          and (new.role = 'admin' or old.role = 'admin')
          and not is_owner() then
      raise exception 'Only an owner can change who has console access.';
    end if;
  end if;

  if old.role = 'admin' and new.role is distinct from 'admin'
     and is_owner_id(old.id) and owners_besides(old.id) = 0 then
    raise exception 'Relève always keeps at least one owner. Make someone else an owner first.';
  end if;
  return new;
end $$;
drop trigger if exists profile_edit_guard on profiles;
create trigger profile_edit_guard before update on profiles
  for each row execute function guard_profile_edit();

-- claim_pending matches on the address Supabase Auth verified, never on the
-- email column a caller could have written, and only once that address is
-- confirmed. It also restores two lines PART 30 dropped by accident: the
-- executive's search moves across to their new account, and the account is
-- marked as assigned by Relève so the side question is never asked.
create or replace function claim_pending() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare p pending_people%rowtype; em text; confirmed boolean;
begin
  select u.email, (u.email_confirmed_at is not null)
    into em, confirmed
    from auth.users u where u.id = new.id;
  if em is null or not coalesce(confirmed, false) then
    return new;
  end if;

  select * into p from pending_people
   where lower(email) = lower(em) and claimed_by is null
   order by created_at limit 1;
  if found then
    update profiles set
      email = lower(em),
      role = p.role, full_name = coalesce(new.full_name, p.full_name), org_name = p.org_name,
      headline = p.headline, location = p.location, timezone = p.timezone,
      years_exp = p.years_exp, english = p.english,
      stage = coalesce(p.stage, profiles.stage),
      assigned_by_releve = true,
      role_chosen_at = coalesce(profiles.role_chosen_at, now())
    where id = new.id;
    update searches set client_id = new.id, pending_id = null where pending_id = p.id;
    -- pay goes to talent_pay, never onto the profile row
    if p.rate_month is not null then
      insert into talent_pay (talent_id, rate_month) values (new.id, p.rate_month)
      on conflict (talent_id) do update set rate_month = excluded.rate_month;
    end if;
    -- a pending admin also gets a team_roles row, so they show on the Team page
    if p.role = 'admin' then
      insert into team_roles (user_id, team_role)
      values (new.id, coalesce(p.team_role, 'manager'))
      on conflict (user_id) do update set team_role = excluded.team_role;
    end if;
    update pending_people set claimed_by = new.id where id = p.id;
  end if;
  return new;
end $$;
drop trigger if exists on_profile_created on profiles;
create trigger on_profile_created after insert on profiles
  for each row execute function claim_pending();

-- A pending admin is a promise of console access. Only an owner may make
-- one, or change one. (Any admin could previously insert a pending_people
-- row with role 'admin' straight through the REST API.)
create or replace function guard_pending_admin() returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.role = 'admin' or (tg_op = 'UPDATE' and old.role = 'admin'))
     and not is_owner() then
    raise exception 'Only an owner can give someone console access.';
  end if;
  return new;
end $$;
drop trigger if exists pending_admin_guard on pending_people;
create trigger pending_admin_guard before insert or update on pending_people
  for each row execute function guard_pending_admin();


-- ---------- 2. S15: managing the team without editing the database ----------

-- Never leave Relève without an owner, however the row is changed.
create or replace function guard_last_owner() returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE' and old.team_role = 'owner')
     or (tg_op = 'UPDATE' and old.team_role = 'owner' and new.team_role is distinct from 'owner') then
    if exists (select 1 from profiles where id = old.user_id and role = 'admin')
       and owners_besides(old.user_id) = 0 then
      raise exception 'Relève always keeps at least one owner. Make someone else an owner first.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists team_last_owner_guard on team_roles;
create trigger team_last_owner_guard before update or delete on team_roles
  for each row execute function guard_last_owner();

-- Give an existing Relève account console access.
create or replace function team_promote(p_email text, p_team_role text default 'manager')
returns uuid language plpgsql security definer set search_path = public as $$
declare target profiles%rowtype; r text := coalesce(nullif(p_team_role, ''), 'manager');
begin
  if not is_owner() then
    raise exception 'Only an owner can give someone console access.';
  end if;
  if r not in ('owner', 'client_success', 'talent_success', 'manager') then
    raise exception 'That is not a team role.';
  end if;
  select * into target from profiles
   where lower(email) = lower(btrim(coalesce(p_email, '')))
   order by created_at limit 1;
  if not found then
    raise exception 'There is no Relève account with that email yet.';
  end if;
  if target.role = 'admin' then
    raise exception 'That person is already on the Relève team.';
  end if;
  if exists (select 1 from placements where client_id = target.id or talent_id = target.id)
     or exists (select 1 from searches where client_id = target.id) then
    raise exception 'That account is in use as an executive or talent account. Console access needs its own email address.';
  end if;

  update profiles
     set role = 'admin', assigned_by_releve = true,
         role_chosen_at = coalesce(role_chosen_at, now()), stage = 'Active'
   where id = target.id;
  insert into team_roles (user_id, team_role, added_by)
  values (target.id, r, auth.uid())
  on conflict (user_id) do update
    set team_role = excluded.team_role, added_by = excluded.added_by, added_at = now();
  perform note_action('team_added', 'team_roles', target.id,
    jsonb_build_object('team_role', r, 'email', target.email));
  return target.id;
end $$;

-- Change what someone on the team may do.
create or replace function team_set_role(p_user uuid, p_team_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then
    raise exception 'Only an owner can change team roles.';
  end if;
  if p_team_role not in ('owner', 'client_success', 'talent_success', 'manager') then
    raise exception 'That is not a team role.';
  end if;
  if not exists (select 1 from profiles where id = p_user and role = 'admin') then
    raise exception 'That person is not on the Relève team.';
  end if;
  if p_team_role <> 'owner' and is_owner_id(p_user) and owners_besides(p_user) = 0 then
    raise exception 'Relève always keeps at least one owner. Make someone else an owner first.';
  end if;
  insert into team_roles (user_id, team_role, added_by)
  values (p_user, p_team_role, auth.uid())
  on conflict (user_id) do update set team_role = excluded.team_role;
  perform note_action('team_role_set', 'team_roles', p_user,
    jsonb_build_object('team_role', p_team_role));
end $$;

-- Take console access away. The account itself stays (its audit trail and
-- the records it touched stay attributed), as a closed talent-side account
-- marked 'Former team'. Any placement it managed becomes unassigned, so the
-- console shows it needs a new manager.
create or replace function team_remove(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not is_owner() then
    raise exception 'Only an owner can remove someone from the team.';
  end if;
  select email into who from profiles where id = p_user and role = 'admin';
  if not found then
    raise exception 'That person is not on the Relève team.';
  end if;
  if is_owner_id(p_user) and owners_besides(p_user) = 0 then
    raise exception 'Relève always keeps at least one owner. Make someone else an owner first.';
  end if;

  update placements set csm_id = null where csm_id = p_user and ended_on is null;
  update placements set tsm_id = null where tsm_id = p_user and ended_on is null;
  update profiles
     set role = 'talent', stage = 'Former team', assigned_by_releve = true,
         role_chosen_at = coalesce(role_chosen_at, now())
   where id = p_user;
  delete from team_roles where user_id = p_user;
  perform note_action('team_removed', 'team_roles', p_user, jsonb_build_object('email', who));
end $$;

-- Withdraw an invitation that has not been used yet.
create or replace function team_cancel_invite(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then
    raise exception 'Only an owner can withdraw an invitation.';
  end if;
  delete from pending_people where id = p_id and role = 'admin' and claimed_by is null;
  if not found then
    raise exception 'That invitation has already been used or withdrawn.';
  end if;
end $$;


-- ---------- 3. S5: a signed agreement cannot be replaced by its signer ----------
-- The DocuSign webhook files the completed agreement at
-- vetting/<talent id>/agreement.pdf. The talent's own folder policies let
-- them upload, replace or remove anything in that folder, the signed
-- agreement included. Now: nothing named agreement.* is theirs to touch
-- (Relève files it, through the webhook or the console), and a document
-- Relève has already verified, and that has not expired, is locked.
drop policy if exists "own vetting files upload" on storage.objects;
create policy "own vetting files upload" on storage.objects for insert
  with check (
    bucket_id = 'vetting'
    and (
      is_admin()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and storage.filename(name) !~* '^agreement\.'
      )
    )
  );

drop policy if exists "own vetting files replace" on storage.objects;
create policy "own vetting files replace" on storage.objects for update
  using (
    bucket_id = 'vetting'
    and (
      is_admin()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and storage.filename(name) !~* '^agreement\.'
        and not exists (
          select 1 from vetting v
           where v.file_path = objects.name and v.state = 'verified'
             and (v.expires_on is null or v.expires_on >= current_date)
        )
      )
    )
  )
  with check (
    bucket_id = 'vetting'
    and (
      is_admin()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and storage.filename(name) !~* '^agreement\.'
      )
    )
  );

drop policy if exists "own vetting files remove" on storage.objects;
create policy "own vetting files remove" on storage.objects for delete
  using (
    bucket_id = 'vetting'
    and (
      is_admin()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and storage.filename(name) !~* '^agreement\.'
        and not exists (
          select 1 from vetting v
           where v.file_path = objects.name and v.state = 'verified'
             and (v.expires_on is null or v.expires_on >= current_date)
        )
      )
    )
  );

-- The agreements bucket: written only by the webhook (service role) or an
-- admin. Removal was never stated, so say it: admin only.
drop policy if exists "admin removes agreement files" on storage.objects;
create policy "admin removes agreement files" on storage.objects for delete
  using (bucket_id = 'agreements' and is_admin());


-- ---------- 4. S6: applications only arrive through /api/apply ----------
-- The anonymous insert on job_applications, and the anonymous upload to the
-- resume bucket, let a script skip the route's rate limit, its required
-- resume and its check of the file's actual bytes. /api/apply now writes
-- both with the service role after every check passes, so neither policy is
-- needed by anybody.
drop policy if exists "anyone may apply" on job_applications;
drop policy if exists "anyone may attach a resume" on storage.objects;

-- The bucket keeps its own limits as a second line: private, 5MB,
-- documents only.
update storage.buckets
   set public = false, file_size_limit = 5242880,
       allowed_mime_types = array['application/pdf',
                                  'application/msword',
                                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 where id = 'applications';


-- ---------- 5. S9: interviews ----------
-- "client books" let an executive insert an interview with any talent id,
-- released to them or not. "either side updates" had no WITH CHECK and no
-- column limits, so either party could rewrite the meeting link, the time,
-- or set a status only Relève should record.
drop policy if exists "client books" on interviews;
create policy "client books" on interviews for insert
  with check (
    is_admin()
    or (
      client_id = auth.uid()
      and status in ('Proposed', 'Confirmed')
      and starts_at > now() - interval '5 minutes'
      and duration_min between 15 and 180
      and notes is null
      and (meeting_url is null or meeting_url ~* '^https://([a-z0-9-]+\.)*zoom\.us/')
      and (
        exists (select 1 from matches m
                 where m.talent_id = interviews.talent_id and m.released
                   and (m.client_id = auth.uid()
                        or exists (select 1 from searches se
                                    where se.id = m.search_id and se.client_id = auth.uid())))
        or exists (select 1 from placements pl
                    where pl.client_id = auth.uid() and pl.talent_id = interviews.talent_id)
      )
    )
  );

drop policy if exists "either side updates" on interviews;
create policy "either side updates" on interviews for update
  using (client_id = auth.uid() or talent_id = auth.uid() or is_admin())
  with check (client_id = auth.uid() or talent_id = auth.uid() or is_admin());

-- Either side may confirm or cancel. Every other field, and every other
-- status, is Relève's record of what happened.
create or replace function guard_interview_edit() returns trigger language plpgsql as $$
begin
  if acting_as_end_user() then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Only Relève can change the details of an interview.';
    end if;
    if new.status is distinct from old.status and new.status not in ('Confirmed', 'Cancelled') then
      raise exception 'Only Relève can set that status.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists interview_edit_guard on interviews;
create trigger interview_edit_guard before update on interviews
  for each row execute function guard_interview_edit();


-- ---------- 6. S8 and S10: Taking The Watch ----------

-- S8. A talent could select their own raw score row: the four rubric numbers
-- and the reviewer's internal notes. They now read only my_watch_results,
-- which runs as its owner and returns the verdict and the feedback written
-- for them, for their own attempts, and nothing else.
drop policy if exists "talent reads own watch score" on taking_the_watch_scores;

drop view if exists my_watch_results;
create view my_watch_results as
select a.id as attempt_id, a.discipline, a.status, a.started_at, a.submitted_at,
       s.overall_result, s.talent_feedback, s.scored_at,
       (s.attempt_id is not null) as has_score
from taking_the_watch_attempts a
left join taking_the_watch_scores s on s.attempt_id = a.id
where a.talent_id = auth.uid();
comment on view my_watch_results is
  'A talent''s own Taking The Watch results: verdict and feedback only. Runs as its owner on purpose (talent have no select on taking_the_watch_scores); the where clause is the access rule.';
revoke all on my_watch_results from anon, public;
grant select on my_watch_results to authenticated;

-- S10. "update while open" let a talent move started_at or raise
-- time_limit_minutes on their own attempt, which defeats the cutoff on the
-- tasks policy. The app never updates an attempt from the talent's session
-- (submitting goes through submit_watch_attempt), so the talent's update
-- right is removed, and an insert can no longer set its own clock.
drop policy if exists "own watch attempts update while open" on taking_the_watch_attempts;
drop policy if exists "team updates watch attempts" on taking_the_watch_attempts;
create policy "team updates watch attempts" on taking_the_watch_attempts for update
  using (is_admin()) with check (is_admin());

create or replace function guard_watch_attempt_insert() returns trigger language plpgsql as $$
begin
  if acting_as_end_user() then
    new.started_at         := now();
    new.created_at         := now();
    new.status             := 'in_progress';
    new.submitted_at       := null;
    new.time_limit_minutes := least(greatest(coalesce(new.time_limit_minutes, 180), 1), 180);
  end if;
  return new;
end $$;
drop trigger if exists watch_attempt_insert_guard on taking_the_watch_attempts;
create trigger watch_attempt_insert_guard before insert on taking_the_watch_attempts
  for each row execute function guard_watch_attempt_insert();

-- While an attempt is open, the talent writes their answer and nothing else
-- on a task: never the prompt, never the submitted stamp.
create or replace function guard_watch_task_edit() returns trigger language plpgsql as $$
begin
  if acting_as_end_user() then
    if (to_jsonb(new) - 'response') is distinct from (to_jsonb(old) - 'response') then
      raise exception 'Only your answer can be changed here.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists watch_task_edit_guard on taking_the_watch_tasks;
create trigger watch_task_edit_guard before update on taking_the_watch_tasks
  for each row execute function guard_watch_task_edit();


-- ---------- 7. S11: payout details ----------
-- "own payout details" let a talent change where the money goes without
-- clearing Relève's confirmation of the old details, and write
-- tax_form_on_file about themselves. Now, for anyone who is not Relève:
-- changing any detail that decides where money lands clears the
-- confirmation, a confirmation cannot be set, and the tax-form fields keep
-- whatever Relève last recorded. No longer security definer: it needs only
-- is_admin(), which is one itself.
create or replace function guard_payout() returns trigger language plpgsql as $$
begin
  -- Only a person's own session is held back. The service role, an admin, and
  -- the database owner (the SQL editor, scripts) are Relève.
  if current_user in ('anon', 'authenticated') and not is_team_or_service() then
    if tg_op = 'INSERT' then
      new.confirmed_at       := null;
      new.confirmed_by       := null;
      new.tax_form_on_file   := false;
      new.tax_form_signed_on := null;
    else
      new.talent_id := old.talent_id;
      if (new.method, new.beneficiary, new.country, new.currency, new.detail)
         is distinct from
         (old.method, old.beneficiary, old.country, old.currency, old.detail) then
        new.confirmed_at := null;
        new.confirmed_by := null;
      else
        new.confirmed_at := old.confirmed_at;
        new.confirmed_by := old.confirmed_by;
      end if;
      new.tax_form_on_file   := old.tax_form_on_file;
      new.tax_form_signed_on := old.tax_form_signed_on;
    end if;
  elsif new.confirmed_at is not null and new.confirmed_by is null then
    new.confirmed_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_payout_t on talent_payout;
create trigger guard_payout_t before insert or update on talent_payout
  for each row execute function guard_payout();

-- PART 36's audit trigger, corrected. It built its field list with
-- "changed_fields || 'method'", which Postgres reads as array || array and
-- rejects ('malformed array literal'), so EVERY change to a method,
-- beneficiary, country, currency or detail raised and rolled back: nobody,
-- talent or team, could update payout details once PART 36 ran. Same
-- behaviour otherwise; only the field names are logged, never the values.
create or replace function audit_talent_payout() returns trigger
language plpgsql security definer set search_path = public as $$
declare changed_fields text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform note_action('payout_details_set', 'talent_payout', new.talent_id,
      jsonb_build_object('event', 'first added', 'method', new.method));
    return new;
  end if;
  if new.method      is distinct from old.method      then changed_fields := array_append(changed_fields, 'method'::text); end if;
  if new.beneficiary is distinct from old.beneficiary then changed_fields := array_append(changed_fields, 'beneficiary'::text); end if;
  if new.country     is distinct from old.country     then changed_fields := array_append(changed_fields, 'country'::text); end if;
  if new.currency    is distinct from old.currency    then changed_fields := array_append(changed_fields, 'currency'::text); end if;
  if new.detail      is distinct from old.detail      then changed_fields := array_append(changed_fields, 'detail'::text); end if;
  if array_length(changed_fields, 1) > 0 then
    perform note_action('payout_details_changed', 'talent_payout', new.talent_id,
      jsonb_build_object('fields', to_jsonb(changed_fields), 'method', new.method));
  end if;
  return new;
end $$;


-- ---------- 8. S7: share_work answers only about yourself ----------
-- Callable by anyone, it answered "do these two people work together?" for
-- any pair of ids. Every policy that uses it passes auth.uid() as one side,
-- so it now answers only when one side is the caller (or the caller is
-- Relève). Grants are left alone on purpose: profile and avatar policies
-- call it for every reader, anonymous ones included, and revoking execute
-- would turn their empty result into an error.
create or replace function share_work(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is not null and (a = auth.uid() or b = auth.uid()) or is_admin())
     and (
       a = b
       or exists (select 1 from placements p
                   where (p.client_id = a and p.talent_id = b)
                      or (p.client_id = b and p.talent_id = a))
       or exists (select 1 from matches m
                   where m.released
                     and ((m.client_id = a and m.talent_id = b)
                       or (m.client_id = b and m.talent_id = a)))
     );
$$;


-- ---------- 9. S3, S4, S7: who may call which function ----------
-- Supabase grants EXECUTE on every new public function to anon and
-- authenticated by default, so "revoke ... from public" alone never took
-- anything away. Each grant below is explicit.
do $$
declare f text;
begin
  -- Server-side only: the service role (and the owner, e.g. scripts/backup.sh
  -- over SUPABASE_DB_URL) may call these. Nobody's browser session may.
  --   pulse_due    leaked every live placement and client id to anon (S3)
  --   log_email    let anyone write into the log the console trusts (S4)
  --   log_backup   let anyone report a successful backup (S4)
  --   apply_allowed took a caller-chosen IP, so the limiter was optional (S4)
  --   note_action  let anyone forge an audit-trail entry; only definer
  --                triggers call it, and they run as the owner
  foreach f in array array[
    'pulse_due(date)',
    'log_email(text,text,text,boolean,text)',
    'log_backup(boolean,bigint,text)',
    'apply_allowed(text,text)',
    'note_action(text,text,uuid,jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;

  -- Signed-in people only, never anonymous. Each of these checks the
  -- caller's own id inside, or is needed by a trigger an admin fires.
  foreach f in array array[
    'team_emails()',
    'choose_role(user_role)',
    'mark_feedback_seen(uuid)',
    'my_placement_pay()',
    'answer_offer(uuid,text)',
    'place_from_offer(uuid)',
    'mark_placement_reveal_seen(uuid,text)',
    'submit_watch_attempt(uuid)',
    'is_vetted(uuid)',
    'my_auth_email()',
    'team_promote(text,text)',
    'team_set_role(uuid,text)',
    'team_remove(uuid)',
    'team_cancel_invite(uuid)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;

  -- Helpers used only inside other definer functions and triggers.
  foreach f in array array[
    'is_owner_id(uuid)',
    'owners_besides(uuid)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
end $$;

-- For the record, left callable by everyone on purpose: is_admin(),
-- is_owner(), in_placement(uuid), share_work(uuid,uuid) and
-- is_team_or_service() are evaluated inside row level security policies for
-- every reader, and each answers only about the caller. Trigger functions
-- cannot be called through the API at all.

do $$ begin raise notice 'PART 39 (Lane A) applied: profile insert guard, claim on verified email, owner-managed team, locked agreements, server-only applications, interview and Watch guards, payout guard, function grants.'; end $$;


-- >>>>>>>>>> part39-billing.sql
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


-- >>>>>>>>>> part39-experience.sql
-- ============================================================
-- PART 39 (Lane C) — the client, talent and admin experience
-- (2 Oct 2026; safe to run on top of everything above, and safe to re-run)
--
--   1. Message read state, per person per thread, and an unread tally
--   2. Client <-> talent threads, listed for the console (read-only there)
--   3. Who looks after me: the named Success Manager, readable by the client
--      and the talent on that placement without opening profiles to them
--   4. Tasks: a status beyond done, guarded edits, and comments / questions
--   5. The talent's daily log (private), with highlights they choose to share
--   6. The executive's briefing for their talent (tools, access, preferences)
--   7. Client requests: a replacement, a pause, a quarterly review
--   8. Bookkeeping for the two new scheduled jobs (report and reminders)
--
-- Nothing here touches billing, invoices, profiles insert, storage,
-- interviews' own policies, Taking The Watch or applications.
-- ============================================================

-- ---------- 1. message read state ----------
-- read_at on messages is the TEAM's flag (set when the console opens a thread)
-- and only an admin may update a message row (PART 23). A client or talent
-- reading their own thread needs somewhere of their own to record it, which
-- is this: one row per person per thread, holding the last moment they read.
-- thread is 'subject:<uuid>' for a person's line to their Success Manager and
-- 'placement:<uuid>' for the direct line between a client and their talent.
create table if not exists message_reads (
  user_id      uuid not null references profiles(id) on delete cascade,
  thread       text not null check (thread ~ '^(subject|placement):[0-9a-f-]{36}$'),
  last_read_at timestamptz not null default now(),
  primary key (user_id, thread)
);
alter table message_reads enable row level security;
drop policy if exists "own read state" on message_reads;
create policy "own read state" on message_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Everything already in a thread on the day this ships counts as read, so
-- nobody opens their account to a badge for a conversation they finished
-- weeks ago.
insert into message_reads (user_id, thread, last_read_at)
select distinct m.subject_id, 'subject:' || m.subject_id::text, now()
  from messages m
 where m.subject_id is not null
on conflict (user_id, thread) do nothing;

insert into message_reads (user_id, thread, last_read_at)
select distinct x.uid, 'placement:' || x.pid::text, now()
  from (
    select p.client_id as uid, p.id as pid from placements p
     where exists (select 1 from messages m where m.placement_id = p.id)
    union
    select p.talent_id, p.id from placements p
     where exists (select 1 from messages m where m.placement_id = p.id)
  ) x
on conflict (user_id, thread) do nothing;

-- Unread messages per thread for whoever is signed in. Deliberately NOT
-- security definer: it runs as the caller, so row level security on messages
-- decides what is counted, exactly as a plain select would. Only live
-- placements count, because ended ones no longer have a tab to clear them.
create or replace function my_unread()
returns table (thread text, unread int)
language sql stable as $$
  select t.thread, count(*)::int
  from (
    select case when m.placement_id is null
                then 'subject:' || m.subject_id::text
                else 'placement:' || m.placement_id::text end as thread,
           m.created_at, m.sender_id
      from messages m
     where m.subject_id = auth.uid()
        or (m.placement_id is not null and exists (
              select 1 from placements p
               where p.id = m.placement_id and p.ended_on is null
                 and (p.client_id = auth.uid() or p.talent_id = auth.uid())))
  ) t
  left join message_reads r on r.user_id = auth.uid() and r.thread = t.thread
  where t.sender_id <> auth.uid()
    and t.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by t.thread;
$$;
revoke execute on function my_unread() from public, anon;
grant execute on function my_unread() to authenticated;

-- ---------- 2. client <-> talent threads, for the console ----------
-- message_threads() (PART 23) lists only the Success Manager lines. The
-- direct lines between a client and their talent were invisible to Relève
-- unless somebody opened the placement. One row per placement thread, run as
-- the caller (an admin sees all; anyone else only their own).
create or replace function placement_threads()
returns table (placement_id uuid, last text, last_at timestamptz, total int, last_sender uuid)
language sql stable as $$
  select m.placement_id,
         (array_agg(m.body order by m.created_at desc))[1],
         max(m.created_at),
         count(*)::int,
         (array_agg(m.sender_id order by m.created_at desc))[1]
    from messages m
   where m.placement_id is not null
   group by m.placement_id;
$$;
revoke execute on function placement_threads() from public, anon;
grant execute on function placement_threads() to authenticated;

-- ---------- 3. the named Success Manager ----------
-- A client cannot read another profile row, so "Your Success Manager" had to
-- stay anonymous. This returns just the name, and whether there is a photo,
-- of the manager assigned to each of the caller's own live placements: the
-- CSM for the executive, the TSM for the talent. Nothing else about the
-- manager leaves the database here (no email, no role detail).
create or replace function my_managers()
returns table (placement_id uuid, side text, manager_id uuid, manager_name text, has_photo boolean)
language sql stable security definer set search_path = public as $$
  select p.id, 'client'::text, p.csm_id, pr.full_name, pr.photo_url is not null
    from placements p join profiles pr on pr.id = p.csm_id
   where p.client_id = auth.uid() and p.ended_on is null
  union all
  select p.id, 'talent'::text, p.tsm_id, pr.full_name, pr.photo_url is not null
    from placements p join profiles pr on pr.id = p.tsm_id
   where p.talent_id = auth.uid() and p.ended_on is null;
$$;
revoke execute on function my_managers() from public, anon;
grant execute on function my_managers() to authenticated;

-- ---------- 4. tasks: status, guarded edits, comments ----------
alter table tasks add column if not exists status text not null default 'todo';
do $$ begin
  alter table tasks add constraint tasks_status_chk
    check (status in ('todo', 'in_progress', 'waiting', 'done'));
exception when duplicate_object then null; end $$;
update tasks set status = 'done' where done and status <> 'done';
update tasks set status = 'todo' where not done and status = 'done';

-- done stays the column everything else reads (the console, alerts, reports),
-- so status and done are kept in step here rather than in every caller.
create or replace function sync_task_status() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.done then new.status := 'done';
    elsif new.status = 'done' then new.done := true;
    end if;
  else
    if new.status is distinct from old.status then
      new.done := (new.status = 'done');
    elsif new.done is distinct from old.done then
      new.status := case when new.done then 'done'
                         when old.status = 'done' then 'todo'
                         else old.status end;
    end if;
    new.updated_at := now();
  end if;
  if new.done then
    new.done_at := coalesce(new.done_at, now());
    new.done_by := coalesce(new.done_by, auth.uid());
  else
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end $$;
drop trigger if exists sync_task_status_t on tasks;
create trigger sync_task_status_t before insert or update on tasks
for each row execute function sync_task_status();

-- Either side may move a task along (status, done). Rewriting what a task
-- says (title, detail, priority, due date) belongs to whoever wrote it, the
-- executive on that placement, or Relève. Without this, the update policy let
-- the talent quietly change the words of something they were asked to do.
create or replace function guard_task_edit() returns trigger language plpgsql as $$
begin
  if (new.title, coalesce(new.detail, ''), new.priority, coalesce(new.due_on, 'infinity'::date))
     is distinct from
     (old.title, coalesce(old.detail, ''), old.priority, coalesce(old.due_on, 'infinity'::date)) then
    if not (is_team_or_service()
            or old.created_by = auth.uid()
            or exists (select 1 from placements p
                        where p.id = old.placement_id and p.client_id = auth.uid())) then
      raise exception 'Only the person who added this task, or the executive, can change what it says.';
    end if;
  end if;
  if new.placement_id is distinct from old.placement_id or new.created_by is distinct from old.created_by then
    if not is_team_or_service() then
      raise exception 'A task cannot be moved to another placement.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_task_edit_t on tasks;
create trigger guard_task_edit_t before update on tasks
for each row execute function guard_task_edit();

create table if not exists task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  author_id   uuid not null references profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  is_question boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists task_comments_task_idx on task_comments (task_id, created_at);
alter table task_comments enable row level security;

drop policy if exists "read task comments" on task_comments;
create policy "read task comments" on task_comments for select
  using (is_admin() or exists (
    select 1 from tasks t where t.id = task_comments.task_id and in_placement(t.placement_id)));

drop policy if exists "write task comments" on task_comments;
create policy "write task comments" on task_comments for insert
  with check (author_id = auth.uid() and (is_admin() or exists (
    select 1 from tasks t where t.id = task_comments.task_id and in_placement(t.placement_id))));

drop policy if exists "remove own task comments" on task_comments;
create policy "remove own task comments" on task_comments for delete
  using (author_id = auth.uid() or is_admin());

-- ---------- 5. the talent's daily log ----------
-- What got done, hours, and blockers: private to the talent and Relève, the
-- same promise the weekly check-in makes. The executive sees only the
-- highlight the talent chooses to share (and the hours, for the month's
-- report), through placement_month_log() below, never this table.
create table if not exists talent_logs (
  id              uuid primary key default gen_random_uuid(),
  placement_id    uuid not null references placements(id) on delete cascade,
  talent_id       uuid not null references profiles(id) on delete cascade,
  log_date        date not null,
  done_text       text check (done_text is null or char_length(done_text) <= 4000),
  hours           numeric(4,2) check (hours is null or (hours >= 0 and hours <= 24)),
  blockers        text check (blockers is null or char_length(blockers) <= 2000),
  highlight       text check (highlight is null or char_length(highlight) <= 600),
  share_highlight boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (placement_id, log_date)
);
create index if not exists talent_logs_talent_idx on talent_logs (talent_id, log_date desc);
alter table talent_logs enable row level security;

drop policy if exists "talent reads own log" on talent_logs;
create policy "talent reads own log" on talent_logs for select
  using (talent_id = auth.uid() or is_admin());

drop policy if exists "talent writes own log" on talent_logs;
create policy "talent writes own log" on talent_logs for insert
  with check (talent_id = auth.uid() and exists (
    select 1 from placements p
     where p.id = talent_logs.placement_id and p.talent_id = auth.uid() and p.ended_on is null));

drop policy if exists "talent updates own log" on talent_logs;
create policy "talent updates own log" on talent_logs for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid() and exists (
    select 1 from placements p
     where p.id = talent_logs.placement_id and p.talent_id = auth.uid()));

drop policy if exists "talent removes own log" on talent_logs;
create policy "talent removes own log" on talent_logs for delete
  using (talent_id = auth.uid());

-- One month of a placement's log, as the executive may see it: the day, the
-- hours, and the highlight only where the talent chose to share it. What got
-- done in full and the blockers never leave through here.
create or replace function placement_month_log(p_placement uuid, p_month date)
returns table (log_date date, hours numeric, highlight text)
language sql stable security definer set search_path = public as $$
  select l.log_date, l.hours,
         case when l.share_highlight then nullif(btrim(l.highlight), '') end
    from talent_logs l
    join placements p on p.id = l.placement_id
   where l.placement_id = p_placement
     and l.log_date >= date_trunc('month', p_month)::date
     and l.log_date <  (date_trunc('month', p_month) + interval '1 month')::date
     and (p.client_id = auth.uid() or p.talent_id = auth.uid() or is_team_or_service())
   order by l.log_date;
$$;
revoke execute on function placement_month_log(uuid, date) from public, anon;
grant execute on function placement_month_log(uuid, date) to authenticated, service_role;

-- ---------- 6. the executive's briefing for their talent ----------
create table if not exists talent_briefs (
  placement_id uuid primary key references placements(id) on delete cascade,
  tools        text check (tools is null or char_length(tools) <= 4000),
  access       text check (access is null or char_length(access) <= 4000),
  preferences  text check (preferences is null or char_length(preferences) <= 4000),
  rhythm       text check (rhythm is null or char_length(rhythm) <= 4000),
  ask_first    text check (ask_first is null or char_length(ask_first) <= 4000),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references profiles(id) on delete set null
);
alter table talent_briefs enable row level security;

drop policy if exists "placement reads brief" on talent_briefs;
create policy "placement reads brief" on talent_briefs for select
  using (is_admin() or in_placement(placement_id));

drop policy if exists "executive or team writes brief" on talent_briefs;
create policy "executive or team writes brief" on talent_briefs for insert
  with check (is_admin() or exists (
    select 1 from placements p where p.id = talent_briefs.placement_id and p.client_id = auth.uid()));

drop policy if exists "executive or team edits brief" on talent_briefs;
create policy "executive or team edits brief" on talent_briefs for update
  using (is_admin() or exists (
    select 1 from placements p where p.id = talent_briefs.placement_id and p.client_id = auth.uid()))
  with check (is_admin() or exists (
    select 1 from placements p where p.id = talent_briefs.placement_id and p.client_id = auth.uid()));

-- ---------- 7. client requests ----------
-- Asking for a replacement, a pause, or a quarterly review used to mean
-- writing a message and hoping it was read as a request. Each is now a row
-- the console's Care page lists with a clear next action.
create table if not exists client_requests (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  client_id    uuid not null references profiles(id) on delete cascade,
  kind         text not null check (kind in ('replacement', 'pause', 'quarterly_review')),
  note         text check (note is null or char_length(note) <= 4000),
  preferred    text check (preferred is null or char_length(preferred) <= 400),
  pause_from   date,
  pause_until  date,
  state        text not null default 'open' check (state in ('open', 'in_hand', 'done', 'declined')),
  outcome      text check (outcome is null or char_length(outcome) <= 2000),
  created_at   timestamptz not null default now(),
  handled_at   timestamptz,
  handled_by   uuid references profiles(id) on delete set null,
  check (pause_until is null or pause_from is null or pause_until >= pause_from)
);
create index if not exists client_requests_open_idx on client_requests (state, created_at desc);
alter table client_requests enable row level security;

drop policy if exists "client reads own requests" on client_requests;
create policy "client reads own requests" on client_requests for select
  using (client_id = auth.uid() or is_admin());

drop policy if exists "client makes a request" on client_requests;
create policy "client makes a request" on client_requests for insert
  with check (
    is_admin() or (
      client_id = auth.uid() and state = 'open' and handled_at is null and handled_by is null
      and exists (select 1 from placements p
                   where p.id = client_requests.placement_id
                     and p.client_id = auth.uid() and p.ended_on is null)));

drop policy if exists "team handles requests" on client_requests;
create policy "team handles requests" on client_requests for update
  using (is_admin()) with check (is_admin());

-- ---------- 8. bookkeeping for the scheduled jobs ----------
-- Both jobs run with the service role (which passes row level security), so
-- these exist only to make each send happen once. The team may read them.
create table if not exists report_sends (
  placement_id uuid not null references placements(id) on delete cascade,
  month_of     date not null,
  sent_at      timestamptz not null default now(),
  primary key (placement_id, month_of)
);
alter table report_sends enable row level security;
drop policy if exists "team reads report sends" on report_sends;
create policy "team reads report sends" on report_sends for select using (is_admin());

create table if not exists interview_reminders (
  interview_id uuid not null references interviews(id) on delete cascade,
  kind         text not null check (kind in ('24h', '1h')),
  sent_at      timestamptz not null default now(),
  primary key (interview_id, kind)
);
alter table interview_reminders enable row level security;
drop policy if exists "team reads interview reminders" on interview_reminders;
create policy "team reads interview reminders" on interview_reminders for select using (is_admin());

do $$ begin raise notice 'PART 39 (experience) applied: read state, named managers, task status and comments, daily log, executive briefing, client requests, report and reminder bookkeeping.'; end $$;

