-- PART 61: the Audit Studio and the 90-Day Plan Studio.
--
-- Nona, 7 November 2026: the business audit and each client's 90-day plan are
-- built on their own console pages, from an AI interview, with a chat to ask
-- for changes. This gives audits a conversation, a working state and a
-- prepared email, and adds the table that holds each executive's 90-Day Plan.
-- Safe to run more than once. Nothing is dropped.

alter table lead_audits add column if not exists chat  jsonb not null default '[]'::jsonb;
alter table lead_audits add column if not exists state text  not null default 'idle';
alter table lead_audits add column if not exists error text;
alter table lead_audits add column if not exists email jsonb;

create table if not exists success_plans (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references profiles(id) on delete cascade,
  audit_id     uuid references lead_audits(id) on delete set null,
  title        text not null default 'Your 90-Day Success Plan',
  content      text not null default '',
  chat         jsonb not null default '[]'::jsonb,
  state        text not null default 'idle',
  error        text,
  email        jsonb,
  status       text not null default 'draft' check (status in ('draft','published')),
  view_token   text not null,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists success_plans_for on success_plans (client_id, created_at desc);
create unique index if not exists success_plans_token on success_plans (view_token);

comment on table success_plans is
  'One 90-Day Success Plan per row, built in the console for an executive once onboarding is done. Team only; the public page reads a published row by its token with the service role.';

alter table success_plans enable row level security;
drop policy if exists "team manages plans" on success_plans;
create policy "team manages plans" on success_plans
  for all using (is_admin()) with check (is_admin());

drop trigger if exists success_plan_touch_t on success_plans;
create trigger success_plan_touch_t before update on success_plans
  for each row execute function lead_audit_touch();
