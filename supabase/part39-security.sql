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
