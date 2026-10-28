-- PART 52: lead account pages + the business-audit builder.
--
-- Nona, 28 October 2026: every lead needs its own account page (history,
-- documents, everything), and after a discovery call she wants to fill a few
-- key points and have a business audit written in the console, then email it
-- to the prospect from a private branded link.
--
-- This adds the lead's website, lets documents attach to a lead, and creates
-- the lead_audits table that holds each generated audit, its inputs, its
-- editable content and the token for its public link.
--
-- This drops and re-adds the documents owner_kind check (to widen it), so
-- Supabase shows its "destructive operation" confirmation: press Run, then
-- confirm. Nothing is deleted; the constraint is only widened.

-- a lead's website, for the quick link on their account page
alter table prospects add column if not exists website text;
comment on column prospects.website is 'The lead''s website, shown as a link on their account page.';

-- let documents attach to a lead as well as a person or a placement
alter table documents drop constraint if exists documents_owner_kind_check;
alter table documents add constraint documents_owner_kind_check
  check (owner_kind in ('person','placement','prospect'));

-- every business audit written for a lead
create table if not exists lead_audits (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  title       text not null,
  inputs      jsonb not null default '{}'::jsonb,   -- the key points she filled in
  content     text not null default '',             -- the audit itself, as Markdown
  status      text not null default 'draft' check (status in ('draft','sent')),
  view_token  text not null,                         -- the private link's token
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists lead_audits_for  on lead_audits (prospect_id, created_at desc);
create unique index if not exists lead_audits_token on lead_audits (view_token);

comment on table lead_audits is
  'One business audit per row, written in the console for a lead and sent as a private branded link. Team only; the public page reads one row by its token with the service role.';

alter table lead_audits enable row level security;
drop policy if exists "team manages audits" on lead_audits;
create policy "team manages audits" on lead_audits
  for all using (is_admin()) with check (is_admin());

-- keep updated_at honest on edits
create or replace function lead_audit_touch() returns trigger
language plpgsql set search_path = public, auth, extensions as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists lead_audit_touch_t on lead_audits;
create trigger lead_audit_touch_t before update on lead_audits
  for each row execute function lead_audit_touch();
