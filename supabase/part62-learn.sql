-- PART 62 · Team trainings (10 November 2026)
-- Inside Relève for every new hire and Selling Relève for approved hires,
-- sent from the console as private links (/learn/<token>), and Working with
-- Relève for placed talent, opened from their own app account.
-- One row per person per course. The team manages rows under is_admin();
-- the public link reaches only its own row, through the service role, after
-- the server has checked the token. Safe to run more than once.

create table if not exists team_trainings (
  id            uuid primary key default gen_random_uuid(),
  course        text not null default 'inside' check (course ~ '^[a-z][a-z0-9_-]{1,30}$'),
  name          text not null check (length(name) between 2 and 120),
  email         text not null check (length(email) between 3 and 200),
  token         text not null unique check (length(token) = 32),
  sent_by       uuid references profiles(id) on delete set null,
  user_id       uuid references profiles(id) on delete set null,   -- set for courses opened from the app (the talent training)
  sent_at       timestamptz,
  opened_at     timestamptz,
  last_seen_at  timestamptz,
  progress      jsonb not null default '{}'::jsonb,
  lessons_done  int not null default 0,
  checks_passed int not null default 0,
  completed_at  timestamptz,
  signed_name   text check (signed_name is null or length(signed_name) <= 120),
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists team_trainings_course on team_trainings (course, created_at desc);
create index if not exists team_trainings_email on team_trainings (lower(email));
-- Added the same day for the talent training; safe if the table already existed.
alter table team_trainings add column if not exists user_id uuid references profiles(id) on delete set null;
create index if not exists team_trainings_user on team_trainings (user_id, course);

alter table team_trainings enable row level security;
drop policy if exists "team manages trainings" on team_trainings;
create policy "team manages trainings" on team_trainings for all
  using (is_admin()) with check (is_admin());
