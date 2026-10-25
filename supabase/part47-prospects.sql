-- PART 47: prospects, the stage before the onboarding email.
--
-- Sage, 25 October 2026. An executive did not exist in the app until the
-- onboarding email went out after the discovery call, so the front of the
-- funnel lived in Calendly and in her head: no record of who was called,
-- what was said, who went quiet, and what share of calls became clients.
-- A staffing firm's software always has this; it is the one module Relève
-- lacked. One row per person from the moment a call is booked.

create table if not exists prospects (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         text not null,
  org_name      text,
  source        text not null default 'calendly'
                  check (source in ('calendly','referral','linkedin','website','other')),
  call_at       timestamptz,                -- the discovery call, when there is one
  stage         text not null default 'booked'
                  check (stage in ('booked','held','proposal','won','lost')),
  note          text,                       -- what was said, in Sage's words
  lost_reason   text,
  calendar_event_id text unique,            -- so an import never doubles a person
  pending_id    uuid references pending_people(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists prospects_email_open
  on prospects (lower(email)) where stage not in ('won','lost');
create index if not exists prospects_stage_call on prospects (stage, call_at);

comment on table prospects is
  'Executives from the moment a discovery call is booked until the onboarding email goes out (won) or they decline (lost). Team only.';

alter table prospects enable row level security;
drop policy if exists "team manages prospects" on prospects;
create policy "team manages prospects" on prospects
  for all using (is_admin()) with check (is_admin());

-- PART 43 rule: a trigger function carries its own search_path.
create or replace function touch_prospect() returns trigger
language plpgsql set search_path = public, auth, extensions as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists prospects_touch on prospects;
create trigger prospects_touch before update on prospects
  for each row execute function touch_prospect();
