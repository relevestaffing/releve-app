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
-- The gate. Fires on insert as well as update: the console upserts, so the
-- first approval for a pair can arrive as an insert — which used to walk
-- straight past this check and put an unverified person in front of a client.
-- OLD is unassigned on an insert and is never read on that path.
-- Logging lives in stamp_release() alone, which knows the note and the name
-- behind the approval; doing it in both wrote every release to the log twice.
create or replace function guard_release() returns trigger language plpgsql as $$
begin
  if new.released and (tg_op = 'INSERT' or not coalesce(old.released, false)) then
    if not is_vetted(new.talent_id) then
      raise exception 'This candidate is not verified yet. Identity and the signed agreement must both be verified before they can be released to a client.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_release_t on matches;
create trigger guard_release_t before insert or update on matches
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


-- ============================================================
-- THREE THINGS THE FULL AUDIT FOUND, 3 Sept 2026
-- ============================================================

-- ---------- 1. Every Match and Release was a silent no-op ----------
-- The code upserts on (client_id, talent_id). The index behind it was
-- PARTIAL — "where client_id is not null" — and Postgres will not infer a
-- partial index for ON CONFLICT without its predicate. So every write raised
-- 42P10, the error was never checked, and the console cheerfully reported
-- "Released to the client" while nothing was written.
--
-- Second, independent cause: matches.overall is NOT NULL, and releasing a
-- candidate sends no score, so even the insert path failed.

update matches m set client_id = se.client_id
  from searches se where se.id = m.search_id and m.client_id is null;

-- Anything still without a client cannot be matched to anyone; it is debris
-- from before client_id existed.
delete from matches where client_id is null;

alter table matches alter column client_id set not null;
alter table matches alter column overall drop not null;

drop index if exists matches_client_talent;
create unique index if not exists matches_client_talent on matches(client_id, talent_id);

-- ---------- 2. Nobody could see their own offer ----------
-- my_offer_client and my_offer_talent are security_invoker, so the reader's
-- own permissions apply to the underlying table — and offers had exactly one
-- policy, is_admin(). Both sides got zero rows, so no offer could ever be
-- read, and therefore never accepted. The whole step was dead on arrival.
drop policy if exists "both sides read their own offer" on offers;
create policy "both sides read their own offer" on offers for select
  using (
    is_admin()
    or ((client_id = auth.uid() or talent_id = auth.uid())
        and state in ('sent', 'client_yes', 'talent_yes', 'accepted', 'declined'))
  );

-- Answering still runs through answer_offer(), which is security definer and
-- checks who is asking — so neither side can write to the row directly, and
-- neither can reach the other's rate. Reading is all this policy grants.

-- ---------- 3. Talent pay was write-only ----------
-- talent_pay is written by claim_pending and place_from_offer and read by
-- nothing. The bench still rendered a "Pay" column from a profiles column
-- that no longer exists, so it was blank for everyone.
drop view if exists bench_pay;
create view bench_pay with (security_invoker = true) as
select tp.talent_id, tp.rate_month, tp.currency, tp.updated_at
from talent_pay tp;
comment on view bench_pay is
  'Team-only by inheritance: talent_pay has a single is_admin() policy, and this view runs as its caller.';

-- One review per placement per period. Without this, saving a draft and then
-- sharing it created two reviews and the talent saw both.
delete from talent_feedback a using talent_feedback b
 where a.placement_id = b.placement_id and a.period = b.period and a.ctid > b.ctid;
create unique index if not exists feedback_one_per_period
  on talent_feedback(placement_id, period);

-- Two views nothing reads. Left behind by refactors; dropping them keeps the
-- schema honest about what is actually in use.
drop view if exists my_shortlist;
drop view if exists money_owed;

-- ============================================================
-- PART 12 — nothing reaches an executive without an approval
-- (safe to run on top of everything above)
-- ============================================================

-- Releasing a candidate is a deliberate act with a name on it. These three
-- columns turn "released = true" from a bare flag into a record: who approved
-- it, when, and the note the executive is shown alongside the person.
alter table matches add column if not exists release_note text;
alter table matches add column if not exists released_at  timestamptz;
alter table matches add column if not exists released_by  uuid references profiles(id) on delete set null;

comment on column matches.release_note is
  'Written by Relève when approving the release. The executive sees this — it is the only place we tell them, in our own words, why this person.';
comment on column matches.released_by is
  'Who approved the release. A release with no name against it should not exist.';

-- The read policy predated client_id. It only let an executive see a match by
-- joining searches through search_id — which is nullable now, so a match
-- created from the console (every real one) was invisible to the very person
-- it was released to. The release note would have been invisible with it.
drop policy if exists "read released matches" on matches;
create policy "read released matches" on matches for select using (
  is_admin()
  or (client_id = auth.uid() and released)
  or exists (select 1 from searches se
              where se.id = matches.search_id
                and se.client_id = auth.uid()
                and matches.released)
  or talent_id = auth.uid()
);

-- Stamp the approval in the database rather than trusting the app to do it,
-- and write it to the append-only log in the same breath. An unrelease is
-- logged too — taking someone back is as much a decision as sending them.
create or replace function stamp_release() returns trigger
language plpgsql security definer as $$
declare em text; changed boolean;
begin
  -- OLD is unassigned on an insert, so it can never be read unguarded here.
  -- A row that arrives already released counts as a release: the console
  -- upserts, so the first approval can be an insert rather than an update.
  changed := (tg_op = 'INSERT' and new.released)
          or (tg_op = 'UPDATE' and new.released is distinct from old.released);
  if changed then
    select email into em from profiles where id = auth.uid();
    if new.released then
      new.released_at := now();
      new.released_by := coalesce(new.released_by, auth.uid());
    end if;
    insert into audit_log (actor_id, actor_email, action, subject, subject_id, detail)
    values (auth.uid(), em,
            case when new.released then 'release' else 'unrelease' end,
            'matches', new.talent_id,
            jsonb_build_object('client_id', new.client_id,
                               'note', coalesce(new.release_note, '')));
  end if;
  return new;
end $$;

drop trigger if exists stamp_release_t on matches;
create trigger stamp_release_t before insert or update on matches
for each row execute function stamp_release();

-- The executive's own words, both ways. `note` already existed and was only
-- ever written on a decline; it is now written on an approval too, so this
-- comment is here to stop anyone pruning it as unused.
comment on column talent_decisions.note is
  'The executive''s own words about the candidate — written on an approval as well as a decline. Relève only.';
comment on column talent_decisions.reason is
  'Chosen from a fixed list. Required on a decline, absent on an approval.';

-- ============================================================
-- PART 13 — job postings and applications
-- (safe to run on top of everything above)
-- ============================================================

-- A role Relève is openly recruiting for. Written in the console, read by the
-- marketing site through a public endpoint. Nothing here is private: if a row
-- is 'open' it is meant to be on the internet.
create table if not exists job_posts (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- the URL: /careers/executive-assistant
  title       text not null,
  discipline  text,                          -- matches a key in lib/disciplines
  summary     text not null,                 -- one line, shown on the card
  about       text,                          -- the opening paragraph
  owns        text,                          -- what this person owns, one per line
  needs       text,                          -- what we are looking for, one per line
  hours       text,                          -- 'Full time · 9–5 PST overlap'
  location    text,                          -- 'Remote · Philippines'
  pay_note    text,                          -- optional and public. Blank shows nothing.
  state       text not null default 'draft' check (state in ('draft','open','closed')),
  sort        int not null default 0,        -- lower first
  opened_at   timestamptz,
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists job_posts_open on job_posts (state, sort, created_at desc);

alter table job_posts enable row level security;

-- The one deliberately public read in the whole schema. Anyone at all may
-- read an open posting; drafts and closed roles stay with the team.
drop policy if exists "open postings are public" on job_posts;
create policy "open postings are public" on job_posts for select
  using (state = 'open' or is_admin());
drop policy if exists "team writes postings" on job_posts;
create policy "team writes postings" on job_posts for all
  using (is_admin()) with check (is_admin());

-- Somebody applying to a posting. They are a stranger — no account, no
-- profile row, nothing verified. They become a talent record only when
-- Relève invites them.
create table if not exists job_applications (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid references job_posts(id) on delete set null,
  full_name    text not null,
  email        text not null,
  phone        text,
  location     text,
  timezone     text,
  years        int,
  links        text,                         -- LinkedIn, portfolio, whatever they send
  resume_path  text,                         -- inside the private 'applications' bucket
  resume_name  text,
  answers      jsonb not null default '{}',  -- the role-specific questions
  note         text,                         -- 'anything else you want us to know'
  heard_via    text,
  state        text not null default 'new'
               check (state in ('new','reviewing','invited','declined')),
  team_note    text,                         -- Relève only, never shown to them
  -- the unclaimed pending_people record created when Relève invites them.
  -- Not a profile: they have still never signed in at this point.
  invited_id   uuid references pending_people(id) on delete set null,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists job_applications_post on job_applications (post_id, created_at desc);
create index if not exists job_applications_state on job_applications (state, created_at desc);

alter table job_applications enable row level security;

-- Anyone may apply. Nobody but the team may read an application back, so a
-- stranger can write one row and learn nothing — not even that it worked,
-- beyond the API's own answer.
drop policy if exists "anyone may apply" on job_applications;
create policy "anyone may apply" on job_applications for insert
  with check (
    post_id is not null
    and exists (select 1 from job_posts p where p.id = post_id and p.state = 'open')
    and length(coalesce(full_name, '')) between 2 and 120
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and length(coalesce(note, '')) <= 4000
  );
drop policy if exists "team reads applications" on job_applications;
create policy "team reads applications" on job_applications for select using (is_admin());
drop policy if exists "team updates applications" on job_applications;
create policy "team updates applications" on job_applications for update
  using (is_admin()) with check (is_admin());
drop policy if exists "team deletes applications" on job_applications;
create policy "team deletes applications" on job_applications for delete using (is_admin());

-- Resumes. Private like the vetting store — a resume is somebody's address
-- and phone number, and it is never reachable by URL alone. The bucket's own
-- limits are the real defence here, because the writer is anonymous: 5MB, and
-- documents only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 5242880,
        array['application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

drop policy if exists "anyone may attach a resume" on storage.objects;
create policy "anyone may attach a resume" on storage.objects for insert
  with check (bucket_id = 'applications');
drop policy if exists "only the team reads resumes" on storage.objects;
create policy "only the team reads resumes" on storage.objects for select
  using (bucket_id = 'applications' and is_admin());
drop policy if exists "only the team removes resumes" on storage.objects;
create policy "only the team removes resumes" on storage.objects for delete
  using (bucket_id = 'applications' and is_admin());

-- Keep updated_at honest without the app having to remember.
create or replace function touch_job_post() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.state is distinct from old.state then
    if new.state = 'open'   then new.opened_at := now(); end if;
    if new.state = 'closed' then new.closed_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists touch_job_post_t on job_posts;
create trigger touch_job_post_t before update on job_posts
for each row execute function touch_job_post();

-- ============================================================
-- PART 14 — the assessment's last screen is saved like the rest
-- (safe to run on top of everything above)
-- ============================================================

-- The Conditions screen was read straight out of the DOM at submit time and
-- persisted nowhere. Pressing Back to re-check one answer silently wiped every
-- condition, and a dropped connection on the final submit lost them entirely —
-- at the end of a twenty-minute assessment. They now autosave like every other
-- answer, which needs somewhere to put them.
alter table signature_attempts add column if not exists conditions jsonb not null default '{}';

comment on column signature_attempts.conditions is
  'The final Conditions screen, saved as you go like the rest of the assessment. Not scored — checked against the other side at match time.';

-- ============================================================
-- PART 15 — a conversation before an account
-- (safe to run on top of everything above)
-- ============================================================

-- Applying used to lead straight to an invitation into the platform: a
-- stranger got an account, a twenty-minute assessment and a place on the
-- roster before anyone at Relève had heard their voice. The screening call
-- now sits in between, and it belongs to the application rather than to the
-- interviews table — an applicant has no profile yet, so there is nobody for
-- an interviews row to point at.
alter table job_applications add column if not exists call_state text not null default 'none'
  check (call_state in ('none','invited','held','no_show'));
alter table job_applications add column if not exists call_at      timestamptz;
alter table job_applications add column if not exists call_url     text;
alter table job_applications add column if not exists call_id      text;
alter table job_applications add column if not exists call_notes   text;   -- Relève only
alter table job_applications add column if not exists call_sent_at timestamptz;

comment on column job_applications.call_state is
  'The screening call: none, invited (a time has been sent), held, or no_show. An applicant is not invited into the platform until this reads held.';
comment on column job_applications.call_notes is
  'What was said on the call. Relève only — never shown to the applicant or to any executive.';

create index if not exists job_applications_call on job_applications (call_state, call_at);

-- The state list grows to match: an application now moves
-- new -> reviewing -> call booked -> held -> invited, or declined at any point.
alter table job_applications drop constraint if exists job_applications_state_check;
alter table job_applications add constraint job_applications_state_check
  check (state in ('new','reviewing','call_booked','call_held','invited','declined'));

-- ============================================================
-- PART 16 — the outbound half of the money chain
-- (safe to run on top of everything above)
-- ============================================================

-- ---------- 1. one unit, everywhere ----------
-- The schema's own rule is that money is stored in cents as integers, and
-- talent_pay was the single exception: dollars. place_from_offer converted on
-- the way in with integer division, quietly dropping the cents, and the first
-- margin calculation anyone wrote would have subtracted dollars from cents and
-- reported a hundredfold profit. Fix the unit before anything reads both.
alter table talent_pay add column if not exists rate_month_cents int;
update talent_pay set rate_month_cents = rate_month * 100
  where rate_month_cents is null and rate_month is not null;
comment on column talent_pay.rate_month is
  'Deprecated — dollars. Read rate_month_cents. Kept in step by a trigger until nothing reads it.';
comment on column talent_pay.rate_month_cents is
  'What Relève pays this person each month, in cents. Team only, in its own table because row level security cannot hide a column.';

-- Keep the old column true while anything still writes either one.
create or replace function sync_talent_pay() returns trigger
language plpgsql as $$
begin
  if new.rate_month_cents is distinct from coalesce(old.rate_month_cents, -1)
     and new.rate_month_cents is not null then
    new.rate_month := round(new.rate_month_cents / 100.0);
  elsif new.rate_month is distinct from coalesce(old.rate_month, -1)
     and new.rate_month is not null then
    new.rate_month_cents := new.rate_month * 100;
  end if;
  return new;
end $$;
drop trigger if exists sync_talent_pay_t on talent_pay;
create trigger sync_talent_pay_t before insert or update on talent_pay
for each row execute function sync_talent_pay();

-- ---------- 2. how an offshore contractor actually gets paid ----------
-- There was nowhere in the product to record this. Month one would have been
-- a series of WhatsApp messages asking people for their bank details.
create table if not exists talent_payout (
  talent_id     uuid primary key references profiles(id) on delete cascade,
  method        text not null check (method in ('wise','payoneer','bank','paypal','other')),
  beneficiary   text not null,               -- the name on the account
  country       text,                        -- where the money lands
  currency      text not null default 'USD',
  detail        text,                        -- account, IBAN, email — whatever the method needs
  note          text,                        -- anything the transfer needs to carry
  confirmed_at  timestamptz,                 -- Relève has checked these against their ID
  confirmed_by  uuid references profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);
comment on table talent_payout is
  'How Relève sends money to a placed contractor. Written by the person themselves, read by the team, and never by an executive.';

alter table talent_payout enable row level security;
drop policy if exists "own payout details" on talent_payout;
create policy "own payout details" on talent_payout for all
  using (talent_id = auth.uid() or is_admin())
  with check (talent_id = auth.uid() or is_admin());

-- Confirming somebody else's details is the team's job, not their own, in the
-- same shape as the vetting gate: you cannot approve yourself.
create or replace function guard_payout() returns trigger
language plpgsql security definer as $$
begin
  if new.confirmed_at is not null
     and (tg_op = 'INSERT' or old.confirmed_at is null)
     and not is_admin() then
    raise exception 'Payment details are confirmed by Relève, not by the person they belong to.';
  end if;
  if new.confirmed_at is not null and new.confirmed_by is null then
    new.confirmed_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_payout_t on talent_payout;
create trigger guard_payout_t before insert or update on talent_payout
for each row execute function guard_payout();

-- ---------- 3. proof that somebody was paid ----------
-- The platform recorded every invoice sent to a client and nothing at all
-- about money going out. A contractor asking "was I paid for October?" could
-- not be answered from the system.
create table if not exists talent_payments (
  id            uuid primary key default gen_random_uuid(),
  talent_id     uuid not null references profiles(id) on delete cascade,
  placement_id  uuid references placements(id) on delete set null,
  period_start  date not null,
  period_end    date not null,
  amount_cents  int not null,
  currency      text not null default 'USD',
  state         text not null default 'due' check (state in ('due','sent','failed')),
  method        text,
  reference     text,                        -- the transfer id, so a dispute has an answer
  sent_on       date,
  note          text,
  created_at    timestamptz not null default now(),
  unique (talent_id, period_start)
);
create index if not exists talent_payments_due on talent_payments (state, period_start desc);

alter table talent_payments enable row level security;
drop policy if exists "team runs payroll" on talent_payments;
create policy "team runs payroll" on talent_payments for all
  using (is_admin()) with check (is_admin());
-- Somebody may always see their own payment history. They may never see the
-- client rate, which lives in placement_terms and is not referenced here.
drop policy if exists "own payment history" on talent_payments;
create policy "own payment history" on talent_payments for select
  using (talent_id = auth.uid() or is_admin());

-- What the talent themselves may read about their own money: their rate and
-- their payments. Never the margin, never what the executive pays.
drop view if exists my_pay;
create view my_pay with (security_invoker = true) as
select tp.talent_id, tp.rate_month_cents, tp.currency, tp.updated_at
from talent_pay tp
where tp.talent_id = auth.uid();
comment on view my_pay is
  'A person''s own rate. security_invoker, and talent_pay has an admin-only policy — so this resolves for the team, and the separate own-row grant below is what lets the person themselves read it.';

drop policy if exists "own rate" on talent_pay;
create policy "own rate" on talent_pay for select
  using (talent_id = auth.uid() or is_admin());

-- ---------- 4. the month's payroll, mirroring the retainer run ----------
create or replace function pay_the_month(for_month date default current_date)
returns int language plpgsql security definer as $$
declare
  p_start date := date_trunc('month', for_month)::date;
  p_end   date := (date_trunc('month', for_month) + interval '1 month - 1 day')::date;
  made    int  := 0;
begin
  if not is_admin() then raise exception 'Relève team only'; end if;

  insert into talent_payments (talent_id, placement_id, period_start, period_end, amount_cents, currency)
  select pl.talent_id, pl.id, p_start, p_end, tp.rate_month_cents, coalesce(tp.currency, 'USD')
  from placements pl
  join talent_pay tp on tp.talent_id = pl.talent_id
  where tp.rate_month_cents is not null
    and pl.started_on <= p_end
    and (pl.ended_on is null or pl.ended_on >= p_start)
  on conflict (talent_id, period_start) do nothing;

  get diagnostics made = row_count;
  return made;
end $$;

-- ---------- 5. what Relève actually earns ----------
-- Both numbers existed and were deliberately never joined, so the founder
-- could not see profit anywhere: not per placement, not in total, not ever.
drop view if exists placement_margin;
create view placement_margin with (security_invoker = true) as
select
  pl.id            as placement_id,
  pl.client_id,
  pl.talent_id,
  pl.started_on,
  pl.ended_on,
  t.rate_month_cents                                   as client_pays_cents,
  tp.rate_month_cents                                  as talent_paid_cents,
  t.rate_month_cents - tp.rate_month_cents             as margin_cents
from placements pl
left join placement_terms t on t.placement_id = pl.id
left join talent_pay tp     on tp.talent_id   = pl.talent_id;
comment on view placement_margin is
  'Team only by inheritance: placement_terms and talent_pay are both admin-only, and this view runs as its caller. Never exposed to either side of a placement.';

-- ---------- 6. the deposit is credited, as the invoice itself promises ----------
alter table invoices add column if not exists credited_on date;
comment on column invoices.credited_on is
  'Set on a deposit invoice once it has been taken off a monthly retainer, so it can never be credited twice.';

alter table invoices drop constraint if exists invoices_kind_check;
alter table invoices add constraint invoices_kind_check
  check (kind in ('deposit','retainer','credit'));

-- Delivery is a fact of its own. "Sent" was a dropdown somebody set by hand,
-- and every draft counted as outstanding, overdue and grounds for suspension
-- from the day it was created.
alter table invoices add column if not exists sent_at timestamptz;
comment on column invoices.sent_at is
  'When the invoice actually left the building. Distinct from status, which is what somebody said.';

-- ---------- 7. the retainer run, corrected ----------
-- Three faults, all of which bill a real person the wrong amount on the wrong
-- day: the deposit was promised as a credit and never applied; a placement
-- starting on the 28th was billed a full month dated the 1st, arriving
-- twenty-nine days overdue; and every invoice landed as a draft that the
-- console immediately counted as unpaid and suspendable.
create or replace function issue_monthly_retainers(for_month date default current_date)
returns int language plpgsql security definer as $$
declare
  p_start date := date_trunc('month', for_month)::date;
  p_end   date := (date_trunc('month', for_month) + interval '1 month - 1 day')::date;
  billing date := first_monday(for_month);
  made    int  := 0;
  r       record;
  dep     record;
  issued  date;
begin
  if not is_admin() then
    raise exception 'only Releve may issue invoices';
  end if;

  for r in
    select pl.id, pl.client_id, pl.started_on, t.rate_month_cents
    from placements pl
    join placement_terms t on t.placement_id = pl.id
    where t.rate_month_cents is not null
      and pl.started_on <= p_end
      -- still running, or ended inside this month, or still inside the
      -- three-month commitment: all of those are payable.
      and (pl.ended_on is null
           or pl.ended_on >= p_start
           or minimum_term_ends(t, pl.started_on) >= p_start)
      and not exists (
        select 1 from invoices i
        where i.placement_id = pl.id and i.kind = 'retainer' and i.period_start = p_start)
  loop
    -- Never dated before the work began. A placement that starts mid-month is
    -- billed from its start date, not back-dated to the first Monday.
    issued := greatest(billing, r.started_on);

    insert into invoices (client_id, placement_id, kind, period_start, period_end,
                          amount_cents, issued_on, due_on, status, note)
    values (r.client_id, r.id, 'retainer', p_start, p_end,
            r.rate_month_cents, issued, issued, 'draft', 'Monthly retainer');
    made := made + 1;

    -- The deposit invoice says, in its own note, that it is credited against
    -- the first monthly invoice. Nothing had ever done that, so every client
    -- was going to be charged the same $500 twice.
    select i.id, i.amount_cents into dep
    from invoices i
    where i.client_id = r.client_id
      and i.kind = 'deposit'
      and i.status = 'paid'
      and i.credited_on is null
    order by i.issued_on
    limit 1;

    if found then
      insert into invoices (client_id, placement_id, kind, period_start, period_end,
                            amount_cents, issued_on, due_on, status, note)
      values (r.client_id, r.id, 'credit', p_start, p_end,
              -dep.amount_cents, issued, issued, 'draft',
              'Search deposit, credited as promised');
      update invoices set credited_on = issued where id = dep.id;
      made := made + 1;
    end if;
  end loop;

  return made;
end $$;

-- The whole month's payroll and billing, for a scheduled task rather than a
-- button somebody has to remember on the first Monday. Returns both counts.
create or replace function run_the_month(for_month date default current_date)
returns jsonb language plpgsql security definer as $$
declare inv int; pay int;
begin
  if not is_admin() then raise exception 'Relève team only'; end if;
  inv := issue_monthly_retainers(for_month);
  pay := pay_the_month(for_month);
  return jsonb_build_object('invoices', inv, 'payments', pay);
end $$;

-- ---------- 8. the agreement is a signature, not a file that appeared ----------
alter table vetting add column if not exists signed_on date;
alter table vetting add column if not exists agreement_version text;
comment on column vetting.signed_on is
  'The date on the signature itself. Filing a PDF used to verify the person outright; an unsigned draft cleared them just as well as a signed one.';

-- ---------- 9. a replacement discharges the guarantee it replaces ----------
-- replaces_id existed and nothing ever wrote to it, so every guaranteed
-- ending stayed on the owed list for good and the list became noise.
comment on column placements.replaces_id is
  'The placement this one replaces. Writing it is what settles a replacement guarantee — care.ts reads exactly this.';


-- ============================================================
-- PART 17 — the things that were failing quietly
-- (safe to run on top of everything above)
-- ============================================================

-- ---------- 1. an email that did not arrive leaves a trace ----------
-- Twenty places in this app send mail. Every one called send(), which caught
-- its own failure and returned false, and almost every caller ignored the
-- return value. So a page said "Sent" whether or not anything left the
-- building, and the first anyone knew was a person saying they never got it.
-- The fix is not to make send() throw — losing a notification is a nuisance,
-- losing the request that triggered it is a bug — but to write down what
-- happened, so the console can say so out loud.
create table if not exists email_log (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,                  -- which template, e.g. 'applicationReceived'
  to_addr    text not null,
  subject    text not null,
  ok         boolean not null,
  detail     text,                           -- the mail host's own words on a failure
  sent_at    timestamptz not null default now()
);
comment on table email_log is
  'One row per attempted send, successful or not. The only evidence that email works. Never written to by the client — log_email() is the single door.';
create index if not exists email_log_recent on email_log(sent_at desc);
create index if not exists email_log_failed on email_log(sent_at desc) where not ok;

alter table email_log enable row level security;
-- Nobody reads this but Relève, and nobody writes to it directly at all:
-- the write goes through log_email() below, which runs as the definer so an
-- applicant with no account can still leave a trace.
drop policy if exists "team reads the email log" on email_log;
create policy "team reads the email log" on email_log for select
  using (is_admin());

create or replace function log_email(
  p_kind text, p_to text, p_subject text, p_ok boolean, p_detail text default null
) returns void language plpgsql security definer as $$
begin
  insert into email_log (kind, to_addr, subject, ok, detail)
  values (p_kind, p_to, left(p_subject, 300), p_ok, left(p_detail, 2000));
end $$;
comment on function log_email is
  'Records one send attempt. Security definer because /api/apply sends to an applicant who is not signed in — the row must exist even then.';
grant execute on function log_email(text, text, text, boolean, text) to anon, authenticated;

-- What the console asks: has anything failed lately, and when did anything
-- last succeed. A platform where the second answer is "never" is not launched.
create or replace view email_health with (security_invoker = true) as
select
  count(*) filter (where not ok and sent_at > now() - interval '7 days')  as failed_week,
  count(*) filter (where ok      and sent_at > now() - interval '7 days')  as sent_week,
  max(sent_at) filter (where ok)     as last_success,
  max(sent_at) filter (where not ok) as last_failure
from email_log;
comment on view email_health is
  'Read by the console Overview. security_invoker, so it obeys email_log''s own policy and only Relève sees it.';

-- ---------- 2. the executive signs their name ----------
-- Talent sign an agreement with a recorded signature, a version and a date.
-- The executive ticked a box. A tick is enough to form a contract in most
-- places and nowhere near enough to enforce one comfortably, which matters
-- most for the non-circumvention clause — the one protecting the whole
-- business model and the one most likely to be tested.
alter table terms_acceptances add column if not exists signed_name text;
comment on column terms_acceptances.signed_name is
  'What the person typed as their signature. Null on the older tick-box rows, which is itself the record that they only ticked.';

-- 'services_agreement' is a third document so the lawyer's text, when it
-- exists, has somewhere to land without another migration.
alter table terms_acceptances drop constraint if exists terms_acceptances_document_check;
alter table terms_acceptances add constraint terms_acceptances_document_check
  check (document in ('terms', 'privacy', 'services_agreement'));

-- ---------- 3. tax residency, without ever storing a number ----------
-- Paying someone outside the United States who is not a US person generally
-- needs a W-8BEN on file first. The app collected nothing, so the answer would
-- have been discovered during the first payout run rather than before it.
-- This records the declaration and whether the form is held. It deliberately
-- stores no tax identification number of any kind — same rule as identity
-- documents, and for the same reason.
alter table talent_payout add column if not exists tax_residence text;
alter table talent_payout add column if not exists us_person boolean;
alter table talent_payout add column if not exists tax_form_on_file boolean not null default false;
alter table talent_payout add column if not exists tax_form_signed_on date;
comment on column talent_payout.tax_residence is
  'Country of tax residence, as the person states it. Not evidence — a declaration.';
comment on column talent_payout.us_person is
  'Their own answer to whether they are a US person for tax purposes. Decides whether a W-8BEN is wanted at all.';
comment on column talent_payout.tax_form_on_file is
  'Set by Relève once the signed form is actually held. Never set by the person themselves.';

-- Who is payable and who is not, in one place, so the payroll desk can refuse
-- to pay someone whose paperwork is missing rather than discovering it later.
create or replace view payout_readiness with (security_invoker = true) as
select
  tp.talent_id,
  tp.method,
  tp.beneficiary,
  tp.tax_residence,
  tp.us_person,
  tp.tax_form_on_file,
  (tp.method is not null and btrim(coalesce(tp.beneficiary, '')) <> '')          as has_method,
  (tp.us_person is true or tp.tax_form_on_file)                                   as tax_clear,
  (tp.method is not null and btrim(coalesce(tp.beneficiary, '')) <> ''
     and (tp.us_person is true or tp.tax_form_on_file))                           as payable
from talent_payout tp;
comment on view payout_readiness is
  'security_invoker, so it inherits talent_payout''s policy: a person sees only their own row, Relève sees all of them.';

-- ---------- 4. somebody has to ask the executive ----------
-- The talent are asked every Friday. The executive was asked never — the
-- monthly pulse existed and nothing prompted it, so the only client news that
-- ever reached Relève was a cancellation. This is the query behind that nudge.
create or replace function pulse_due(for_month date default current_date)
returns table (placement_id uuid, client_id uuid, month_of date)
language sql stable security definer as $$
  select p.id, p.client_id, date_trunc('month', for_month)::date
  from placements p
  where p.ended_on is null
    and p.started_on <= for_month
    -- not in their first fortnight: asking how it is going on day three is noise
    and p.started_on <= for_month - interval '14 days'
    and not exists (
      select 1 from client_pulse cp
      where cp.placement_id = p.id
        and cp.month_of = date_trunc('month', for_month)::date
    );
$$;
comment on function pulse_due is
  'Live placements past their first fortnight with no pulse filed this month. Security definer so the scheduled task can read across every client.';


-- ============================================================
-- PART 18 — hiring is a stage, not the whole account
-- (safe to run on top of everything above)
-- ============================================================

-- ---------- 1. a search can be finished ----------
-- searches.stage held a label the console typed by hand and nothing ever
-- read: accept_offer and createPlacement both made a placement without
-- touching it, so every executive who had ever hired was still, as far as the
-- app knew, mid-search. That is why their account kept showing candidate
-- screens after the person had started.
--
-- closed_at is the fact rather than the label. The interface asks one
-- question of it: is this executive hiring right now.
alter table searches add column if not exists closed_at timestamptz;
alter table searches add column if not exists closed_reason text
  check (closed_reason is null or closed_reason in ('placed', 'withdrawn', 'on_hold'));
comment on column searches.closed_at is
  'When the search stopped being live. Null means hiring, and the executive sees candidate and interview screens. Set automatically the moment a placement begins.';

-- ---------- 2. a placement remembers the search that produced it ----------
-- Only offers carried the link, and only until the offer was archived. With
-- one search per client that is recoverable by hand; with two it is not, so
-- the column goes in now while there is nothing to backfill wrongly.
alter table placements add column if not exists search_id uuid references searches(id) on delete set null;
create index if not exists placements_search_idx on placements(search_id);
comment on column placements.search_id is
  'The search this placement came out of. Written by close_search_on_placement below.';

-- ---------- 3. hiring ends when someone starts ----------
-- Every path that creates a placement goes through this, rather than each
-- caller remembering: accept_offer, createPlacement in the console, and
-- anything added later.
create or replace function close_search_on_placement() returns trigger
language plpgsql security definer as $$
declare s_id uuid;
begin
  select se.id into s_id
  from searches se
  where se.client_id = new.client_id and se.closed_at is null
  limit 1;

  if found then
    if new.search_id is null then
      new.search_id := s_id;
    end if;
    update searches
      set closed_at = now(), closed_reason = 'placed', stage = 'Placed'
      where id = s_id;
  end if;
  return new;
end $$;
comment on function close_search_on_placement is
  'Closes the executive''s open search when a placement begins, and records which search it was. Reopening is deliberate: the console clears closed_at to start hiring again.';

drop trigger if exists close_search_on_placement_t on placements;
create trigger close_search_on_placement_t before insert on placements
for each row execute function close_search_on_placement();

-- Anything already placed was left mid-search by the old behaviour. Close
-- those now, so an existing executive sees the right account immediately
-- rather than after their next hire.
update searches se
  set closed_at = coalesce(se.closed_at, now()),
      closed_reason = coalesce(se.closed_reason, 'placed')
where se.closed_at is null
  and exists (
    select 1 from placements p
    where p.client_id = se.client_id and p.ended_on is null
  );

-- ---------- 4. the role brief belongs to a search ----------
-- role_breakdown is keyed by executive, one row for ever, so a second search
-- would silently overwrite the first one's requirements. The key does not
-- change today — every existing read still works — but the column goes in and
-- is kept true, so making it per-search later is a change rather than a
-- rewrite.
alter table role_breakdown add column if not exists search_id uuid references searches(id) on delete set null;
create index if not exists role_breakdown_search_idx on role_breakdown(search_id);
comment on column role_breakdown.search_id is
  'Which search these requirements describe. Nullable while an executive has only ever had one; read it, do not assume client_id, in anything written from here on.';

update role_breakdown rb
  set search_id = se.id
from searches se
where se.client_id = rb.client_id and rb.search_id is null;

-- Keep it true for rows written from now on, without asking every caller.
create or replace function stamp_role_search() returns trigger
language plpgsql as $$
begin
  if new.search_id is null then
    select se.id into new.search_id
    from searches se
    where se.client_id = new.client_id
    order by se.closed_at nulls first, se.opened_at desc
    limit 1;
  end if;
  return new;
end $$;
drop trigger if exists stamp_role_search_t on role_breakdown;
create trigger stamp_role_search_t before insert or update on role_breakdown
for each row execute function stamp_role_search();

-- ---------- 5. what the account should be showing ----------
-- One question, answered in the database, so the navigation, the dashboard
-- and the console can never disagree about which stage someone is in.
create or replace view executive_stage with (security_invoker = true) as
select
  p.id as client_id,
  (select count(*) from placements pl
    where pl.client_id = p.id and pl.ended_on is null)            as live_placements,
  exists (select 1 from searches se
    where se.client_id = p.id and se.closed_at is null)           as hiring
from profiles p
where p.role = 'client';
comment on view executive_stage is
  'security_invoker, so an executive sees only their own row. hiring drives which screens exist; live_placements drives what the account is mostly about.';


-- ============================================================
-- PART 19 — money actually moving
-- (safe to run on top of everything above)
-- ============================================================

-- ---------- 1. status has to cover money in flight ----------
-- Bank debit is not a card: it is accepted, then clears days later, and can
-- still fail after being accepted. Without a state for that, the moment a
-- charge was submitted the invoice had to be called either unpaid, which
-- means it keeps appearing on the chase list and gets charged twice, or paid,
-- which is a lie until the money lands.
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('draft', 'sent', 'processing', 'paid', 'failed', 'void'));
comment on column invoices.status is
  'processing = submitted to the bank and not yet cleared. Only the Stripe webhook moves an invoice to paid or failed; nothing in the interface may.';

alter table invoices add column if not exists stripe_payment_intent text;
alter table invoices add column if not exists charged_at timestamptz;
alter table invoices add column if not exists failure_reason text;
create unique index if not exists invoices_payment_intent_uniq
  on invoices(stripe_payment_intent) where stripe_payment_intent is not null;
comment on column invoices.stripe_payment_intent is
  'The charge against this invoice. Unique, so a retry that reuses an intent cannot attach it to a second invoice.';

-- ---------- 2. how an executive pays ----------
-- Its own table rather than columns on profiles, for the same reason pay is:
-- row level security works per row, so a shared table is a leak waiting for
-- someone to write a careless query.
create table if not exists billing_accounts (
  client_id        uuid primary key references profiles(id) on delete cascade,
  stripe_customer  text unique,
  payment_method   text,                        -- pm_... the saved mandate
  method_kind      text check (method_kind is null or method_kind in ('us_bank_account', 'card')),
  bank_name        text,                        -- "Chase" — shown back to them, never account numbers
  last4            text,
  mandate_ok       boolean not null default false,
  set_up_at        timestamptz,
  updated_at       timestamptz not null default now()
);
comment on table billing_accounts is
  'One row per executive. Stores Stripe references and the last four digits only — never an account or routing number, the same rule as identity documents.';

alter table billing_accounts enable row level security;
drop policy if exists "client reads own billing account" on billing_accounts;
create policy "client reads own billing account" on billing_accounts for select
  using (client_id = auth.uid() or is_admin());
-- Deliberately no insert or update policy for the client: everything on this
-- row comes from Stripe through the webhook, which runs with the service key.
-- A client who could write here could mark their own mandate good.
drop policy if exists "team writes billing accounts" on billing_accounts;
create policy "team writes billing accounts" on billing_accounts for all
  using (is_admin()) with check (is_admin());

-- ---------- 3. a webhook may arrive twice ----------
-- Stripe retries until it gets a 200, and will happily deliver the same event
-- again after a timeout. Without this, one payment could mark an invoice paid,
-- write a second payment row, and email the client twice.
create table if not exists stripe_events (
  id           text primary key,               -- evt_... Stripe's own id
  type         text not null,
  handled_at   timestamptz not null default now(),
  summary      text
);
comment on table stripe_events is
  'Every webhook Stripe has delivered, keyed by its own id. The primary key is the idempotency: a repeat insert fails and the handler stops.';
alter table stripe_events enable row level security;
drop policy if exists "team reads stripe events" on stripe_events;
create policy "team reads stripe events" on stripe_events for select using (is_admin());

-- ---------- 4. what is chargeable ----------
-- An invoice may be charged when it has been issued, is not already paid or in
-- flight, and the executive has a mandate on file. Answered here so the
-- console, the charge endpoint and any future scheduled run cannot disagree.
create or replace view chargeable_invoices with (security_invoker = true) as
select
  i.id, i.number, i.client_id, i.kind, i.amount_cents, i.issued_on, i.due_on, i.status,
  p.full_name as client_name,
  b.payment_method, b.method_kind, b.bank_name, b.last4,
  (b.payment_method is not null and b.mandate_ok
     and i.status in ('draft', 'sent', 'failed')
     and i.amount_cents > 0)                                    as chargeable
from invoices i
join profiles p on p.id = i.client_id
left join billing_accounts b on b.client_id = i.client_id
where i.status in ('draft', 'sent', 'failed', 'processing');
comment on view chargeable_invoices is
  'security_invoker, so it inherits the invoice policy: an executive sees only their own, Relève sees all. A credit note has a negative amount and is never chargeable.';

-- ============================================================
-- PART 20 — paying the deposit before the account exists
-- (safe to run on top of everything above)
-- ============================================================

-- ---------- 1. a receipt for money that arrived early ----------
-- The onboarding email's deposit link can be paid the day it lands, which is
-- routinely before the person has signed in even once — invoices.client_id
-- is not null, so there is nowhere yet to record it as one. The webhook
-- marks the search paid directly; this is what lets that payment be found
-- again once an invoice can finally be written for it.
alter table searches add column if not exists deposit_payment_intent text;
comment on column searches.deposit_payment_intent is
  'The Stripe payment_intent that cleared this deposit. Set by the webhook the moment it clears, whether or not an account exists yet to hang an invoice off of.';

-- ---------- 2. that receipt becomes a real invoice, the moment it can ----------
-- claim_pending() moves client_id onto the search the instant someone signs
-- in with the matching email. If the deposit was already paid by then, this
-- is what stops it from sitting invisible on their Billing page forever —
-- their receipt is the same paid-and-dated invoice it would have been had
-- they signed in before paying.
create or replace function backfill_deposit_invoice() returns trigger
language plpgsql security definer as $$
begin
  if new.client_id is not null and old.client_id is null
     and new.deposit_status = 'paid' then
    insert into invoices (client_id, search_id, kind, amount_cents,
                          issued_on, due_on, status, paid_on,
                          stripe_payment_intent, note)
    select new.client_id, new.id, 'deposit', new.deposit_cents,
           coalesce(new.deposit_paid_on, current_date), coalesce(new.deposit_paid_on, current_date),
           'paid', new.deposit_paid_on, new.deposit_payment_intent,
           'Search deposit. Paid before the account existed, via the onboarding email.'
    where not exists (
      select 1 from invoices where search_id = new.id and kind = 'deposit'
    );
  end if;
  return new;
end $$;

drop trigger if exists backfill_deposit_invoice_t on searches;
create trigger backfill_deposit_invoice_t after update of client_id on searches
for each row execute function backfill_deposit_invoice();

-- ============================================================
-- PART 21 — nobody becomes a client by guessing
-- (safe to run on top of everything above)
-- ============================================================

-- guard_profile_edit (PART 7) let a brand-new, uninvited sign-in pick
-- either side for itself. talent self-applying is the front door; a
-- stranger picking "client" and landing on an executive's dashboard with
-- no discovery call, no sales conversation and no pending_people record
-- behind them never was. A real executive never reaches this choice at
-- all — claim_pending() already set their role and role_chosen_at the
-- moment they signed in with the email Relève added on their behalf,
-- which is what assigned_by_releve records. So the only self-chosen role
-- left is talent; a would-be client is told to book a call instead of
-- being silently ignored, which is what a bare "role reverted" used to do.
create or replace function guard_profile_edit() returns trigger language plpgsql as $$
declare i_am_admin boolean;
begin
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') into i_am_admin;

  if auth.uid() = new.id and not i_am_admin then
    new.stage      := old.stage;        -- the team owns the pipeline stage
    new.assigned_by_releve := old.assigned_by_releve;

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

-- ============================================================
-- PART 22 — the first fortnight is a status, not a form
-- (safe to run on top of everything above)
-- ============================================================

-- "placement ticks onboarding" let either side tick their own steps —
-- meant as a shared checklist, it let a step get marked done to look tidy
-- rather than because it happened, with nobody else positioned to catch it.
-- Dropping it leaves "team writes onboarding" (is_admin()) as the only
-- write path: the console ticks, both sides watch. "placement sees
-- onboarding" (select) is untouched — nobody loses visibility, only the
-- ability to edit their own record of it.
drop policy if exists "placement ticks onboarding" on onboarding_steps;

-- ============================================================
-- PART 23 — the inbox stops losing quiet threads, and stops trusting
-- the room it was overheard in
-- (safe to run on top of everything above)
-- ============================================================

-- "mark thread read" let a client or talent update rows in their own
-- thread, not just read_at — the app itself never calls this from that
-- side (markThreadRead only ever runs for an admin session), so the clause
-- had no legitimate use and only meant a client's own Supabase session
-- could rewrite any column of any message in their thread, staff-authored
-- ones included: the body, from_team, even who it claims to be from.
-- Read stays as it was — a client still sees their own thread — only the
-- ability to write to it directly (outside of sending a new message,
-- covered by "write to own thread") is removed.
drop policy if exists "mark thread read" on messages;
create policy "mark thread read" on messages for update
  using (is_admin())
  with check (is_admin());

-- listThreads() used to read the 400 most recent messages across every
-- conversation combined and group them in JavaScript — fine at low volume,
-- but that cap is global, not per thread. Once real message volume passes
-- it, a thread that has gone quiet (its own latest message older than the
-- 400th most recent message system-wide) drops out of the inbox entirely,
-- unread and all, with nothing on screen to say it happened.
--
-- This aggregates per subject_id in the database instead, so every thread
-- with any message at all gets exactly one row back, no matter how many
-- messages — or how many other threads — exist. Deliberately not declared
-- security definer, so it runs as the calling user and row level security
-- on messages applies exactly as a normal select would: an admin sees
-- every thread, and anyone else gets rows only for their own subject_id
-- (which "read own thread" already permits, and which has no use for a
-- full inbox listing — the app never calls this for a non-admin).
create or replace function message_threads()
returns table (subject_id uuid, last text, last_at timestamptz, waiting boolean, unread int)
language sql stable as $$
  select
    m.subject_id,
    (array_agg(m.body order by m.created_at desc))[1] as last,
    max(m.created_at) as last_at,
    -- their last word — Relève owes a reply
    not (array_agg(m.from_team order by m.created_at desc))[1] as waiting,
    -- read_at is only ever set by markThreadRead(), the instant the console
    -- actually opens a thread, so this is a true not-yet-looked-at tally.
    count(*) filter (where not m.from_team and m.read_at is null)::int as unread
  from messages m
  where m.placement_id is null
  group by m.subject_id;
$$;

-- ============================================================
-- PART 24 — a direct line between a client and the talent they're
-- paired with, alongside the existing line to Relève
-- (safe to run on top of everything above)
-- ============================================================

-- Same table, a second way to address a row. subject_id keeps meaning what
-- it always has (a person's thread with their Success Manager); a message
-- with placement_id set instead is the client and talent on that placement
-- writing to each other. Exactly one of the two is ever set.
alter table messages add column if not exists placement_id uuid references placements(id) on delete cascade;
alter table messages alter column subject_id drop not null;

do $$ begin
  alter table messages add constraint messages_target_chk check (
    (subject_id is not null and placement_id is null) or
    (subject_id is null and placement_id is not null)
  );
exception when duplicate_object then null;
end $$;

create index if not exists messages_placement_idx on messages (placement_id, created_at desc);

-- read: your own Relève thread, either side of a placement you're on, or admin
drop policy if exists "read own thread" on messages;
create policy "read own thread" on messages for select
  using (
    subject_id = auth.uid()
    or (placement_id is not null and in_placement(placement_id))
    or is_admin()
  );

-- write: your own Relève thread, either side of a placement you're on
-- (as yourself, never posing as the other person), or admin posting into
-- either — a team member writing into a placement thread is Relève
-- stepping in, which the app marks from_team = true so it reads as "Relève"
-- rather than pretending to be whichever side happened to be signed in.
drop policy if exists "write to own thread" on messages;
create policy "write to own thread" on messages for insert
  with check (
    is_admin()
    or (subject_id = auth.uid() and sender_id = auth.uid() and from_team = false)
    or (placement_id is not null and in_placement(placement_id) and sender_id = auth.uid() and from_team = false)
  );

-- ============================================================
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
drop policy if exists "own watch attempts read" on taking_the_watch_attempts;
drop policy if exists "own watch attempts insert" on taking_the_watch_attempts;
drop policy if exists "own watch attempts update while open" on taking_the_watch_attempts;
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
drop policy if exists "own watch tasks read" on taking_the_watch_tasks;
drop policy if exists "own watch tasks write while open" on taking_the_watch_tasks;
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
create view talent_directory with (security_invoker = true) as
select
  p.id, p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.stage, p.photo_url, p.intro_video_url,
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

-- ============================================================
-- DOCUSIGN, 11 September 2026
-- Sends and files the talent contractor agreement + NDA the same way
-- IssueAgreement already does by hand — DocuSign's webhook is the only new
-- thing trusted to mark one verified. Gracefully unused until
-- DOCUSIGN_* environment variables exist in Netlify.
-- ============================================================

-- Correlates a DocuSign envelope back to the vetting row it belongs to.
alter table vetting add column if not exists envelope_id text;
create unique index if not exists vetting_envelope_idx on vetting (envelope_id) where envelope_id is not null;

-- Every DocuSign Connect delivery. DocuSign does not hand back one clean
-- global id the way Stripe does, so the (envelope_id, status) pair is the
-- idempotency key instead — mirrors stripe_events.
create table if not exists docusign_events (
  envelope_id  text not null,
  status       text not null,
  handled_at   timestamptz not null default now(),
  primary key (envelope_id, status)
);
comment on table docusign_events is
  'Every DocuSign Connect delivery. The (envelope_id, status) pair is the idempotency: a repeat insert fails and the handler stops.';
alter table docusign_events enable row level security;
drop policy if exists "team reads docusign events" on docusign_events;
create policy "team reads docusign events" on docusign_events for select using (is_admin());

-- guard_vetting() only ever blocked a signed-in NON-admin from marking their
-- own paperwork complete (is_admin() reading false for their own session).
-- The DocuSign webhook runs with the service role, which is not signed in
-- as anybody at all — auth.uid() reads null there, exactly the same as
-- every cron job already relies on. Widening the guard to only fire when
-- someone IS signed in and isn't Relève keeps blocking real self-verification
-- while letting a trusted backend call (one that already required the
-- service-role key, which never leaves Netlify) through.
create or replace function guard_vetting() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not is_admin() then
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


-- ============================================================
-- LAUNCH AUDIT, 11 September 2026
-- A full pass over every screen, route and policy before Monday's launch.
-- Everything here is a fix for something found broken, not a feature.
-- ============================================================

-- ---------- 1. the executive can actually see the person released to them ----------
-- The signatures read policy still identified the executive through
-- matches.search_id, which has been nullable since the console started making
-- matches by hand — every real match row carries client_id and no search_id.
-- talent_directory joins signatures, so with no readable signature the
-- released candidate vanished from the executive's pipeline entirely, while
-- the console showed them released and the email had already promised a name.
-- Same shape as the matches policy that was fixed for this exact reason.
drop policy if exists "read own signature" on signatures;
create policy "read own signature" on signatures for select using (
  user_id = auth.uid()
  or is_admin()
  or exists (
    select 1 from matches m
    where m.talent_id = signatures.user_id
      and m.released
      and (m.client_id = auth.uid()
           or exists (select 1 from searches se
                      where se.id = m.search_id and se.client_id = auth.uid()))
  )
);

-- ---------- 2. finishing onboarding no longer removes a talent from matching ----------
-- talent_directory required a cleared Taking The Watch the moment a talent
-- claimed a discipline. Breaking down your skills is a critical step of their
-- own checklist, so completing it made them disappear from every ranking and
-- from the executive's pipeline until a Watch attempt was scored — which no
-- checklist ever asked them to take. The Watch stays a real gate: it is now a
-- column the console reads and enforces at release time, with the reason on
-- screen, rather than a silent filter on the directory itself.
drop view if exists talent_directory;
create view talent_directory with (security_invoker = true) as
select
  p.id, p.full_name as name, p.headline as role, p.location as loc, p.timezone as tz,
  p.years_exp as yrs, p.english as eng, p.stage, p.photo_url, p.intro_video_url,
  s.scores, s.facets, s.validity, s.confidence, s.conditions as cond,
  coalesce((select jsonb_array_length(sp.disciplines) from skills_profile sp
             where sp.talent_id = p.id), 0) > 0                          as has_disciplines,
  exists (select 1 from talent_verification_badges b
           where b.talent_id = p.id and b.verified_through_taking_the_watch) as watch_cleared
from profiles p
join signatures s on s.user_id = p.id and s.side = 'talent'
where p.role = 'talent';

-- ---------- 3. the scheduled month can actually run ----------
-- All three money functions refused anyone who was not is_admin(). The
-- scheduled task calls them with the service role, where auth.uid() is null,
-- so the monthly run raised 'Relève team only' every time and nothing was
-- ever issued or paid unless somebody pressed the console button. The
-- service role is recognised by its own JWT role claim — never by a null
-- uid, which an anonymous caller would share.
create or replace function is_team_or_service() returns boolean
language sql stable as $$
  select is_admin() or coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function pay_the_month(for_month date default current_date)
returns int language plpgsql security definer as $$
declare
  p_start date := date_trunc('month', for_month)::date;
  p_end   date := (date_trunc('month', for_month) + interval '1 month - 1 day')::date;
  made    int  := 0;
begin
  if not is_team_or_service() then raise exception 'Relève team only'; end if;

  insert into talent_payments (talent_id, placement_id, period_start, period_end, amount_cents, currency)
  select pl.talent_id, pl.id, p_start, p_end, tp.rate_month_cents, coalesce(tp.currency, 'USD')
  from placements pl
  join talent_pay tp on tp.talent_id = pl.talent_id
  where tp.rate_month_cents is not null
    and pl.started_on <= p_end
    and (pl.ended_on is null or pl.ended_on >= p_start)
  on conflict (talent_id, period_start) do nothing;

  get diagnostics made = row_count;
  return made;
end $$;

create or replace function issue_monthly_retainers(for_month date default current_date)
returns int language plpgsql security definer as $$
declare
  p_start date := date_trunc('month', for_month)::date;
  p_end   date := (date_trunc('month', for_month) + interval '1 month - 1 day')::date;
  billing date := first_monday(for_month);
  made    int  := 0;
  r       record;
  dep     record;
  issued  date;
begin
  if not is_team_or_service() then
    raise exception 'only Releve may issue invoices';
  end if;

  for r in
    select pl.id, pl.client_id, pl.started_on, t.rate_month_cents
    from placements pl
    join placement_terms t on t.placement_id = pl.id
    where t.rate_month_cents is not null
      and pl.started_on <= p_end
      and (pl.ended_on is null
           or pl.ended_on >= p_start
           or minimum_term_ends(t, pl.started_on) >= p_start)
      and not exists (
        select 1 from invoices i
        where i.placement_id = pl.id and i.kind = 'retainer' and i.period_start = p_start)
  loop
    issued := greatest(billing, r.started_on);

    insert into invoices (client_id, placement_id, kind, period_start, period_end,
                          amount_cents, issued_on, due_on, status, note)
    values (r.client_id, r.id, 'retainer', p_start, p_end,
            r.rate_month_cents, issued, issued, 'draft', 'Monthly retainer');
    made := made + 1;

    select i.id, i.amount_cents into dep
    from invoices i
    where i.client_id = r.client_id
      and i.kind = 'deposit'
      and i.status = 'paid'
      and i.credited_on is null
    order by i.issued_on
    limit 1;

    if found then
      insert into invoices (client_id, placement_id, kind, period_start, period_end,
                            amount_cents, issued_on, due_on, status, note)
      values (r.client_id, r.id, 'credit', p_start, p_end,
              -dep.amount_cents, issued, issued, 'draft',
              'Search deposit, credited as promised');
      update invoices set credited_on = issued where id = dep.id;
      made := made + 1;
    end if;
  end loop;

  return made;
end $$;

create or replace function run_the_month(for_month date default current_date)
returns jsonb language plpgsql security definer as $$
declare inv int; pay int;
begin
  if not is_team_or_service() then raise exception 'Relève team only'; end if;
  inv := issue_monthly_retainers(for_month);
  pay := pay_the_month(for_month);
  return jsonb_build_object('invoices', inv, 'payments', pay);
end $$;

-- ---------- 4. "tell the Relève team" reaches the Relève team ----------
-- teamEmails() read profiles through the caller's own session. A talent, an
-- executive or an anonymous applicant can see no admin row, so every email
-- addressed to the team — a new application, a flagged check-in, an
-- executive's approval, a message to their manager — went to an empty list
-- and reported success. The team's own addresses are not a secret from the
-- people writing to it.
create or replace function team_emails() returns setof text
language sql stable security definer as $$
  select email from profiles where role = 'admin' and email is not null;
$$;
revoke all on function team_emails() from public;
grant execute on function team_emails() to anon, authenticated, service_role;

-- ---------- 5. talent can say they have read their feedback ----------
-- The only write policy on talent_feedback is the team's, so the talent's
-- "mark as seen" matched zero rows, returned no error, and the "New feedback"
-- banner never cleared — and Relève never learned it had landed.
create or replace function mark_feedback_seen(p_id uuid) returns boolean
language plpgsql security definer as $$
declare n int;
begin
  update talent_feedback
     set seen_at = coalesce(seen_at, now())
   where id = p_id and shared and talent_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function mark_feedback_seen(uuid) from public;
grant execute on function mark_feedback_seen(uuid) to authenticated;

-- ---------- 6. a talent cannot point their verification at someone else's file ----------
-- "update own vetting" let the talent change any column; the guard pinned the
-- verdict fields only. file_path was open, so a row could be pointed at
-- another talent's document and the console would have shown it as theirs.
-- Also recognises the service role by its claim rather than by a null uid.
create or replace function guard_vetting() returns trigger language plpgsql as $$
begin
  if not is_team_or_service() then
    if new.state in ('verified', 'rejected') then
      raise exception 'only Relève can verify or reject a document';
    end if;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.note := old.note;
    new.issued_by_team := old.issued_by_team;
    new.envelope_id := old.envelope_id;
    new.signed_on := old.signed_on;
    -- their own upload may replace their own file, never somebody else's path
    if new.file_path is distinct from old.file_path
       and new.file_path is not null
       and split_part(new.file_path, '/', 1) <> new.talent_id::text then
      raise exception 'a document must live in your own folder';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------- 7. the stage moves on its own when verification completes ----------
-- profiles.stage only ever advanced to Placed. Nothing wrote Vetted, so every
-- self-serve talent sat on the roster as a warning pill for good, verified
-- or not. The moment both documents are verified, the stage follows.
create or replace function stage_on_vetting() returns trigger language plpgsql security definer as $$
begin
  if new.state = 'verified' and is_vetted(new.talent_id) then
    update profiles set stage = 'Vetted'
     where id = new.talent_id and coalesce(stage, '') not in ('Vetted', 'Placed');
  end if;
  return new;
end $$;
drop trigger if exists stage_on_vetting on vetting;
create trigger stage_on_vetting after insert or update of state on vetting
  for each row execute function stage_on_vetting();

-- ---------- 8. the 14-day promise clears itself ----------
-- searches.first_candidate_on was only ever written by a care action nothing
-- in the app called, so the guarantee alarm on the home page stayed lit on
-- every search forever. Releasing the first candidate is the moment the
-- promise is kept; the database stamps it.
create or replace function stamp_first_candidate() returns trigger language plpgsql security definer as $$
begin
  if new.released and (tg_op = 'INSERT' or not coalesce(old.released, false)) then
    update searches
       set first_candidate_on = current_date
     where first_candidate_on is null
       and closed_at is null
       and (id = new.search_id or (new.search_id is null and client_id = new.client_id));
  end if;
  return new;
end $$;
drop trigger if exists stamp_first_candidate on matches;
create trigger stamp_first_candidate after insert or update of released on matches
  for each row execute function stamp_first_candidate();

-- ---------- 9. an executive can give notice themselves ----------
-- Thirty days' written notice is the one contractual action a month-to-month
-- customer must be able to take, and only the console could record it.
-- placement_terms stays team-only; this is the single, narrow path in.
create or replace function give_notice(p_placement uuid) returns date
language plpgsql security definer as $$
declare d date;
begin
  if not exists (select 1 from placements p
                  where p.id = p_placement and p.client_id = auth.uid() and p.ended_on is null) then
    raise exception 'not your placement';
  end if;
  update placement_terms
     set notice_given_on = coalesce(notice_given_on, current_date), updated_at = now()
   where placement_id = p_placement
   returning notice_given_on into d;
  if d is null then
    insert into placement_terms (placement_id, notice_given_on) values (p_placement, current_date)
    on conflict (placement_id) do update set notice_given_on = coalesce(placement_terms.notice_given_on, current_date)
    returning notice_given_on into d;
  end if;
  return d;
end $$;
revoke all on function give_notice(uuid) from public;
grant execute on function give_notice(uuid) to authenticated;

-- ---------- 10. the public application form has a real rate limit ----------
-- The old limit lived in one lambda's memory: gone on every cold start, unshared
-- between instances, and keyed on the email the caller chose. Attempts are
-- now counted in the database, by address and by email.
create table if not exists apply_attempts (
  id     bigserial primary key,
  ip     text,
  email  text,
  at     timestamptz not null default now()
);
create index if not exists apply_attempts_ip_idx on apply_attempts (ip, at desc);
create index if not exists apply_attempts_email_idx on apply_attempts (email, at desc);
alter table apply_attempts enable row level security;
-- no policies on purpose: only the function below touches it

create or replace function apply_allowed(p_ip text, p_email text) returns boolean
language plpgsql security definer as $$
declare by_ip int; by_email int;
begin
  select count(*) into by_ip from apply_attempts
   where ip = p_ip and at > now() - interval '1 hour';
  select count(*) into by_email from apply_attempts
   where email = lower(p_email) and at > now() - interval '1 day';
  if by_ip >= 12 or by_email >= 4 then return false; end if;
  insert into apply_attempts (ip, email) values (p_ip, lower(p_email));
  delete from apply_attempts where at < now() - interval '7 days';
  return true;
end $$;
revoke all on function apply_allowed(text, text) from public;
grant execute on function apply_allowed(text, text) to anon, authenticated;

-- ---------- 11. who recorded an executive's decision ----------
-- An executive who says yes on a call had no way to be recorded by Relève;
-- now the console can record it on their behalf, and the row says so.
alter table talent_decisions add column if not exists recorded_by uuid references profiles(id);
comment on column talent_decisions.recorded_by is
  'Null when the executive answered in their own account; the team member when Relève recorded an answer given on a call.';

-- ---------- 12. a deposit marked paid by hand is still credited ----------
-- The retainer run credits the $500 only against a deposit INVOICE with
-- status 'paid'. The console's deposit dropdown writes searches.deposit_status,
-- which that credit never read — a founder who took the deposit by bank
-- transfer and marked the search paid saw the client billed the same $500
-- twice. The search now keeps its own invoice honest, the same way the
-- pre-signup backfill already does.
create or replace function sync_deposit_invoice() returns trigger
language plpgsql security definer as $$
begin
  if new.client_id is not null and new.deposit_status = 'paid'
     and (old.deposit_status is distinct from 'paid') then
    insert into invoices (client_id, search_id, kind, amount_cents,
                          issued_on, due_on, status, paid_on, note)
    select new.client_id, new.id, 'deposit', new.deposit_cents,
           coalesce(new.deposit_paid_on, current_date), coalesce(new.deposit_paid_on, current_date),
           'paid', coalesce(new.deposit_paid_on, current_date),
           'Search deposit. Non-refundable, credited against the first monthly invoice.'
    where not exists (select 1 from invoices where search_id = new.id and kind = 'deposit');
    update invoices
       set status = 'paid', paid_on = coalesce(paid_on, new.deposit_paid_on, current_date)
     where search_id = new.id and kind = 'deposit' and status <> 'paid';
  end if;
  return new;
end $$;
drop trigger if exists sync_deposit_invoice_t on searches;
create trigger sync_deposit_invoice_t after update of deposit_status on searches
for each row execute function sync_deposit_invoice();

-- ============================================================
-- PART 28 — the 15 September security audit
-- (safe to run on top of everything above, and safe to re-run)
-- ============================================================

-- ---------- 1. a view that was reading past row-level security ----------
-- Without security_invoker a view executes as its OWNER, not as the person
-- querying it, so row-level security on the tables underneath simply does not
-- apply — and Supabase's default grants make it readable through PostgREST by
-- anyone holding the publishable anon key, which ships in every browser.
--
-- This is the third time this exact bug has appeared in this file (see the
-- Decisions log entries for 10 September). It returns zero rows today only
-- because no talent has a scored Taking The Watch attempt yet; the first one
-- who does would have their user id and their pass/fail result readable by
-- anyone on the internet, with no account.
create or replace view talent_verification_badges with (security_invoker = true) as
select
  a.talent_id,
  bool_or(s.overall_result = 'cleared') as verified_through_taking_the_watch
from taking_the_watch_attempts a
join taking_the_watch_scores s on s.attempt_id = a.id
group by a.talent_id;

-- ---------- 2. the resume bucket accepted writes to any path ----------
-- The old policy was `with check (bucket_id = 'applications')` and nothing
-- else: no path restriction, no owner, no shape. Since the anon key is public
-- by design, a script could post straight at the Storage API and write files
-- anywhere in the bucket for ever, never touching /api/apply and never meeting
-- the rate limiter.
--
-- Nothing can be read back (there is no anon SELECT policy), so this was never
-- a disclosure — it was an uncapped storage bill and a bucket full of rubbish.
-- /api/apply only ever writes one folder deep, named either 'general' or the
-- posting's own uuid, so that is all this now permits. Junk written outside
-- that shape is refused; junk inside it is at least identifiable.
drop policy if exists "anyone may attach a resume" on storage.objects;
create policy "anyone may attach a resume" on storage.objects for insert
  with check (
    bucket_id = 'applications'
    and array_length(storage.foldername(name), 1) = 1
    and (
      (storage.foldername(name))[1] = 'general'
      or (storage.foldername(name))[1] ~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

-- ---------- 3. confirm the directory view is still the safe one ----------
-- Not a change: a check that prints a warning if the view ever loses
-- security_invoker again. Without it, talent_directory runs as its owner and
-- would expose every talent's name, photo, location, psychometric scores,
-- validity flags and Drive facets to anyone with the anon key. This file is the
-- single source of truth for the schema; always run the whole of it.
do $$
declare opts text[];
begin
  select reloptions into opts from pg_class where relname = 'talent_directory';
  if opts is null or not ('security_invoker=true' = any(opts)) then
    raise warning 'talent_directory is NOT security_invoker — it is reading past row-level security. Re-run PART 27 of this file.';
  else
    raise notice 'talent_directory: security_invoker confirmed.';
  end if;
end $$;

-- ============================================================
-- PART 29 — billing correctness (approved 16 Sep 2026)
-- Safe to run on top of everything above, and safe to re-run.
-- Fixes, in order of stakes:
--   C1  the $500 deposit was charged twice: a full retainer plus a separate
--       negative "credit" invoice that charging never touches. Now the deposit
--       is netted INTO the first retainer, and no separate credit is made.
--   C3  a mid-month start was billed a full month. Now the first retainer is
--       prorated to the days actually worked that month.
--   C2  giving notice never stopped billing. Now notice sets an end date the
--       billing run respects, and the run auto-ends placements past it.
--   C4  notice now ends on the FIRST MONDAY of the following month, matching
--       the written terms (was: end of the following calendar month).
-- ============================================================

-- the end date notice implies, stored so billing and payroll can respect it
alter table placement_terms add column if not exists notice_ends_on date;

-- give_notice: record the notice date AND the first-Monday end date it implies
create or replace function give_notice(p_placement uuid) returns date
language plpgsql security definer as $$
declare d date; ends date;
        today date := (now() at time zone 'America/Los_Angeles')::date;  -- C6: the business runs on Pacific
begin
  if not exists (select 1 from placements p
                  where p.id = p_placement and p.client_id = auth.uid() and p.ended_on is null) then
    raise exception 'not your placement';
  end if;
  update placement_terms
     set notice_given_on = coalesce(notice_given_on, today), updated_at = now()
   where placement_id = p_placement
   returning notice_given_on into d;
  if d is null then
    insert into placement_terms (placement_id, notice_given_on) values (p_placement, today)
    on conflict (placement_id) do update set notice_given_on = coalesce(placement_terms.notice_given_on, today)
    returning notice_given_on into d;
  end if;
  -- first Monday of the month AFTER the notice month
  ends := first_monday((date_trunc('month', d) + interval '1 month')::date);
  update placement_terms set notice_ends_on = ends where placement_id = p_placement;
  return d;
end $$;
revoke all on function give_notice(uuid) from public;
grant execute on function give_notice(uuid) to authenticated;

-- the retainer run, rewritten: prorate the first month, net the deposit into
-- it, and stop once notice has taken effect
create or replace function issue_monthly_retainers(for_month date default current_date)
returns int language plpgsql security definer as $$
declare
  p_start date := date_trunc('month', for_month)::date;
  p_end   date := (date_trunc('month', for_month) + interval '1 month - 1 day')::date;
  billing date := first_monday(for_month);
  made    int  := 0;
  r       record;
  dep     record;
  issued  date;
  base    int;
  is_first boolean;
  note    text;
begin
  if not is_team_or_service() then
    raise exception 'only Releve may issue invoices';
  end if;

  -- a placement whose notice has taken effect is ended on its notice date, so
  -- it drops off the active lists and stops billing from the following period
  update placements pl
     set ended_on = t.notice_ends_on
    from placement_terms t
   where t.placement_id = pl.id
     and t.notice_ends_on is not null
     and pl.ended_on is null
     and t.notice_ends_on <= p_end;

  for r in
    select pl.id, pl.client_id, pl.started_on, t.rate_month_cents, t.notice_ends_on
    from placements pl
    join placement_terms t on t.placement_id = pl.id
    where t.rate_month_cents is not null
      and pl.started_on <= p_end
      and (pl.ended_on is null
           or pl.ended_on >= p_start
           or minimum_term_ends(t, pl.started_on) >= p_start)
      -- once notice has taken effect, the following period is not billed
      and (t.notice_ends_on is null
           or date_trunc('month', t.notice_ends_on)::date > p_start)
      and not exists (
        select 1 from invoices i
        where i.placement_id = pl.id and i.kind = 'retainer' and i.period_start = p_start)
  loop
    is_first := not exists (
      select 1 from invoices i where i.placement_id = r.id and i.kind = 'retainer');
    issued := greatest(billing, r.started_on);
    base   := r.rate_month_cents;
    note   := 'Monthly retainer';

    -- C3: prorate the first month if the placement started mid-period
    if is_first and r.started_on > p_start and r.started_on <= p_end then
      base := round(r.rate_month_cents::numeric
                    * (p_end - r.started_on + 1)         -- days actually worked
                    / (p_end - p_start + 1))::int;        -- days in the month
      note := 'First month, prorated from ' || to_char(r.started_on, 'Mon DD');
    end if;

    -- C1: net a paid, uncredited deposit into this first invoice (no separate
    -- credit invoice — the old one was never charged, so the client overpaid)
    if is_first then
      select i.id, i.amount_cents into dep
      from invoices i
      where i.client_id = r.client_id
        and i.kind = 'deposit'
        and i.status = 'paid'
        and i.credited_on is null
      order by i.issued_on
      limit 1;
      if found then
        base := greatest(0, base - dep.amount_cents);
        note := note || '; $' || (dep.amount_cents / 100) || ' search deposit credited';
        update invoices set credited_on = issued where id = dep.id;
      end if;
    end if;

    insert into invoices (client_id, placement_id, kind, period_start, period_end,
                          amount_cents, issued_on, due_on, status, note)
    values (r.client_id, r.id, 'retainer', p_start, p_end,
            base, issued, issued, 'draft', note);
    made := made + 1;
  end loop;

  return made;
end $$;

-- payroll: stop paying once notice has taken effect, same boundary as billing
create or replace function pay_the_month(for_month date default current_date)
returns int language plpgsql security definer as $$
declare
  p_start date := date_trunc('month', for_month)::date;
  p_end   date := (date_trunc('month', for_month) + interval '1 month - 1 day')::date;
  made    int  := 0;
begin
  if not is_admin() then raise exception 'Relève team only'; end if;

  insert into talent_payments (talent_id, placement_id, period_start, period_end, amount_cents, currency)
  select pl.talent_id, pl.id, p_start, p_end, tp.rate_month_cents, coalesce(tp.currency, 'USD')
  from placements pl
  join talent_pay tp on tp.talent_id = pl.talent_id
  left join placement_terms t on t.placement_id = pl.id
  where tp.rate_month_cents is not null
    and pl.started_on <= p_end
    and (pl.ended_on is null or pl.ended_on >= p_start)
    and (t.notice_ends_on is null
         or date_trunc('month', t.notice_ends_on)::date > p_start)
  on conflict (talent_id, period_start) do nothing;

  get diagnostics made = row_count;
  return made;
end $$;

do $$ begin
  raise notice 'PART 29 applied: retainer proration + deposit netting + notice-stops-billing are live.';
end $$;

-- ============================================================
-- PART 30 — a second admin can be added from the console (B0)
-- Safe to run on top of everything above, and safe to re-run.
-- The founder could not grant console access to anyone without editing the
-- database by hand — the worst thing to discover in an emergency. This uses
-- the existing pending-person path: an owner adds a pending row with
-- role='admin', and claim_pending() (which already sets a new profile's role
-- on first sign-in) now also gives them a team_roles row.
-- ============================================================

alter table pending_people add column if not exists team_role text;

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
    if p.rate_month is not null then
      insert into talent_pay (talent_id, rate_month) values (new.id, p.rate_month)
      on conflict (talent_id) do update set rate_month = excluded.rate_month;
    end if;
    -- a pending admin also gets a team_roles row, so they show on the Team page
    -- and is_owner() treats them as a manager (never an owner) unless set so
    if p.role = 'admin' then
      insert into team_roles (user_id, team_role)
      values (new.id, coalesce(p.team_role, 'manager'))
      on conflict (user_id) do update set team_role = excluded.team_role;
    end if;
    update pending_people set claimed_by = new.id where id = p.id;
  end if;
  return new;
end $$;

do $$ begin raise notice 'PART 30 applied: an owner can add a second admin from the console.'; end $$;


-- ============================================================
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
       and (select array_agg(attname order by attname) from pg_attribute
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
