-- ONE CLICK: parts 46, 47 and 48 together (25 October 2026).

-- PART 46: the weekly check-in becomes the end-of-week report.
--
-- Sage, 25 October 2026: every Friday the talent file their hours, the tasks
-- they accomplished, a win from the week, and any concerns. The old check-in
-- asked for what got done, what is in the way, a 1-to-5 rapport score and a
-- workload pick, which is a different question: it measured how the person
-- felt rather than recording what the week contained.
--
-- The table is kept, so every report already filed stays readable. Two
-- columns are added and the two rating columns are simply no longer asked
-- for; they stay in place so old rows keep their meaning.

alter table checkins add column if not exists hours numeric(5,1);
alter table checkins add column if not exists win   text;

comment on column checkins.hours is 'Hours worked in the week, as the talent reports them.';
comment on column checkins.win   is 'One win from the week, in their own words.';
comment on column checkins.shipped is 'Tasks accomplished this week.';
comment on column checkins.blocked is 'Concerns. Non-empty is what raises a hand.';

-- A hand goes up when somebody writes a concern. The two older conditions
-- stay so that reports filed before today still read the same way; nothing
-- new will set them, because the form no longer asks.
-- PART 43 rule: a trigger function carries its own search_path.
create or replace function flag_checkin() returns trigger
language plpgsql set search_path = public, auth, extensions as $$
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

-- PART 48: documents on every record.
--
-- Sage, 25 October 2026: payroll, invoices and documents are one of the
-- app's five purposes. Vetting documents and signed agreements each had a
-- home; everything else a staffing firm keeps on file did not. An NDA
-- addendum, a W-8BEN, a contract amendment, an SOP written for a placement,
-- a reference letter: there was nowhere to put them, so they lived in
-- email. One table, one private bucket, a Files card on each person and
-- each placement. Team only, deliberately: this is Relève's filing
-- cabinet, not a shared drive.

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  owner_kind  text not null check (owner_kind in ('person','placement')),
  owner_id    uuid not null,                 -- profiles.id or placements.id
  name        text not null,                 -- the file name as Sage sees it
  label       text,                          -- what it is, in her words
  file_path   text not null,                 -- inside the private 'documents' bucket
  mime        text not null,
  bytes       int  not null,
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index if not exists documents_owner on documents (owner_kind, owner_id, uploaded_at desc);

comment on table documents is
  'Relève''s filing cabinet: anything kept on a person or a placement that is not a vetting document or a signed agreement. Team only.';

alter table documents enable row level security;
drop policy if exists "team manages documents" on documents;
create policy "team manages documents" on documents
  for all using (is_admin()) with check (is_admin());

-- The bucket. NOT public: nothing here is reachable by URL alone, and the
-- app serves each file through a one-minute signed link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400,
        array['application/pdf','image/jpeg','image/png','image/webp',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false, file_size_limit = 26214400,
      allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

drop policy if exists "team reads documents" on storage.objects;
create policy "team reads documents" on storage.objects for select
  using (bucket_id = 'documents' and is_admin());
drop policy if exists "team uploads documents" on storage.objects;
create policy "team uploads documents" on storage.objects for insert
  with check (bucket_id = 'documents' and is_admin());
drop policy if exists "team removes documents" on storage.objects;
create policy "team removes documents" on storage.objects for delete
  using (bucket_id = 'documents' and is_admin());
