-- PART 25 — applying now asks for a resume, a year of experience, and
-- both halves of English, instead of leaving them optional
-- (safe to run on top of everything above)
-- ============================================================

-- Enforcement itself lives in app/api/apply/route.ts (a resume is required,
-- years must be >= 1) — these columns already existed and were already
-- nullable, so nothing here needs to change for those two. English is new:
-- two self-rated fields, same three tiers a talent profile already uses
-- (see the "english" column on profiles), so the wording an applicant
-- chooses at the door and what shows on their profile later never disagree.
alter table job_applications add column if not exists english_speaking text;
alter table job_applications add column if not exists english_writing text;

do $$ begin
  alter table job_applications add constraint job_applications_speaking_chk
    check (english_speaking is null or english_speaking in ('Native-fluent','Fluent','Conversational'));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table job_applications add constraint job_applications_writing_chk
    check (english_writing is null or english_writing in ('Native-fluent','Fluent','Conversational'));
exception when duplicate_object then null;
end $$;

-- ============================================================
-- PART 26 — a general application, for anyone who doesn't see a role
-- that fits, goes into the app instead of vanishing into a separate
-- form nobody sees
-- (safe to run on top of everything above)
-- ============================================================

-- job_applications.post_id was already nullable (on delete set null, for a
-- posting later removed) — what changed is the INSERT policy, which until
-- now required a post_id pointing at a real open posting no matter what.
-- A general application has no posting to point at by design, so this adds
-- that as a second valid shape rather than loosening the first one: a real
-- application still needs a real open posting, or else post_id is null.
drop policy if exists "anyone may apply" on job_applications;
create policy "anyone may apply" on job_applications for insert
  with check (
    (
      (post_id is not null and exists (select 1 from job_posts p where p.id = post_id and p.state = 'open'))
      or post_id is null
    )
    and length(coalesce(full_name, '')) between 2 and 120
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and length(coalesce(note, '')) <= 4000
  );

-- ============================================================
-- PART 27 — the onboarding plan runs ninety days, not two weeks,
-- and talent can show an executive their own introduction video
-- (safe to run on top of everything above)
-- ============================================================

-- ---------- talent introduce themselves on video, in their own voice ----------
-- Uploaded from their own device. Unlike a photo there is no safe way to
-- re-encode a video in the browser, so this stores whatever they send,
-- capped in size rather than reprocessed.
alter table profiles add column if not exists intro_video_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('intros', 'intros', false, 41943040, array['video/mp4','video/quicktime','video/webm'])
on conflict (id) do update
  set public = false, file_size_limit = 41943040,
      allowed_mime_types = array['video/mp4','video/quicktime','video/webm'];

-- Same rule as a photo: the owner, the Relève team, and whoever the owner
-- actually works with (a placement, or a released match) can see it.
drop policy if exists "intros for people who work together" on storage.objects;
create policy "intros for people who work together" on storage.objects for select
  using (
    bucket_id = 'intros'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_admin()
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
        and share_work(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  );
drop policy if exists "own intro upload" on storage.objects;
create policy "own intro upload" on storage.objects for insert
  with check (bucket_id = 'intros' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own intro replace" on storage.objects;
create policy "own intro replace" on storage.objects for update
  using  (bucket_id = 'intros' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'intros' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own intro delete" on storage.objects;
create policy "own intro delete" on storage.objects for delete
  using (bucket_id = 'intros' and (storage.foldername(name))[1] = auth.uid()::text);

-- The shortlist the client sees now carries the video through too.
drop view if exists talent_directory;
create view talent_directory with (security_invoker = true) as
select
  p.id, p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.stage, p.photo_url, p.intro_video_url,
  s.scores, s.facets, s.validity, s.confidence, s.conditions as cond
from profiles p
join signatures s on s.user_id = p.id and s.side = 'talent'
where p.role = 'talent';

-- ---------- the plan runs to ninety days, not fourteen ----------
-- The first fortnight was the whole plan. It should have been the opening
-- act: what gets someone through week one is not what tells you, three
-- months in, whether the placement actually worked. Thirty, sixty and
-- ninety days added as the same kind of row as everything before them —
-- dated, owned by a side, ticked by the console — so nothing new had to be
-- built to hold them, and the dashboard's own day-count already takes the
-- latest day in the list, so it extends to ninety with no code change there.
create or replace function plan_first_fortnight() returns trigger language plpgsql security definer as $$
begin
  insert into onboarding_steps (placement_id, day, title, detail, whose, sort) values
    (new.id, 0,  'Kick-off call',
     'Thirty minutes, both sides. Introductions, working hours, and how you each prefer to be reached.', 'both', 1),
    (new.id, 0,  'Share the tools',
     'Email, calendar, and whatever else they need on day one. Access is the most common reason a first week stalls.', 'client', 2),
    (new.id, 1,  'Agree the working rhythm',
     'Which hours overlap, when the daily check-in happens, and what counts as urgent.', 'both', 3),
    (new.id, 2,  'First three tasks assigned',
     'Small and finishable. The point of week one is a completed thing, not a big thing.', 'client', 4),
    (new.id, 3,  'Write down what is never delegated',
     'The things the executive keeps. Saying it once prevents a month of hesitation.', 'client', 5),
    (new.id, 5,  'End of week one: what worked',
     'Fifteen minutes. What was clear, what was not, what to change on Monday.', 'both', 6),
    (new.id, 8,  'Take over one recurring thing',
     'A standing meeting, the inbox triage, the weekly report. Something that repeats.', 'talent', 7),
    (new.id, 10, 'Talent files their first weekly check-in',
     'The Friday check-in, done properly once, sets the habit.', 'talent', 8),
    (new.id, 14, 'Two-week review with Relève',
     'Your Client Success Manager joins. Course-correct now rather than at month three.', 'both', 9),
    (new.id, 30, 'Thirty-day check-in',
     'A short call with your Client Success Manager. What has become routine, what still needs you, and whether the scope from day one still fits.', 'both', 10),
    (new.id, 60, 'Sixty-day review',
     'Longer than the first one. Scope gets adjusted here if it needs to, before it hardens into just how things are.', 'both', 11),
    (new.id, 90, 'Ninety-day outcome',
     'You tell us how it has gone. The checkpoint that closes out onboarding and records whether the match delivered what the Signature predicted.', 'client', 12);
  return new;
end $$;

-- Placements from before today only got the first nine rows. Give them the
-- other three now, the same way the trigger would have. Guarded on day 90
-- specifically, so running this again changes nothing.
insert into onboarding_steps (placement_id, day, title, detail, whose, sort)
select p.id, 30, 'Thirty-day check-in',
   'A short call with your Client Success Manager. What has become routine, what still needs you, and whether the scope from day one still fits.', 'both', 10
from placements p
where p.ended_on is null
  and not exists (
    select 1 from onboarding_steps os where os.placement_id = p.id and os.day = 90
  );

insert into onboarding_steps (placement_id, day, title, detail, whose, sort)
select p.id, 60, 'Sixty-day review',
   'Longer than the first one. Scope gets adjusted here if it needs to, before it settles into how things are.', 'both', 11
from placements p
where p.ended_on is null
  and not exists (
    select 1 from onboarding_steps os where os.placement_id = p.id and os.day = 90
  );

insert into onboarding_steps (placement_id, day, title, detail, whose, sort)
select p.id, 90, 'Ninety-day outcome',
   'You tell us how it has gone. The checkpoint that closes out onboarding and records whether the match delivered what the Signature predicted.', 'client', 12
from placements p
where p.ended_on is null
  and not exists (
    select 1 from onboarding_steps os where os.placement_id = p.id and os.day = 90
  );

-- ============================================================
-- PLACEMENT REVEAL, 10 Sept 2026
--
-- The full-page "Consider it handled!" screen shown once to EACH side —
-- talent and client — the first time they sign in after a placement is
-- confirmed. Two independent flags rather than one, since either side can
-- sign in first and each gets exactly one showing of their own. Both
-- default TRUE so everybody already working is left alone — both places
-- that actually create a placement set both FALSE explicitly for a new one.
-- ============================================================

alter table placements add column if not exists talent_reveal_seen boolean not null default true;
alter table placements add column if not exists client_reveal_seen boolean not null default true;
comment on column placements.talent_reveal_seen is
  'False only for a placement just created, until the TALENT has seen the reveal screen. Existing placements default true so nobody sees it retroactively.';
comment on column placements.client_reveal_seen is
  'False only for a placement just created, until the CLIENT (executive) has seen the reveal screen. Existing placements default true so nobody sees it retroactively.';

-- Re-declared so a new placement made through an accepted offer starts
-- unrevealed on both sides. The admin's manual placement path
-- (createPlacement, in lib/work.ts) sets the same two columns explicitly.
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

  insert into placement_terms (placement_id, rate_month_cents, minimum_months)
  values (pid, o.rate_month_cents, o.minimum_months)
  on conflict (placement_id) do update
    set rate_month_cents = excluded.rate_month_cents,
        minimum_months   = excluded.minimum_months;

  if o.talent_pay_cents is not null then
    insert into talent_pay (talent_id, rate_month) values (o.talent_id, o.talent_pay_cents / 100)
    on conflict (talent_id) do update set rate_month = excluded.rate_month;
  end if;

  update offers set placement_id = pid where id = offer;
  update profiles set stage = 'Placed' where id = o.talent_id;
  perform note_action('placed_from_offer', 'offers', offer,
    jsonb_build_object('placement_id', pid, 'client_id', o.client_id, 'talent_id', o.talent_id));
  return pid;
end $$;

-- The one write either side is allowed to make to their own placements row —
-- everything else on the table stays admin-only (see "team writes
-- placements" above). security definer, but the caller's own id is checked
-- against the right column for the side they claim before anything is
-- touched, so nobody can mark the other side's — or someone else's —
-- placement seen.
create or replace function mark_placement_reveal_seen(placement uuid, side text)
returns void language plpgsql security definer as $$
begin
  if side = 'talent' then
    update placements set talent_reveal_seen = true where id = placement and talent_id = auth.uid();
  elsif side = 'client' then
    update placements set client_reveal_seen = true where id = placement and client_id = auth.uid();
  else
    raise exception 'side must be talent or client';
  end if;
end $$;

-- ============================================================
-- TAKING THE WATCH, 10 Sept 2026
--
-- A live, scored simulation of a real day of work, taken once at intake,
-- before a talent is eligible to be matched to any client. Sits alongside
-- the Signature and the Discipline Breakdown as the third intake instrument
-- — the only one that is observed rather than self-reported or reported by
-- the executive. Tables already created directly against this project on
-- 10 Sept 2026; re-declared here with `if not exists` so schema.sql stays
-- the true record and a fresh run of this file does not fail or duplicate.
-- ============================================================

create table if not exists taking_the_watch_attempts (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references profiles(id) on delete cascade,
  discipline text not null,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  time_limit_minutes int not null default 180,
  created_at timestamptz not null default now()
);

create table if not exists taking_the_watch_tasks (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references taking_the_watch_attempts(id) on delete cascade,
  task_key text not null,
  prompt text not null,
  response text,
  submitted_at timestamptz
);

create table if not exists taking_the_watch_scores (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references taking_the_watch_attempts(id) on delete cascade unique,
  accuracy int check (accuracy between 0 and 100),
  judgment int check (judgment between 0 and 100),
  communication int check (communication between 0 and 100),
  time_management int check (time_management between 0 and 100),
  overall_result text not null default 'pending',
  reviewer_id uuid references profiles(id),
  reviewer_notes text,
  talent_feedback text,
  scored_at timestamptz
);

create or replace view talent_verification_badges as
select
  a.talent_id,
  bool_or(s.overall_result = 'cleared') as verified_through_taking_the_watch
from taking_the_watch_attempts a
join taking_the_watch_scores s on s.attempt_id = a.id
group by a.talent_id;

-- one live attempt per talent per discipline at a time — starting a second
-- one before the first is scored is a re-take, which only happens after a
-- TSM decision, never by just clicking start twice
create unique index if not exists watch_one_open_attempt_per_discipline
  on taking_the_watch_attempts(talent_id, discipline)
  where status in ('in_progress', 'submitted');

alter table taking_the_watch_attempts enable row level security;
alter table taking_the_watch_tasks    enable row level security;
alter table taking_the_watch_scores   enable row level security;

-- Unlike "own attempts" on signature_attempts (a free-form upsert), a
-- timed assessment cannot let the talent rewrite it after the fact — so
-- reading their own attempt is always allowed, but writing to it is only
-- allowed while it is still in_progress. The actual transition to
-- 'submitted' goes through submit_watch_attempt() below, which is security
-- definer and does not depend on this policy at all — this just closes the
-- door on a raw update reopening or backdating a submitted attempt.
drop policy if exists "own watch attempts" on taking_the_watch_attempts;
create policy "own watch attempts read" on taking_the_watch_attempts for select
  using (talent_id = auth.uid() or is_admin());
create policy "own watch attempts insert" on taking_the_watch_attempts for insert
  with check (talent_id = auth.uid() or is_admin());
create policy "own watch attempts update while open" on taking_the_watch_attempts for update
  using ((talent_id = auth.uid() and status = 'in_progress') or is_admin())
  with check ((talent_id = auth.uid() and status = 'in_progress') or is_admin());

-- Tasks have no talent_id of their own — ownership runs through the attempt
-- they belong to. Same split as above: always readable, only writable while
-- the parent attempt is still open.
drop policy if exists "own watch tasks" on taking_the_watch_tasks;
create policy "own watch tasks read" on taking_the_watch_tasks for select
  using (
    is_admin() or exists (
      select 1 from taking_the_watch_attempts a
       where a.id = taking_the_watch_tasks.attempt_id and a.talent_id = auth.uid()
    )
  );
create policy "own watch tasks write while open" on taking_the_watch_tasks for all
  using (
    is_admin() or exists (
      select 1 from taking_the_watch_attempts a
       where a.id = taking_the_watch_tasks.attempt_id and a.talent_id = auth.uid() and a.status = 'in_progress'
    )
  )
  with check (
    is_admin() or exists (
      select 1 from taking_the_watch_attempts a
       where a.id = taking_the_watch_tasks.attempt_id and a.talent_id = auth.uid() and a.status = 'in_progress'
    )
  );

-- Scores are reviewer-written only — a talent can never insert or edit a
-- score. They can SELECT their own row (needed for my_watch_result below to
-- read through as security_invoker), but the app only ever queries that view,
-- which exposes overall_result and talent_feedback and nothing else — same
-- trust boundary already used for validity detail on the Signature, which
-- stays console-only by convention rather than by column-level grant.
drop policy if exists "team writes watch scores" on taking_the_watch_scores;
create policy "team writes watch scores" on taking_the_watch_scores for all
  using (is_admin())
  with check (is_admin());
drop policy if exists "talent reads own watch score" on taking_the_watch_scores;
create policy "talent reads own watch score" on taking_the_watch_scores for select
  using (
    is_admin() or exists (
      select 1 from taking_the_watch_attempts a
       where a.id = taking_the_watch_scores.attempt_id and a.talent_id = auth.uid()
    )
  );

-- What the talent is allowed to see about their own result: the plain
-- verdict and the feedback written for them, never the four rubric numbers
-- or the reviewer's internal notes.
drop view if exists my_watch_results;
create view my_watch_results with (security_invoker = true) as
select a.id as attempt_id, a.discipline, a.status, a.started_at, a.submitted_at,
       s.overall_result, s.talent_feedback, s.scored_at
from taking_the_watch_attempts a
left join taking_the_watch_scores s on s.attempt_id = a.id
where a.talent_id = auth.uid();

-- The console queue: every submitted attempt still waiting on a score.
drop view if exists watch_review_queue;
create view watch_review_queue with (security_invoker = true) as
select a.id as attempt_id, a.talent_id, a.discipline, a.started_at, a.submitted_at,
       a.time_limit_minutes, p.full_name as talent_name
from taking_the_watch_attempts a
join profiles p on p.id = a.talent_id
where a.status = 'submitted'
  and not exists (select 1 from taking_the_watch_scores s where s.attempt_id = a.id and s.scored_at is not null)
order by a.submitted_at asc;

-- The one write a talent is allowed to make on submit — flips status and
-- stamps submitted_at, and nothing else, checked server-side regardless
-- (see lib/watch.ts), but enforced here too so a raw call can't submit
-- someone else's attempt or resubmit one that already moved on.
create or replace function submit_watch_attempt(attempt uuid)
returns void language plpgsql security definer as $$
begin
  update taking_the_watch_attempts set status = 'submitted', submitted_at = now()
   where id = attempt and talent_id = auth.uid() and status = 'in_progress';

  -- Stamped here rather than by a second client call — the update above
  -- just closed the write-while-open window on the tasks table, so a
  -- follow-up call from the app would be refused by RLS. Only runs if the
  -- attempt above actually belonged to the caller.
  update taking_the_watch_tasks set submitted_at = now()
   where attempt_id = attempt and submitted_at is null
     and exists (
       select 1 from taking_the_watch_attempts a
        where a.id = attempt and a.talent_id = auth.uid()
     );
end $$;

-- ---------- the actual eligibility gate ----------
-- talent_directory already required a completed Signature before anyone
-- entered matching. Now it also requires a cleared Taking The Watch. A
-- talent claiming no discipline is not required to take one (there is
-- nothing generic to test), which matches the Discipline Breakdown being
-- what generates the task set in the first place.
drop view if exists talent_directory;
create view talent_directory as
select
  p.id, p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.stage, p.photo_url,
  s.scores, s.facets, s.validity, s.confidence, s.conditions as cond
from profiles p
join signatures s on s.user_id = p.id and s.side = 'talent'
where p.role = 'talent'
  and (
    -- claimed no discipline yet (Discipline Breakdown not done, or empty) —
    -- there is nothing to generate a task set from, so Taking The Watch is
    -- not required to enter matching. Once a discipline is claimed, this
    -- side flips false and the badge below becomes the only way in.
    coalesce((select jsonb_array_length(sp.disciplines) from skills_profile sp
               where sp.talent_id = p.id), 0) = 0
    or exists (select 1 from talent_verification_badges b
               where b.talent_id = p.id and b.verified_through_taking_the_watch)
  );
