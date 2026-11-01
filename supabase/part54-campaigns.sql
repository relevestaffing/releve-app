-- PART 54 — email campaigns (29 October 2026)
--
-- Nona: Claude drafts and sends Relève's email twice a week, Tuesdays and
-- Thursdays at 9:00 AM Pacific, automatically unless she holds it. Each draft
-- is written two days ahead and emailed to the team as a preview.
--
--   campaigns       one email: its slot, subject, body, status
--   campaign_sends  one row per recipient per campaign, so a send that is
--                   interrupted resumes without emailing anyone twice
--
-- Statuses: scheduled (will send at send_at), held (Nona pressed Hold, or a
-- requirement such as the mailing address is missing), sending, sent, failed,
-- cancelled. Re-runnable.

create table if not exists campaigns (
  id           uuid primary key default gen_random_uuid(),
  slot         text unique,                         -- e.g. 2026-11-03-tue, one email per slot
  send_at      timestamptz not null,
  status       text not null default 'scheduled'
               check (status in ('scheduled','held','sending','sent','failed','cancelled')),
  hold_reason  text,
  topic        text,
  subject      text not null,
  preheader    text,
  paragraphs   jsonb not null default '[]'::jsonb,  -- the body, one string per paragraph
  cta_label    text,
  cta_url      text,
  written_by   text not null default 'claude' check (written_by in ('claude','team')),
  recipients   integer not null default 0,
  delivered    integer not null default 0,
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists campaigns_send_at on campaigns (send_at);

create table if not exists campaign_sends (
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  email         text not null,
  status        text not null default 'queued' check (status in ('queued','sent','failed')),
  error         text,
  sent_at       timestamptz,
  primary key (campaign_id, subscriber_id)
);

alter table campaigns enable row level security;
alter table campaign_sends enable row level security;
drop policy if exists "team manages campaigns" on campaigns;
create policy "team manages campaigns" on campaigns for all using (is_admin()) with check (is_admin());
drop policy if exists "team reads campaign sends" on campaign_sends;
create policy "team reads campaign sends" on campaign_sends for all using (is_admin()) with check (is_admin());

comment on table campaigns is
  'Relève email campaigns: Claude drafts each one two days ahead, it sends Tue/Thu 9:00 AM Pacific unless held. Part 54.';
