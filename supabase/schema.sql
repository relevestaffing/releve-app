-- ============================================================
-- RELÈVE PLATFORM — database schema
-- Paste this whole file into the Supabase SQL editor and run it once.
-- ============================================================

-- ---------- people ----------
do $$ begin
  create type user_role as enum ('client', 'talent', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'talent',
  org_name    text,                       -- the company, for client accounts
  headline    text,                       -- "Chief of Staff / Sr. EA"
  location    text,
  timezone    text,
  years_exp   int,
  english     text,
  stage       text default 'Applied',     -- Applied | Screening | Vetted | Placed
  photo_url   text,
  created_at  timestamptz not null default now()
);
-- Talent pay used to live on profiles, protected only by a comment saying
-- client-facing views must not select it. It lives in talent_pay now, which
-- no client can read under any policy. See "Talent pay leaves profiles".

-- ---------- the Signature ----------
create table if not exists signatures (
  user_id    uuid not null references profiles(id) on delete cascade,
  side       text not null check (side in ('client','talent')),
  scores     jsonb not null,              -- the twelve axes
  facets     jsonb not null default '{}', -- eighteen facets (talent only)
  validity   jsonb not null,              -- verdict + the control measures
  confidence jsonb not null default '{}', -- per-trait band and level
  conditions jsonb,                       -- layer 3
  archetype  text,
  taken_at   timestamptz not null default now(),
  primary key (user_id, side)
);

-- raw answers, kept separately so a re-score is always possible
create table if not exists signature_attempts (
  user_id    uuid not null references profiles(id) on delete cascade,
  side       text not null check (side in ('client','talent')),
  answers    jsonb not null default '[]',
  pairs      jsonb not null default '[]',
  timings    jsonb not null default '[]',
  submitted  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, side)
);

-- ---------- searches, matches, placements ----------
create table if not exists searches (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references profiles(id) on delete cascade,
  role_title text not null,
  scope      text,
  hours      text,
  opened_at  date not null default current_date,
  target_at  date,
  stage      text not null default 'Sourcing',
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id          uuid primary key default gen_random_uuid(),
  search_id   uuid not null references searches(id) on delete cascade,
  talent_id   uuid not null references profiles(id) on delete cascade,
  overall     int not null,
  layer1      int, layer2 int,
  confidence  text,
  parts       jsonb,                      -- per-axis reasoning, as shown in the drawer
  conditions  jsonb,                      -- the conditions check
  released    boolean not null default false,   -- has the client been shown this candidate
  client_state text,                      -- shortlisted | passed | interviewing
  created_at  timestamptz not null default now(),
  unique (search_id, talent_id)
);

create table if not exists placements (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references profiles(id) on delete cascade,
  talent_id  uuid not null references profiles(id) on delete cascade,
  started_on date not null default current_date,
  ended_on   date,
  predicted_fit int,
  outcome_score int,                      -- scored at six months, feeds calibration
  retained   boolean,
  created_at timestamptz not null default now()
);

-- ---------- client-safe view of the bench ----------
-- Pay is deliberately absent. Client-facing code reads this, never `profiles`.
drop view if exists talent_directory;
create view talent_directory as
select
  p.id, p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.stage, p.photo_url,
  s.scores, s.facets, s.validity, s.confidence, s.conditions as cond
from profiles p
join signatures s on s.user_id = p.id and s.side = 'talent'
where p.role = 'talent';

-- ============================================================
-- ROW LEVEL SECURITY
-- Default deny. Every table below states exactly who may read what.
-- ============================================================
alter table profiles            enable row level security;
alter table signatures          enable row level security;
alter table signature_attempts  enable row level security;
alter table searches            enable row level security;
alter table matches             enable row level security;
alter table placements          enable row level security;

create or replace function is_admin() returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles: you see yourself; the Relève team sees everyone
drop policy if exists "read own profile" on profiles;
create policy "read own profile"   on profiles for select using (id = auth.uid() or is_admin());
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update using (id = auth.uid() or is_admin());
drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles for insert with check (id = auth.uid());

-- signatures: your own, always. Talent signatures are also readable by any
-- client who has been released a match for that person, and by the team.
drop policy if exists "read own signature" on signatures;
create policy "read own signature" on signatures for select using (
  user_id = auth.uid()
  or is_admin()
  or exists (
    select 1 from matches m
    join searches se on se.id = m.search_id
    where m.talent_id = signatures.user_id and m.released and se.client_id = auth.uid()
  )
);
drop policy if exists "write own signature" on signatures;
create policy "write own signature" on signatures for insert with check (user_id = auth.uid());
drop policy if exists "update own signature" on signatures;
create policy "update own signature" on signatures for update using (user_id = auth.uid());

-- raw answers: yours and the team's only. Never another account's.
drop policy if exists "own attempts" on signature_attempts;
create policy "own attempts" on signature_attempts for all
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid());

drop policy if exists "own searches" on searches;
create policy "own searches" on searches for all
  using (client_id = auth.uid() or is_admin())
  with check (client_id = auth.uid() or is_admin());

-- a client sees matches on their own searches, and only once released
drop policy if exists "read released matches" on matches;
create policy "read released matches" on matches for select using (
  is_admin()
  or exists (select 1 from searches se where se.id = matches.search_id and se.client_id = auth.uid() and matches.released)
  or talent_id = auth.uid()
);
drop policy if exists "team writes matches" on matches;
create policy "team writes matches" on matches for all using (is_admin()) with check (is_admin());

drop policy if exists "read own placements" on placements;
create policy "read own placements" on placements for select
  using (client_id = auth.uid() or talent_id = auth.uid() or is_admin());
drop policy if exists "team writes placements" on placements;
create policy "team writes placements" on placements for all using (is_admin()) with check (is_admin());

-- ---------- make yourself an admin ----------
-- Sign in once so your row exists, then run this with your own address:
--   update profiles set role = 'admin' where email = 'hello@relevestaffing.com';

-- ============================================================
-- PART 2 — people you add by hand, availability, interviews
-- (safe to run on top of the schema above)
-- ============================================================

-- match overrides: the engine ranks, the team decides
alter table matches add column if not exists manual boolean not null default false;
alter table matches add column if not exists client_id uuid references profiles(id) on delete cascade;
create index if not exists matches_client_idx on matches(client_id);

-- records the Relève team creates before the person has ever signed in
create table if not exists pending_people (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  role       user_role not null,
  full_name  text not null,
  org_name   text, headline text, location text, timezone text,
  years_exp  int, english text, rate_month int, stage text,
  claimed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table pending_people enable row level security;
drop policy if exists "team manages pending" on pending_people;
create policy "team manages pending" on pending_people for all using (is_admin()) with check (is_admin());

-- when someone signs in, attach whatever the team prepared for them
create or replace function claim_pending() returns trigger language plpgsql security definer as $$
declare p pending_people%rowtype;
begin
  select * into p from pending_people where lower(email) = lower(new.email) and claimed_by is null limit 1;
  if found then
    update profiles set
      role = p.role, full_name = coalesce(new.full_name, p.full_name), org_name = p.org_name,
      headline = p.headline, location = p.location, timezone = p.timezone,
      years_exp = p.years_exp, english = p.english,
      stage = coalesce(p.stage, profiles.stage)
    where id = new.id;
    -- pay goes to talent_pay, never onto the profile row
    if p.rate_month is not null then
      insert into talent_pay (talent_id, rate_month) values (new.id, p.rate_month)
      on conflict (talent_id) do update set rate_month = excluded.rate_month;
    end if;
    update pending_people set claimed_by = new.id where id = p.id;
  end if;
  return new;
end $$;
drop trigger if exists on_profile_created on profiles;
create trigger on_profile_created after insert on profiles
  for each row execute function claim_pending();

-- weekly recurring availability, in each person's own timezone
create table if not exists availability (
  user_id   uuid primary key references profiles(id) on delete cascade,
  timezone  text not null,
  windows   jsonb not null default '[]',      -- [{weekday, start_min, end_min}]
  updated_at timestamptz not null default now()
);
alter table availability enable row level security;
drop policy if exists "own availability" on availability;
create policy "own availability" on availability for all
  using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());
-- a client may read the availability of talent released to them
drop policy if exists "read released availability" on availability;
create policy "read released availability" on availability for select using (
  exists (select 1 from matches m where m.talent_id = availability.user_id
          and m.released and m.client_id = auth.uid())
);

create table if not exists interviews (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references profiles(id) on delete cascade,
  talent_id    uuid not null references profiles(id) on delete cascade,
  stage        text not null default 'First interview',
  starts_at    timestamptz not null,
  duration_min int not null default 45,
  status       text not null default 'Confirmed'
               check (status in ('Proposed','Confirmed','Declined','Completed','No-show','Cancelled')),
  meeting_url  text, meeting_id text, notes text,
  created_at   timestamptz not null default now()
);
alter table interviews enable row level security;
drop policy if exists "own interviews" on interviews;
create policy "own interviews" on interviews for select
  using (client_id = auth.uid() or talent_id = auth.uid() or is_admin());
drop policy if exists "client books" on interviews;
create policy "client books" on interviews for insert
  with check (client_id = auth.uid() or is_admin());
drop policy if exists "either side updates" on interviews;
create policy "either side updates" on interviews for update
  using (client_id = auth.uid() or talent_id = auth.uid() or is_admin());

-- names alongside the ids, so the app does not need three queries
drop view if exists interview_list;
create view interview_list as
  select i.*, c.full_name as client_name, t.full_name as talent_name
  from interviews i
  join profiles c on c.id = i.client_id
  join profiles t on t.id = i.talent_id;



-- ============================================================
-- PART 3 — optional Google Calendar free/busy
-- ============================================================
create table if not exists calendar_connections (
  user_id       uuid primary key references profiles(id) on delete cascade,
  refresh_token text not null,          -- Google refresh token. Server-side use only.
  email         text,
  connected_at  timestamptz not null default now(),
  last_error    text
);
alter table calendar_connections enable row level security;
-- deliberately narrow: only the person themselves, and never a client or the
-- team, can read the token. Nobody needs to see it but the server.
drop policy if exists "own calendar connection" on calendar_connections;
create policy "own calendar connection" on calendar_connections for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
comment on table calendar_connections is
  'Relève stores only a refresh token and reads only free/busy blocks — never event content.';


-- ============================================================
-- PART 4 — onboarding and self-managed talent profiles
-- ============================================================
alter table profiles add column if not exists bio          text;
alter table profiles add column if not exists skills       jsonb default '[]';
alter table profiles add column if not exists onboarded_at timestamptz;

-- talent may edit their own profile, but never their pay or their role.
create or replace function guard_profile_edit() returns trigger language plpgsql as $$
begin
  if auth.uid() = new.id and not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    new.role       := old.role;         -- nobody promotes themselves
    new.stage      := old.stage;        -- the team owns the pipeline stage
  end if;
  return new;
end $$;
drop trigger if exists profile_edit_guard on profiles;
create trigger profile_edit_guard before update on profiles
  for each row execute function guard_profile_edit();

-- the client-facing view picks up the new fields
drop view if exists talent_directory;
create or replace view talent_directory as
select
  p.id, p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.stage, p.photo_url, p.bio, p.skills,
  s.scores, s.facets, s.validity, s.confidence, s.conditions as cond
from profiles p
join signatures s on s.user_id = p.id and s.side = 'talent'
where p.role = 'talent';


-- ============================================================
-- PART 5 — the role brief
-- What the client is hiring for, recorded by the Relève team from the
-- intro call. A client is never asked to fill in a form about their own
-- search — but they can see what we wrote down, and correct it with their CSM.
-- ============================================================
alter table searches add column if not exists tools      text;
alter table searches add column if not exists pending_id uuid references pending_people(id) on delete cascade;
alter table searches alter column client_id drop not null;
alter table searches add column if not exists updated_at timestamptz not null default now();

-- exactly one of the two keys, never both, never neither
alter table searches drop constraint if exists searches_one_owner;
alter table searches add constraint searches_one_owner
  check ((client_id is null) <> (pending_id is null));

create unique index if not exists searches_client_uniq  on searches(client_id)  where client_id  is not null;
create unique index if not exists searches_pending_uniq on searches(pending_id) where pending_id is not null;

-- the client reads their own brief; only the team writes one
drop policy if exists "own searches" on searches;
drop policy if exists "read own search" on searches;
create policy "read own search"   on searches for select using (client_id = auth.uid() or is_admin());
drop policy if exists "team writes search" on searches;
create policy "team writes search" on searches for all    using (is_admin()) with check (is_admin());

-- when a client signs in, the brief written before their account existed
-- moves across to it, exactly like the rest of their record
create or replace function claim_pending() returns trigger language plpgsql security definer as $$
declare p pending_people%rowtype;
begin
  select * into p from pending_people where lower(email) = lower(new.email) and claimed_by is null limit 1;
  if found then
    update profiles set
      role = p.role, full_name = coalesce(new.full_name, p.full_name), org_name = p.org_name,
      headline = p.headline, location = p.location, timezone = p.timezone,
      years_exp = p.years_exp, english = p.english,
      stage = coalesce(p.stage, profiles.stage)
    where id = new.id;
    update searches set client_id = new.id, pending_id = null where pending_id = p.id;
    -- pay goes to talent_pay, never onto the profile row
    if p.rate_month is not null then
      insert into talent_pay (talent_id, rate_month) values (new.id, p.rate_month)
      on conflict (talent_id) do update set rate_month = excluded.rate_month;
    end if;
    update pending_people set claimed_by = new.id where id = p.id;
  end if;
  return new;
end $$;


-- ============================================================
-- PART 6 — which side are you on, and photo uploads
-- ============================================================

-- A new account picks executive or talent on first run. Anyone Relève added
-- by hand is never asked — their side came with the record.
alter table profiles add column if not exists role_chosen_at    timestamptz;
alter table profiles add column if not exists assigned_by_releve boolean not null default false;

-- picking a side works exactly once, and only for an account that has not
-- been assigned one. Nothing else can move an account between sides.
create or replace function choose_role(wanted user_role)
returns void language plpgsql security definer as $$
begin
  if wanted not in ('client', 'talent') then
    raise exception 'that is not a side';
  end if;
  update profiles
     set role = wanted, role_chosen_at = now()
   where id = auth.uid()
     and role_chosen_at is null
     and assigned_by_releve = false
     and role <> 'admin';
  if not found then
    raise exception 'your account is already set up';
  end if;
end $$;
revoke all on function choose_role(user_role) from public;
grant execute on function choose_role(user_role) to authenticated;

-- a record the team prepared settles the side on sign-in, so the question is skipped
create or replace function claim_pending() returns trigger language plpgsql security definer as $$
declare p pending_people%rowtype;
begin
  select * into p from pending_people where lower(email) = lower(new.email) and claimed_by is null limit 1;
  if found then
    update profiles set
      role = p.role, full_name = coalesce(new.full_name, p.full_name), org_name = p.org_name,
      headline = p.headline, location = p.location, timezone = p.timezone,
      years_exp = p.years_exp, english = p.english,
      stage = coalesce(p.stage, profiles.stage),
      assigned_by_releve = true, role_chosen_at = now()
    where id = new.id;
    update searches set client_id = new.id, pending_id = null where pending_id = p.id;
    -- pay goes to talent_pay, never onto the profile row
    if p.rate_month is not null then
      insert into talent_pay (talent_id, rate_month) values (new.id, p.rate_month)
      on conflict (talent_id) do update set rate_month = excluded.rate_month;
    end if;
    update pending_people set claimed_by = new.id where id = p.id;
  end if;
  return new;
end $$;

-- and nobody edits their own way across the line
create or replace function guard_profile_edit() returns trigger language plpgsql as $$
begin
  if auth.uid() = new.id and not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    new.role               := old.role;                -- nobody promotes themselves
    new.stage              := old.stage;               -- the team owns the pipeline stage
    new.role_chosen_at     := old.role_chosen_at;      -- and nobody re-opens the question
    new.assigned_by_releve := old.assigned_by_releve;
  end if;
  return new;
end $$;

-- ---------- profile photos ----------
-- Uploaded from the person's own device, cropped square in the browser first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- each photo lives at <user id>/photo.jpg, so the folder name is the owner
drop policy if exists "avatars are readable" on storage.objects;
create policy "avatars are readable" on storage.objects for select
  using (bucket_id = 'avatars');
drop policy if exists "own avatar upload" on storage.objects;
create policy "own avatar upload" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own avatar replace" on storage.objects;
create policy "own avatar replace" on storage.objects for update
  using  (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own avatar delete" on storage.objects;
create policy "own avatar delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================
-- PART 7 — picking a side, without a separate function
-- The rule ("once, and only if Relève has not already assigned one")
-- belongs in the trigger that guards every profile edit. Putting it
-- there means an ordinary update does the job, so nothing depends on
-- PostgREST having discovered a new function yet.
-- ============================================================
create or replace function guard_profile_edit() returns trigger language plpgsql as $$
declare i_am_admin boolean;
begin
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') into i_am_admin;

  if auth.uid() = new.id and not i_am_admin then
    new.stage      := old.stage;        -- the team owns the pipeline stage
    new.assigned_by_releve := old.assigned_by_releve;

    if old.role_chosen_at is null
       and old.assigned_by_releve = false
       and old.role <> 'admin'
       and new.role in ('client', 'talent')
    then
      new.role_chosen_at := now();      -- the one-time choice: allowed, and stamped
    else
      new.role           := old.role;   -- every later attempt: ignored
      new.role_chosen_at := old.role_chosen_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profile_edit_guard on profiles;
create trigger profile_edit_guard before update on profiles
  for each row execute function guard_profile_edit();

drop function if exists choose_role(user_role);

-- ============================================================
-- PHASE 2 — the working layer: tasks, weekly check-ins, messages
-- Additive and idempotent. Safe to run on top of an existing database.
-- ============================================================

do $$ begin
  create type task_priority as enum ('urgent', 'high', 'normal', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_origin as enum ('meeting', 'email', 'check_in', 'recurring', 'self');
exception when duplicate_object then null; end $$;

-- ---------- tasks ----------
-- One shared list per placement. The executive assigns; the talent may also
-- add their own. Both sides see the same list.
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  title        text not null,
  detail       text,
  priority     task_priority not null default 'normal',
  due_on       date,
  origin       task_origin not null default 'self',
  origin_note  text,                       -- "Tuesday board call", "thread with Legal"
  created_by   uuid not null references profiles(id) on delete cascade,
  done         boolean not null default false,
  done_at      timestamptz,
  done_by      uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists tasks_placement_idx on tasks (placement_id, done, due_on);

-- ---------- weekly check-ins ----------
-- Talent → their Relève client success manager. The executive never sees these:
-- the point is that talent can be honest about the placement.
create table if not exists checkins (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  talent_id    uuid not null references profiles(id) on delete cascade,
  week_ending  date not null,             -- the Friday the week closes on
  shipped      text,                      -- what actually got done
  blocked      text,                      -- what is in the way
  rapport      int check (rapport between 1 and 5),
  workload     text check (workload in ('light','right','heavy')),
  note         text,                      -- anything for Relève's eyes only
  needs_attention boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (placement_id, week_ending)
);
create index if not exists checkins_week_idx on checkins (week_ending desc, needs_attention);

-- Raise a hand automatically when a check-in reads badly, so nothing depends on
-- the talent deciding to escalate.
create or replace function flag_checkin() returns trigger language plpgsql as $$
begin
  new.needs_attention :=
    coalesce(nullif(btrim(coalesce(new.blocked, '')), ''), null) is not null
    or coalesce(new.rapport, 5) <= 2
    or new.workload = 'heavy';
  return new;
end $$;
drop trigger if exists checkin_flag on checkins;
create trigger checkin_flag before insert or update on checkins
  for each row execute function flag_checkin();

-- ---------- messages ----------
-- One thread per person with the Relève team. subject_id is whose thread it is
-- (a client or a talent); from_team marks Relève's side of it.
create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references profiles(id) on delete cascade,
  sender_id  uuid not null references profiles(id) on delete cascade,
  body       text not null,
  from_team  boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on messages (subject_id, created_at desc);

-- ---------- who may see what ----------
alter table tasks    enable row level security;
alter table checkins enable row level security;
alter table messages enable row level security;

-- true when the signed-in person is either side of that placement
create or replace function in_placement(pid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from placements p
    where p.id = pid and (p.client_id = auth.uid() or p.talent_id = auth.uid())
  );
$$;

drop policy if exists "read tasks in your placement" on tasks;
create policy "read tasks in your placement" on tasks for select
  using (in_placement(placement_id) or is_admin());

drop policy if exists "add tasks in your placement" on tasks;
create policy "add tasks in your placement" on tasks for insert
  with check ((in_placement(placement_id) and created_by = auth.uid()) or is_admin());

drop policy if exists "update tasks in your placement" on tasks;
create policy "update tasks in your placement" on tasks for update
  using (in_placement(placement_id) or is_admin())
  with check (in_placement(placement_id) or is_admin());

drop policy if exists "delete own tasks" on tasks;
create policy "delete own tasks" on tasks for delete
  using ((in_placement(placement_id) and created_by = auth.uid()) or is_admin());

-- check-ins: the talent who wrote it, and Relève. Never the executive.
drop policy if exists "talent reads own checkins" on checkins;
create policy "talent reads own checkins" on checkins for select
  using (talent_id = auth.uid() or is_admin());

drop policy if exists "talent writes own checkins" on checkins;
create policy "talent writes own checkins" on checkins for insert
  with check (talent_id = auth.uid() and in_placement(placement_id));

drop policy if exists "talent updates own checkins" on checkins;
create policy "talent updates own checkins" on checkins for update
  using (talent_id = auth.uid() or is_admin())
  with check (talent_id = auth.uid() or is_admin());

-- messages: your own thread, and Relève's side of every thread
drop policy if exists "read own thread" on messages;
create policy "read own thread" on messages for select
  using (subject_id = auth.uid() or is_admin());

drop policy if exists "write to own thread" on messages;
create policy "write to own thread" on messages for insert
  with check (
    (subject_id = auth.uid() and sender_id = auth.uid() and from_team = false)
    or (is_admin() and sender_id = auth.uid() and from_team = true)
  );

drop policy if exists "mark thread read" on messages;
create policy "mark thread read" on messages for update
  using (subject_id = auth.uid() or is_admin())
  with check (subject_id = auth.uid() or is_admin());

-- ---------- the placement file ----------
-- Relève's own running notes on a placement. Never visible to either side.
create table if not exists placement_notes (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  author_id    uuid not null references profiles(id) on delete cascade,
  body         text not null,
  kind         text not null default 'note'
               check (kind in ('note','call','escalation','review','resolution')),
  created_at   timestamptz not null default now()
);
create index if not exists placement_notes_idx on placement_notes (placement_id, created_at desc);

alter table placement_notes enable row level security;
drop policy if exists "team only notes" on placement_notes;
create policy "team only notes" on placement_notes for all
  using (is_admin()) with check (is_admin());

-- why a placement ended — the most useful field in the whole schema for
-- learning, and the easiest one to forget to capture
alter table placements add column if not exists ended_reason text;
alter table placements add column if not exists ended_note text;

-- ============================================================
-- The decision layer: what the executive thinks, and what the
-- interview actually told us. Both were missing entirely.
-- ============================================================

-- ---------- the executive's own verdict on a candidate ----------
-- Keyed on the pair rather than on a matches row: the shortlist an executive
-- actually sees is ranked live from the bench, and the matches table is not yet
-- wired to real searches. This records the decision either way.
create table if not exists talent_decisions (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references profiles(id) on delete cascade,
  talent_id  uuid not null references profiles(id) on delete cascade,
  state      text not null check (state in ('shortlisted','passed','interviewing','hired')),
  reason     text,                       -- why passed: the most useful field here
  note       text,
  decided_at timestamptz not null default now(),
  unique (client_id, talent_id)
);
create index if not exists talent_decisions_idx on talent_decisions (client_id, state);

alter table talent_decisions enable row level security;

-- the executive owns their own decisions; Relève sees them all.
-- Talent never see whether they were passed over, or why.
drop policy if exists "own decisions" on talent_decisions;
create policy "own decisions" on talent_decisions for all
  using (client_id = auth.uid() or is_admin())
  with check (client_id = auth.uid() or is_admin());

-- ---------- what the interview told us ----------
-- Filed by either side after the fact. This is the data that lets the
-- Signature be checked against reality instead of trusted on faith.
create table if not exists interview_feedback (
  id           uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews(id) on delete cascade,
  author_id    uuid not null references profiles(id) on delete cascade,
  side         text not null check (side in ('client','talent')),
  rating       int check (rating between 1 and 5),
  proceed      text check (proceed in ('yes','maybe','no')),
  strengths    text,
  concerns     text,
  notes        text,                      -- seen by Relève only
  created_at   timestamptz not null default now(),
  unique (interview_id, author_id)
);
create index if not exists interview_feedback_idx on interview_feedback (interview_id);

alter table interview_feedback enable row level security;

-- You see your own; Relève sees all. Neither side reads the other's — an
-- executive reading a candidate's honest notes would end honest notes.
drop policy if exists "read own feedback" on interview_feedback;
create policy "read own feedback" on interview_feedback for select
  using (author_id = auth.uid() or is_admin());

drop policy if exists "file own feedback" on interview_feedback;
create policy "file own feedback" on interview_feedback for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from interviews i
                where i.id = interview_id and (i.client_id = auth.uid() or i.talent_id = auth.uid()))
  );

drop policy if exists "amend own feedback" on interview_feedback;
create policy "amend own feedback" on interview_feedback for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- ============================================================
-- VETTING — what a candidate must clear before an executive
-- ever sees their name.
-- ============================================================

do $$ begin
  create type vetting_kind as enum ('identity', 'right_to_work', 'nda');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vetting_state as enum ('not_started', 'submitted', 'verified', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

-- One row per person per requirement.
-- Deliberately holds NO identifier numbers — a passport number in a database
-- column is a liability with no upside. The document is enough to verify
-- against, and it can be deleted. Only the fact of verification persists.
create table if not exists vetting (
  id           uuid primary key default gen_random_uuid(),
  talent_id    uuid not null references profiles(id) on delete cascade,
  kind         vetting_kind not null,
  state        vetting_state not null default 'not_started',
  file_path    text,                      -- inside the private 'vetting' bucket
  file_name    text,                      -- what they called it, for your eyes
  submitted_at timestamptz,
  verified_at  timestamptz,
  verified_by  uuid references profiles(id) on delete set null,
  expires_on   date,                      -- passports expire; so should the check
  note         text,                      -- Relève's note
  reject_reason text,                     -- shown to the candidate so they can fix it
  updated_at   timestamptz not null default now(),
  unique (talent_id, kind)
);
create index if not exists vetting_state_idx on vetting (state, kind);

alter table vetting enable row level security;

drop policy if exists "see own vetting" on vetting;
create policy "see own vetting" on vetting for select
  using (talent_id = auth.uid() or is_admin());

drop policy if exists "submit own vetting" on vetting;
create policy "submit own vetting" on vetting for insert
  with check (talent_id = auth.uid() or is_admin());

-- A candidate may replace a document. Only Relève may mark it verified —
-- guarded below so that self-approval is impossible.
drop policy if exists "update own vetting" on vetting;
create policy "update own vetting" on vetting for update
  using (talent_id = auth.uid() or is_admin())
  with check (talent_id = auth.uid() or is_admin());

create or replace function guard_vetting() returns trigger language plpgsql as $$
begin
  if not is_admin() then
    if new.state in ('verified', 'rejected') then
      raise exception 'only Relève can verify or reject a document';
    end if;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.note := old.note;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists vetting_guard on vetting;
create trigger vetting_guard before update on vetting
  for each row execute function guard_vetting();

-- Has this person cleared everything? Used to gate release to executives.
create or replace function is_vetted(person uuid) returns boolean
language sql stable security definer as $$
  select count(*) = 3 from vetting v
   where v.talent_id = person and v.state = 'verified'
     and (v.expires_on is null or v.expires_on >= current_date);
$$;

-- ---------- the private document store ----------
-- NOT public. Unlike 'avatars', nothing here is reachable by URL alone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vetting', 'vetting', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "own vetting files readable" on storage.objects;
create policy "own vetting files readable" on storage.objects for select
  using (bucket_id = 'vetting'
         and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

drop policy if exists "own vetting files upload" on storage.objects;
create policy "own vetting files upload" on storage.objects for insert
  with check (bucket_id = 'vetting'
              and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

drop policy if exists "own vetting files replace" on storage.objects;
create policy "own vetting files replace" on storage.objects for update
  using (bucket_id = 'vetting'
         and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

drop policy if exists "own vetting files remove" on storage.objects;
create policy "own vetting files remove" on storage.objects for delete
  using (bucket_id = 'vetting'
         and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

-- ============================================================
-- VETTING, revised 3 Sept 2026
-- Right to work dropped. The agreement is issued BY Relève and
-- uploaded by Relève — the candidate reads it, they do not send it.
-- ============================================================

do $$ begin
  alter type vetting_kind add value if not exists 'agreement';
exception when others then null; end $$;

-- who is expected to put the file there: the candidate, or Relève
alter table vetting add column if not exists issued_by_team boolean not null default false;

-- retire anything already filed under right_to_work rather than deleting it
update vetting set state = 'expired', note = coalesce(note,'') || ' [right to work no longer required]'
 where kind::text = 'right_to_work' and state <> 'expired';

-- Relève may file a document on a candidate's behalf.
drop policy if exists "team files for candidate" on vetting;
create policy "team files for candidate" on vetting for insert
  with check (is_admin() or talent_id = auth.uid());

-- Cleared means: identity verified, and the agreement issued and signed.
--
-- The kind is compared as text on purpose. Postgres refuses to let a value
-- added to an enum be USED in the same transaction, and this whole file runs
-- as one. Casting to text sidesteps that, so the file stays runnable in a
-- single pass on a fresh database and on this one.
create or replace function is_vetted(person uuid) returns boolean
language sql stable security definer as $$
  select
    exists (select 1 from vetting v where v.talent_id = person and v.kind::text = 'identity'
              and v.state = 'verified' and (v.expires_on is null or v.expires_on >= current_date))
    and
    exists (select 1 from vetting v where v.talent_id = person and v.kind::text = 'agreement'
              and v.state = 'verified');
$$;


-- ============================================================
-- THE MONEY SIDE, 3 Sept 2026
--
-- Everything the Terms of Service promises, made real:
--   $500 non-refundable deposit once a search begins, credited to invoice one
--   $2,500-$4,500/mo quoted per placement, fixed for the initial term
--   invoices issued the first Monday of each month, due on receipt
--   three-month minimum, then month-to-month on 30 days' notice
--
-- Money is stored in CENTS as integers. Never floats: 0.1 + 0.2 is not 0.3,
-- and a rounding error in a retainer is a phone call you do not want.
--
-- TWO NUMBERS THAT MUST NEVER MEET:
--   profiles.rate_month          what the TALENT is paid.  No client may see it.
--   placement_terms.rate_month_cents  what the CLIENT pays. No talent may see it.
-- The gap between them is Releve's margin. Row level security is per row, not
-- per column, and talent can read their own placements row -- so the client
-- rate cannot live on `placements`. It lives in its own table with its own
-- policy instead. This is enforcement, not convention.
-- ============================================================

-- ---------- 1. Proof they accepted the terms ----------
-- Without this there is no record anyone ever agreed to Section 5 or 6.
create table if not exists terms_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  document    text not null check (document in ('terms', 'privacy')),
  version     text not null,                 -- the effective date of the text they saw
  accepted_at timestamptz not null default now(),
  ip          text,                          -- evidence of the click, not analytics
  user_agent  text,
  unique (user_id, document, version)
);
comment on table terms_acceptances is
  'One row per person per document per version. Never delete: this is the evidence that someone agreed.';

create index if not exists terms_by_user on terms_acceptances(user_id);

alter table terms_acceptances enable row level security;
drop policy if exists "see own acceptances" on terms_acceptances;
create policy "see own acceptances" on terms_acceptances for select
  using (user_id = auth.uid() or is_admin());
-- You may record your own acceptance. There is deliberately no update or
-- delete policy: evidence you can quietly rewrite is not evidence.
drop policy if exists "record own acceptance" on terms_acceptances;
create policy "record own acceptance" on terms_acceptances for insert
  with check (user_id = auth.uid());

-- ---------- 2. The deposit sits on the search ----------
-- "$500 non-refundable deposit once the search begins."
-- searches is already admin-write, client-read-own, so this is safe here.
alter table searches add column if not exists deposit_cents   int  not null default 50000;
alter table searches add column if not exists deposit_status  text not null default 'due';
alter table searches add column if not exists deposit_paid_on date;

do $$ begin
  alter table searches add constraint searches_deposit_status_ck
    check (deposit_status in ('due', 'paid', 'waived'));
exception when duplicate_object then null; end $$;

-- ---------- 3. The agreed rate, in its own table ----------
create table if not exists placement_terms (
  placement_id     uuid primary key references placements(id) on delete cascade,
  rate_month_cents int,
  minimum_months   int not null default 3,
  notice_given_on  date,
  updated_at       timestamptz not null default now()
);
comment on table placement_terms is
  'What the CLIENT pays Releve. Separate from placements because talent can read their own placements row, and must never see this number.';

alter table placement_terms enable row level security;

-- The client sees their own terms. Releve sees everything. Talent see nothing:
-- there is no policy that admits them, so the table is invisible to them.
drop policy if exists "client reads own terms" on placement_terms;
create policy "client reads own terms" on placement_terms for select
  using (is_admin() or exists (
    select 1 from placements p
    where p.id = placement_terms.placement_id and p.client_id = auth.uid()
  ));
drop policy if exists "team writes terms" on placement_terms;
create policy "team writes terms" on placement_terms for all
  using (is_admin()) with check (is_admin());

-- If an earlier run of this file put the rate on placements, move it across
-- and drop it. Leaving it there would leak to every talent account.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'placements' and column_name = 'rate_month_cents') then
    insert into placement_terms (placement_id, rate_month_cents, minimum_months, notice_given_on)
    select id, rate_month_cents, coalesce(minimum_months, 3), notice_given_on from placements
    on conflict (placement_id) do nothing;
    alter table placements drop column if exists rate_month_cents;
    alter table placements drop column if exists minimum_months;
    alter table placements drop column if exists notice_given_on;
  end if;
end $$;

-- Every placement gets a terms row, so a rate can be set without creating one.
insert into placement_terms (placement_id)
select p.id from placements p
left join placement_terms t on t.placement_id = p.id
where t.placement_id is null;

create or replace function ensure_placement_terms() returns trigger language plpgsql as $$
begin
  insert into placement_terms (placement_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists ensure_placement_terms_t on placements;
create trigger ensure_placement_terms_t after insert on placements
for each row execute function ensure_placement_terms();

-- When the three-month commitment runs out. Everything up to it is owed
-- whether or not the engagement continues.
create or replace function minimum_term_ends(t placement_terms, started date) returns date
language sql stable as $$
  select (started + (t.minimum_months || ' months')::interval)::date;
$$;

-- ---------- 4. Invoices ----------
create table if not exists invoices (
  id           uuid primary key default gen_random_uuid(),
  number       text unique,                  -- REL-2026-0001, assigned on issue
  client_id    uuid not null references profiles(id) on delete cascade,
  placement_id uuid references placements(id) on delete set null,
  search_id    uuid references searches(id)  on delete set null,
  kind         text not null check (kind in ('deposit', 'retainer')),
  period_start date,
  period_end   date,
  amount_cents int  not null check (amount_cents >= 0),
  issued_on    date not null default current_date,
  due_on       date,                          -- "due on receipt" = issued_on
  status       text not null default 'draft'
                 check (status in ('draft', 'sent', 'paid', 'void')),
  paid_on      date,
  note         text,
  created_at   timestamptz not null default now()
);

-- One retainer per placement per period. Run the monthly job twice and
-- nothing is double-billed.
create unique index if not exists one_retainer_per_period
  on invoices(placement_id, period_start) where kind = 'retainer';

create index if not exists invoices_by_client on invoices(client_id, issued_on desc);
create index if not exists invoices_unpaid    on invoices(status) where status in ('draft','sent');

alter table invoices enable row level security;
-- A client sees their own bills. Talent see none: they are paid by Releve,
-- and what the client pays is not theirs to know.
drop policy if exists "client reads own invoices" on invoices;
create policy "client reads own invoices" on invoices for select
  using (client_id = auth.uid() or is_admin());
drop policy if exists "team writes invoices" on invoices;
create policy "team writes invoices" on invoices for all
  using (is_admin()) with check (is_admin());

-- ---------- the first Monday of a given month ----------
create or replace function first_monday(d date) returns date
language sql immutable as $$
  select (date_trunc('month', d)::date)
       + ((8 - extract(isodow from date_trunc('month', d))::int) % 7);
$$;
comment on function first_monday(date) is
  'Billing day. When a month starts on a Monday this returns that Monday, not the next one.';

-- ---------- issue the month's retainers ----------
-- Idempotent: the unique index means a second run in the same month adds
-- nothing. Returns how many drafts it actually created.
create or replace function issue_monthly_retainers(for_month date default current_date)
returns int language plpgsql security definer as $$
declare
  p_start date := date_trunc('month', for_month)::date;
  p_end   date := (date_trunc('month', for_month) + interval '1 month - 1 day')::date;
  issued  date := first_monday(for_month);
  made    int  := 0;
begin
  if not is_admin() then
    raise exception 'only Releve may issue invoices';
  end if;

  insert into invoices (client_id, placement_id, kind, period_start, period_end,
                        amount_cents, issued_on, due_on, status, note)
  select pl.client_id, pl.id, 'retainer', p_start, p_end,
         t.rate_month_cents, issued, issued, 'draft', 'Monthly retainer'
  from placements pl
  join placement_terms t on t.placement_id = pl.id
  where t.rate_month_cents is not null
    and pl.started_on <= p_end
    -- still running, or ended inside this month, or still inside the
    -- three-month commitment: all of those are payable.
    and (pl.ended_on is null
         or pl.ended_on >= p_start
         or minimum_term_ends(t, pl.started_on) >= p_start)
  on conflict do nothing;

  get diagnostics made = row_count;
  return made;
end $$;

-- ---------- invoice numbers ----------
-- Assigned when a draft is issued, never on creation, so the sequence has no
-- gaps where a draft was thrown away.
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
    new.paid_on := current_date;
  end if;
  return new;
end $$;

drop trigger if exists number_invoice_t on invoices;
create trigger number_invoice_t before insert or update on invoices
for each row execute function number_invoice();

-- ---------- what is owed, at a glance ----------
-- security_invoker matters here. Without it a view runs as its owner and
-- quietly bypasses row level security, which would let any signed-in account
-- read every client's invoices.
drop view if exists money_owed;
create view money_owed with (security_invoker = true) as
select
  i.id, i.number, i.kind, i.status, i.issued_on, i.due_on,
  i.amount_cents, i.period_start, i.period_end,
  c.id as client_id, c.full_name as client_name, c.org_name,
  (current_date - i.due_on) as days_overdue
from invoices i
join profiles c on c.id = i.client_id
where i.status in ('draft', 'sent')
order by i.due_on nulls last;


-- ============================================================
-- THE REVIEW LIST, 3 Sept 2026
-- Roles, audit, vetting gate, client pulse, calibration,
-- the replacement guarantee, time off, talent-facing feedback,
-- the first fortnight, and private photos.
-- ============================================================

-- ---------- 1. More than one manager ----------
-- is_admin() was a single flag. Relève now has roles: an owner who can do
-- anything, and managers who run their own accounts. is_admin() is kept and
-- still means "on the Relève team", so nothing that already calls it breaks.
create table if not exists team_roles (
  user_id    uuid primary key references profiles(id) on delete cascade,
  team_role  text not null default 'manager'
               check (team_role in ('owner', 'client_success', 'talent_success', 'manager')),
  added_at   timestamptz not null default now(),
  added_by   uuid references profiles(id)
);

-- Whoever is already an admin is the owner, so this file never locks her out.
create or replace function is_owner() returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles p
    left join team_roles t on t.user_id = p.id
    where p.id = auth.uid() and p.role = 'admin'
      and coalesce(t.team_role, 'owner') = 'owner'
  );
$$;

alter table team_roles enable row level security;
drop policy if exists "team reads roles" on team_roles;
create policy "team reads roles" on team_roles for select using (is_admin());
drop policy if exists "owner writes roles" on team_roles;
create policy "owner writes roles" on team_roles for all
  using (is_owner()) with check (is_owner());

insert into team_roles (user_id, team_role)
select id, 'owner' from profiles where role = 'admin'
on conflict (user_id) do nothing;

-- Which manager looks after which placement.
alter table placements add column if not exists csm_id uuid references profiles(id);
alter table placements add column if not exists tsm_id uuid references profiles(id);

comment on column placements.csm_id is 'Client Success Manager. Null means unassigned, which the console flags.';

-- ---------- 2. The audit trail ----------
-- Who changed what, when. Append only: no update or delete policy exists, so
-- not even the owner can quietly rewrite history through the app.
create table if not exists audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor_id   uuid references profiles(id) on delete set null,
  actor_email text,                      -- kept flat, so a deleted account still reads
  action     text not null,              -- 'release', 'rate_set', 'vetting_verified', ...
  subject    text,                       -- table or area touched
  subject_id uuid,
  detail     jsonb not null default '{}'
);
create index if not exists audit_recent  on audit_log(at desc);
create index if not exists audit_subject on audit_log(subject, subject_id, at desc);

alter table audit_log enable row level security;
drop policy if exists "team reads audit" on audit_log;
create policy "team reads audit" on audit_log for select using (is_admin());
drop policy if exists "team writes audit" on audit_log;
create policy "team writes audit" on audit_log for insert with check (is_admin());

create or replace function note_action(a text, s text, sid uuid, d jsonb default '{}')
returns void language plpgsql security definer as $$
declare em text;
begin
  select email into em from profiles where id = auth.uid();
  insert into audit_log (actor_id, actor_email, action, subject, subject_id, detail)
  values (auth.uid(), em, a, s, sid, coalesce(d, '{}'));
end $$;

-- Vetting decisions write themselves into the log. This is the one that
-- matters most: a verification nobody can trace is not a verification.
create or replace function audit_vetting() returns trigger language plpgsql security definer as $$
begin
  if new.state is distinct from old.state then
    perform note_action('vetting_' || new.state, 'vetting', new.id,
      jsonb_build_object('talent_id', new.talent_id, 'kind', new.kind::text,
                         'from', old.state, 'to', new.state));
  end if;
  return new;
end $$;
drop trigger if exists audit_vetting_t on vetting;
create trigger audit_vetting_t after update on vetting
for each row execute function audit_vetting();

create or replace function audit_money() returns trigger language plpgsql security definer as $$
begin
  perform note_action('invoice_' || new.status, 'invoices', new.id,
    jsonb_build_object('client_id', new.client_id, 'amount_cents', new.amount_cents,
                       'number', new.number));
  return new;
end $$;
drop trigger if exists audit_money_t on invoices;
create trigger audit_money_t after insert or update of status on invoices
for each row execute function audit_money();

-- ---------- 3. Vetting gates release ----------
-- is_vetted() existed and was correct, and nothing called it. Now the database
-- refuses the release itself, so no interface change can get around it.
create or replace function guard_release() returns trigger language plpgsql as $$
begin
  if new.released and not coalesce(old.released, false) then
    if not is_vetted(new.talent_id) then
      raise exception 'This candidate is not verified yet. Identity and the signed agreement must both be verified before they can be released to a client.';
    end if;
    perform note_action('release', 'matches', null,
      jsonb_build_object('client_id', new.client_id, 'talent_id', new.talent_id));
  end if;
  return new;
end $$;
drop trigger if exists guard_release_t on matches;
create trigger guard_release_t before update on matches
for each row execute function guard_release();

-- ---------- 4. The executive's monthly pulse ----------
-- Talent check in every Friday. The person paying was never asked anything.
create table if not exists client_pulse (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  month_of     date not null,                 -- first of the month it covers
  going        int  check (going between 1 and 5),      -- how is it going
  workload     text check (workload in ('too_light', 'about_right', 'too_heavy')),
  standout     text,                           -- what has gone well
  friction     text,                           -- what is not working
  keep_going   boolean,                        -- would you place them again
  needs_attention boolean not null default false,
  filed_at     timestamptz not null default now(),
  unique (placement_id, month_of)
);
create index if not exists pulse_attention on client_pulse(needs_attention) where needs_attention;

alter table client_pulse enable row level security;
-- The client fills it in. Relève reads it. Talent never see it — the point is
-- that the executive can say something awkward without managing the fallout.
drop policy if exists "client files own pulse" on client_pulse;
create policy "client files own pulse" on client_pulse for all
  using (is_admin() or exists (
    select 1 from placements p where p.id = client_pulse.placement_id and p.client_id = auth.uid()))
  with check (is_admin() or exists (
    select 1 from placements p where p.id = client_pulse.placement_id and p.client_id = auth.uid()));

create or replace function flag_pulse() returns trigger language plpgsql as $$
begin
  new.needs_attention :=
    coalesce(new.going, 5) <= 3
    or new.workload in ('too_light', 'too_heavy')
    or new.keep_going is false
    or coalesce(nullif(btrim(coalesce(new.friction, '')), ''), null) is not null;
  return new;
end $$;
drop trigger if exists flag_pulse_t on client_pulse;
create trigger flag_pulse_t before insert or update on client_pulse
for each row execute function flag_pulse();

-- ---------- 5. The calibration loop ----------
-- predicted_fit, outcome_score and retained were columns nobody ever wrote to,
-- so the matching could never learn anything. Predicted fit is now captured
-- when the placement is made, and the six-month review has a home.
alter table placements add column if not exists review_due_on date;
alter table placements add column if not exists reviewed_on   date;
alter table placements add column if not exists review_note   text;

-- Six months after the start, the outcome is due.
create or replace function set_review_due() returns trigger language plpgsql as $$
begin
  if new.review_due_on is null then
    new.review_due_on := (new.started_on + interval '6 months')::date;
  end if;
  return new;
end $$;
drop trigger if exists set_review_due_t on placements;
create trigger set_review_due_t before insert on placements
for each row execute function set_review_due();

update placements set review_due_on = (started_on + interval '6 months')::date
 where review_due_on is null;

-- What the assessment predicted against what actually happened.
drop view if exists calibration;
create view calibration with (security_invoker = true) as
select
  p.id, p.started_on, p.reviewed_on, p.predicted_fit, p.outcome_score, p.retained,
  (p.outcome_score - p.predicted_fit) as gap,
  c.full_name as client_name, t.full_name as talent_name
from placements p
join profiles c on c.id = p.client_id
join profiles t on t.id = p.talent_id
where p.predicted_fit is not null and p.outcome_score is not null;

-- ---------- 6. The replacement guarantee ----------
-- "A qualified applicant within 14 days, and a replacement if the hire does
-- not work out." Neither half was tracked anywhere.
alter table searches add column if not exists first_candidate_on date;
alter table searches add column if not exists guarantee_days     int not null default 14;

alter table placements add column if not exists replaces_id  uuid references placements(id);
alter table placements add column if not exists ended_reason text
  check (ended_reason in ('completed', 'client_ended', 'talent_left', 'not_working', 'replaced'));

comment on column placements.replaces_id is
  'Set when this placement is a free replacement for one that did not work out. Makes the guarantee visible rather than remembered.';

-- Searches past their promise, with nobody put forward yet.
drop view if exists guarantee_watch;
create view guarantee_watch with (security_invoker = true) as
select s.id, s.client_id, s.role_title, s.opened_at, s.guarantee_days,
       (current_date - s.opened_at) as days_open,
       c.full_name as client_name, c.org_name
from searches s
join profiles c on c.id = s.client_id
where s.first_candidate_on is null
  and s.stage not in ('Placed', 'On hold')
  and (current_date - s.opened_at) >= (s.guarantee_days - 3)   -- warn before it lapses
order by s.opened_at;

-- ---------- 7. Time off and coverage ----------
create table if not exists time_off (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  starts_on    date not null,
  ends_on      date not null,
  reason       text,
  state        text not null default 'requested'
                 check (state in ('requested', 'approved', 'declined', 'cancelled')),
  cover_note   text,                        -- who is covering, and how
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references profiles(id),
  check (ends_on >= starts_on)
);
create index if not exists time_off_upcoming on time_off(starts_on) where state = 'approved';

alter table time_off enable row level security;
-- Talent ask. The client can see it coming, which is the whole point. Only
-- Relève decides — cover has to be arranged, and that is not the talent's job.
drop policy if exists "placement sees time off" on time_off;
create policy "placement sees time off" on time_off for select using (in_placement(placement_id));
drop policy if exists "talent asks for time off" on time_off;
create policy "talent asks for time off" on time_off for insert
  with check (exists (select 1 from placements p
                      where p.id = time_off.placement_id and p.talent_id = auth.uid()));
drop policy if exists "team decides time off" on time_off;
create policy "team decides time off" on time_off for update
  using (is_admin()) with check (is_admin());

-- ---------- 8. Feedback the talent can actually see ----------
-- Reviews were internal only, so nobody knew how they were doing.
create table if not exists talent_feedback (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  talent_id    uuid not null references profiles(id) on delete cascade,
  period       text not null,                -- 'September 2026'
  strengths    text not null,
  growing      text,                          -- said as something to build, not a complaint
  quality      int check (quality between 1 and 5),
  communication int check (communication between 1 and 5),
  ownership    int check (ownership between 1 and 5),
  shared       boolean not null default false, -- drafted first, released deliberately
  written_by   uuid references profiles(id),
  written_at   timestamptz not null default now(),
  seen_at      timestamptz
);
create index if not exists feedback_for_talent on talent_feedback(talent_id, written_at desc);

alter table talent_feedback enable row level security;
-- The talent sees it only once it has been shared. A half-written review
-- appearing in someone's account is worse than none.
drop policy if exists "talent reads shared feedback" on talent_feedback;
create policy "talent reads shared feedback" on talent_feedback for select
  using (is_admin() or (talent_id = auth.uid() and shared));
drop policy if exists "team writes feedback" on talent_feedback;
create policy "team writes feedback" on talent_feedback for all
  using (is_admin()) with check (is_admin());

-- ---------- 9. The first fortnight ----------
-- Week one was improvised every time. This is the same plan for everyone,
-- created automatically when a placement starts.
create table if not exists onboarding_steps (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  day          int  not null,                -- days from the start date
  title        text not null,
  detail       text,
  whose        text not null check (whose in ('client', 'talent', 'both')),
  done         boolean not null default false,
  done_at      timestamptz,
  sort         int not null default 0
);
create index if not exists onboarding_by_placement on onboarding_steps(placement_id, sort);

alter table onboarding_steps enable row level security;
drop policy if exists "placement sees onboarding" on onboarding_steps;
create policy "placement sees onboarding" on onboarding_steps for select
  using (in_placement(placement_id));
drop policy if exists "placement ticks onboarding" on onboarding_steps;
create policy "placement ticks onboarding" on onboarding_steps for update
  using (in_placement(placement_id)) with check (in_placement(placement_id));
drop policy if exists "team writes onboarding" on onboarding_steps;
create policy "team writes onboarding" on onboarding_steps for all
  using (is_admin()) with check (is_admin());

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
     'Your Client Success Manager joins. Course-correct now rather than at month three.', 'both', 9);
  return new;
end $$;
drop trigger if exists plan_first_fortnight_t on placements;
create trigger plan_first_fortnight_t after insert on placements
for each row execute function plan_first_fortnight();

-- ---------- 10. Profile photos become private ----------
-- The bucket was public: not listed anywhere, but anyone who ever had the
-- exact link could open the image forever, signed in or not, including after
-- the person deleted their account.
--
-- Now private. The app serves photos through /api/photo/view, which checks
-- who is asking and then mints a link that expires in a minute. Nothing is
-- reachable by URL alone.
update storage.buckets set public = false where id = 'avatars';

-- Do these two people work together? Used to decide who may see whose photo.
create or replace function share_work(a uuid, b uuid) returns boolean
language sql stable security definer as $$
  select a = b
      or exists (select 1 from placements p
                 where (p.client_id = a and p.talent_id = b)
                    or (p.client_id = b and p.talent_id = a))
      or exists (select 1 from matches m
                 where m.released
                   and ((m.client_id = a and m.talent_id = b)
                     or (m.client_id = b and m.talent_id = a)));
$$;

-- Each photo lives at <user id>/photo.jpg, so the folder name is the owner.
-- The uuid regex guard matters: a stray path would otherwise raise on the
-- cast and take every avatar read down with it.
drop policy if exists "avatars are readable" on storage.objects;
drop policy if exists "avatars are public" on storage.objects;
drop policy if exists "read own avatar" on storage.objects;
drop policy if exists "avatars for people who work together" on storage.objects;
create policy "avatars for people who work together" on storage.objects for select
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_admin()
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
        and share_work(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  );

-- Existing rows hold a public URL that will stop resolving. Point them at the
-- app's own route instead, which is stable and checks permission every time.
update profiles
   set photo_url = '/api/photo/view?u=' || id::text
 where photo_url is not null
   and photo_url like 'http%'
   and photo_url like '%/storage/v1/object/public/avatars/%';


-- ============================================================
-- TWO LEAKS FOUND IN THE AUDIT, 3 Sept 2026
-- ============================================================

-- A view runs as its owner unless told otherwise, which means it ignores row
-- level security entirely. interview_list did, so any signed-in account could
-- read every interview in the system by querying the view directly — not
-- through the app, which filters properly, but the door was open.
--
-- Fixing it needs one more thing first: with security_invoker on, the join to
-- profiles is checked too, and profiles was "yourself or the team" only. So a
-- client could not read their own interview, because they could not read the
-- talent's name. This policy says people who work together may see each
-- other's basic profile — which is the truth of the situation anyway.
drop policy if exists "read profiles of people you work with" on profiles;
create policy "read profiles of people you work with" on profiles for select
  using (share_work(auth.uid(), id));

drop view if exists interview_list;
create view interview_list with (security_invoker = true) as
  select i.*, c.full_name as client_name, t.full_name as talent_name
  from interviews i
  join profiles c on c.id = i.client_id
  join profiles t on t.id = i.talent_id;

-- NOTE, deliberately left alone: talent_directory still bypasses row level
-- security, so any signed-in client can read the whole bench through it.
-- That is how the matching works today — the client dashboard ranks every
-- available talent against their own Signature, which needs the whole bench
-- and the validity data the score depends on. Locking it to released
-- candidates only would break matching, so it is a product decision rather
-- than a bug, and it belongs to Sage, not to this file. It is written up in
-- WHERE-WE-LEFT-OFF.md.


-- ============================================================
-- THE SHORTLIST MODEL + A LEAK I OPENED, 3 Sept 2026
-- ============================================================

-- ---------- 1. Talent pay leaves profiles ----------
-- The policy above ("read profiles of people you work with") lets a client
-- read the whole profiles row of talent released to them. profiles.rate_month
-- is in that row. Row level security is per row, not per column, so the
-- comment on that column -- "client-facing views must never select this" --
-- was the only thing protecting it, and a comment is not protection.
--
-- Pay moves to its own table, which no client can read at all. Same shape as
-- placement_terms, and for the same reason.
create table if not exists talent_pay (
  talent_id   uuid primary key references profiles(id) on delete cascade,
  rate_month  int,
  currency    text not null default 'USD',
  updated_at  timestamptz not null default now()
);
comment on table talent_pay is
  'What Releve pays the talent. No client may read this table under any policy. The gap between this and placement_terms.rate_month_cents is the margin.';

alter table talent_pay enable row level security;
drop policy if exists "team only pay" on talent_pay;
create policy "team only pay" on talent_pay for all
  using (is_admin()) with check (is_admin());

-- Carry across anything already recorded, then drop the column.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'profiles' and column_name = 'rate_month') then
    insert into talent_pay (talent_id, rate_month)
    select id, rate_month from profiles where rate_month is not null
    on conflict (talent_id) do nothing;
    alter table profiles drop column rate_month;
  end if;
end $$;

-- ---------- 2. The client sees a shortlist, not the bench ----------
-- talent_directory bypassed row level security so the client dashboard could
-- rank the whole bench. That is the leak; this is the replacement.
--
-- Relève does the matching in the console and releases individuals. The
-- client sees exactly those people and no others. Nothing else changes about
-- how the score is computed -- it is the same engine, run by the team.
drop view if exists talent_directory;
create view talent_directory with (security_invoker = true) as
select
  p.id, p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.stage, p.photo_url,
  s.scores, s.facets, s.validity, s.confidence, s.conditions as cond
from profiles p
join signatures s on s.user_id = p.id and s.side = 'talent'
where p.role = 'talent';

-- With security_invoker on, this view now returns only what the reader is
-- allowed: the team sees everyone, and a client sees the talent released to
-- them, because of the profiles and signatures policies already in place.
-- One thing is missing for that to work -- signatures already allows released
-- reads, but profiles needs the same, and share_work covers placements and
-- released matches both. It is already granted above.

-- ---------- 3. The shortlist, as the client sees it ----------
-- Everything the executive needs to judge a candidate, and nothing internal.
-- Note what is absent: validity, impression-management, facet detail and pay.
drop view if exists my_shortlist;
create view my_shortlist with (security_invoker = true) as
select
  m.id as match_id, m.client_id, m.talent_id,
  m.overall, m.layer1, m.layer2, m.confidence, m.parts, m.conditions,
  m.client_state, m.created_at as released_at,
  p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.photo_url, p.bio,
  s.scores, s.archetype
from matches m
join profiles p on p.id = m.talent_id
join signatures s on s.user_id = m.talent_id and s.side = 'talent'
where m.released;

comment on view my_shortlist is
  'Released candidates only, with the internal assessment machinery stripped out. security_invoker means the row policies decide whose shortlist you get.';

-- ---------- 4. Make matching actually work ----------
-- Three things were wrong at once, and together they meant the Matching
-- Engine had never worked against a real client:
--
--   a) matches.search_id was NOT NULL, but a match made by hand in the
--      console does not necessarily belong to a search.
--   b) the code upserts on (client_id, talent_id) and no unique index
--      existed on that pair, so every write failed.
--   c) the read policy identified the client through search_id, which is
--      null for a hand-made match, so a released candidate stayed invisible.

alter table matches alter column search_id drop not null;

-- Backfill client_id from the search, for anything created before client_id
-- existed, then make the pair the real key.
update matches m set client_id = se.client_id
  from searches se where se.id = m.search_id and m.client_id is null;

delete from matches a using matches b
 where a.client_id = b.client_id and a.talent_id = b.talent_id and a.ctid > b.ctid;

create unique index if not exists matches_client_talent
  on matches(client_id, talent_id) where client_id is not null;

-- The client is now identified directly, whether or not a search is involved.
drop policy if exists "read released matches" on matches;
create policy "read released matches" on matches for select using (
  is_admin()
  or (matches.released and (
        matches.client_id = auth.uid()
        or exists (select 1 from searches se
                   where se.id = matches.search_id and se.client_id = auth.uid())))
  or talent_id = auth.uid()
);


-- ============================================================
-- THE OFFER, 3 Sept 2026
--
-- From the review: "An interview happens, and then a placement exists.
-- Nothing in between records a decision, an offer, terms discussed, or a
-- start date agreed. The moment your business actually earns money is the
-- moment the app has nothing to say about."
--
-- This is that moment. An offer is made, the executive and the talent each
-- answer it, and when both have said yes the placement can be created from
-- it with the terms already agreed rather than re-typed.
-- ============================================================

create table if not exists offers (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references profiles(id) on delete cascade,
  talent_id     uuid not null references profiles(id) on delete cascade,
  search_id     uuid references searches(id) on delete set null,

  -- what is actually being offered
  role_title    text not null,
  starts_on     date not null,
  hours         text,                       -- "40 a week, four hours overlapping 8am Pacific"
  scope         text,                       -- what they will own, in the executive's words
  rate_month_cents int,                     -- what the CLIENT will pay. Never shown to talent.
  talent_pay_cents int,                     -- what the TALENT will be paid. Never shown to the client.
  minimum_months   int not null default 3,

  state         text not null default 'draft'
                  check (state in ('draft','sent','client_yes','talent_yes','accepted','declined','withdrawn')),
  client_answer text check (client_answer in ('yes','no')),
  talent_answer text check (talent_answer in ('yes','no')),
  declined_by   text check (declined_by in ('client','talent','releve')),
  decline_reason text,

  sent_on       date,
  decided_on    date,
  placement_id  uuid references placements(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (client_id, talent_id, starts_on)
);
create index if not exists offers_open on offers(state) where state in ('sent','client_yes','talent_yes');

alter table offers enable row level security;

-- Both sides see their own offer. Neither sees the other's number: the two
-- rate columns live on one row, so the app reads through the two views below
-- rather than the table, and the table itself is team-only.
drop policy if exists "team handles offers" on offers;
create policy "team handles offers" on offers for all
  using (is_admin()) with check (is_admin());

-- What the executive sees. Their rate, never the talent's pay.
drop view if exists my_offer_client;
create view my_offer_client with (security_invoker = true) as
select o.id, o.client_id, o.talent_id, o.role_title, o.starts_on, o.hours, o.scope,
       o.rate_month_cents, o.minimum_months, o.state, o.client_answer, o.sent_on,
       p.full_name as talent_name, p.headline as talent_role, p.photo_url
from offers o join profiles p on p.id = o.talent_id
where o.client_id = auth.uid() and o.state in ('sent','client_yes','talent_yes','accepted');

-- What the talent sees. Their pay, never what the client is charged.
drop view if exists my_offer_talent;
create view my_offer_talent with (security_invoker = true) as
select o.id, o.client_id, o.talent_id, o.role_title, o.starts_on, o.hours, o.scope,
       o.talent_pay_cents, o.minimum_months, o.state, o.talent_answer, o.sent_on,
       c.full_name as client_name, c.org_name
from offers o join profiles c on c.id = o.client_id
where o.talent_id = auth.uid() and o.state in ('sent','client_yes','talent_yes','accepted');

-- Answering an offer. Written as a function so neither side can reach the
-- other's number, and so "both said yes" is decided in one place.
create or replace function answer_offer(offer uuid, answer text)
returns text language plpgsql security definer as $$
declare o offers%rowtype; side text;
begin
  select * into o from offers where id = offer;
  if not found then raise exception 'no such offer'; end if;
  if answer not in ('yes','no') then raise exception 'answer yes or no'; end if;
  if o.state not in ('sent','client_yes','talent_yes') then
    raise exception 'that offer is no longer open';
  end if;

  if o.client_id = auth.uid() then side := 'client';
  elsif o.talent_id = auth.uid() then side := 'talent';
  else raise exception 'that offer is not yours';
  end if;

  if answer = 'no' then
    update offers set state = 'declined', declined_by = side, decided_on = current_date,
      client_answer = case when side = 'client' then 'no' else client_answer end,
      talent_answer = case when side = 'talent' then 'no' else talent_answer end
     where id = offer;
    return 'declined';
  end if;

  update offers set
    client_answer = case when side = 'client' then 'yes' else client_answer end,
    talent_answer = case when side = 'talent' then 'yes' else talent_answer end
   where id = offer returning * into o;

  if o.client_answer = 'yes' and o.talent_answer = 'yes' then
    update offers set state = 'accepted', decided_on = current_date where id = offer;
    return 'accepted';
  end if;

  update offers set state = case when side = 'client' then 'client_yes' else 'talent_yes' end
   where id = offer;
  return 'waiting';
end $$;

-- Turning an accepted offer into a placement, with the terms already agreed
-- rather than typed again. Idempotent: running it twice returns the same
-- placement instead of making a second one.
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

  insert into placements (client_id, talent_id, started_on, predicted_fit)
  values (o.client_id, o.talent_id, o.starts_on, fit)
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


-- ============================================================
-- THE ROLE BREAKDOWN AND THE SKILLS PROFILE, 3 Sept 2026
--
-- Two questionnaires answered against one shared list of work areas.
-- The executive says how much of each area belongs to the talent; the talent
-- says how strong they are in the same areas and which they want to do.
--
-- Because both answer the same list, the two compare directly. The Signature
-- says whether two people will work well together; this says whether the
-- person can actually do the job. Both are needed and they are not the same
-- question.
-- ============================================================

create table if not exists role_breakdown (
  client_id   uuid primary key references profiles(id) on delete cascade,
  disciplines jsonb not null default '[]',  -- which disciplines the role is made of
  needs       jsonb not null default '{}',  -- "ea.inbox_triage" -> core | useful | no
  details     jsonb not null default '{}',  -- discipline-specific answers
  priorities  text,
  never       text,
  tools       text,
  success     text,
  hours       text,
  updated_at  timestamptz not null default now()
);
-- columns added after the first version of this table shipped
alter table role_breakdown add column if not exists disciplines jsonb not null default '[]';
alter table role_breakdown add column if not exists needs       jsonb not null default '{}';
alter table role_breakdown add column if not exists details     jsonb not null default '{}';
alter table role_breakdown add column if not exists hours       text;
alter table role_breakdown drop column if exists ownership;

alter table role_breakdown enable row level security;
drop policy if exists "own role breakdown" on role_breakdown;
create policy "own role breakdown" on role_breakdown for all
  using (client_id = auth.uid() or is_admin())
  with check (client_id = auth.uid() or is_admin());
-- Talent released to this executive may read the shape of the role they are
-- being considered for. They see the requirements, never the private notes.
drop policy if exists "candidate reads the role" on role_breakdown;
create policy "candidate reads the role" on role_breakdown for select
  using (share_work(auth.uid(), client_id));

create table if not exists skills_profile (
  talent_id   uuid primary key references profiles(id) on delete cascade,
  disciplines jsonb not null default '[]',  -- every discipline they claim
  levels      jsonb not null default '{}',  -- "social.shortform" -> none | learning | solid | deep
  details     jsonb not null default '{}',
  years       jsonb not null default '{}',  -- "social" -> 4
  primary_key text,                         -- their home discipline
  best        text,
  growing     text,
  tools       text,
  updated_at  timestamptz not null default now()
);
alter table skills_profile add column if not exists disciplines jsonb not null default '[]';
alter table skills_profile add column if not exists levels      jsonb not null default '{}';
alter table skills_profile add column if not exists details     jsonb not null default '{}';
alter table skills_profile add column if not exists years       jsonb not null default '{}';
alter table skills_profile add column if not exists primary_key text;
alter table skills_profile drop column if exists level;
alter table skills_profile drop column if exists appetite;

alter table skills_profile enable row level security;
drop policy if exists "own skills profile" on skills_profile;
create policy "own skills profile" on skills_profile for all
  using (talent_id = auth.uid() or is_admin())
  with check (talent_id = auth.uid() or is_admin());
-- An executive sees the skills of anyone released to them: it is half of why
-- they were put forward.
drop policy if exists "client reads released skills" on skills_profile;
create policy "client reads released skills" on skills_profile for select
  using (share_work(auth.uid(), talent_id));
