-- PART 59 (2 November 2026): the Directory's history.
-- Nona asked for the CRM and Directory at Asana quality, with the full
-- history: every stage change, owner change, follow-up change and note on a
-- lead, an executive or a talent, with @mentions that reach the person named.
-- Calls, emails, messages and meetings with leads stay in prospect_touches
-- (they move "last touched"); everything else lands here. Safe to run twice.

create table if not exists crm_activity (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in ('prospect','client','talent')),
  subject_id    text not null,
  kind          text not null check (kind in ('note','call','email','message','meeting','stage','owner','follow_up','created','field')),
  body          text,
  meta          jsonb not null default '{}'::jsonb,
  mentions      uuid[] not null default '{}',
  by            uuid references profiles(id) on delete set null,
  at            timestamptz not null default now()
);
create index if not exists crm_activity_for on crm_activity(subject_type, subject_id, at desc);
create index if not exists crm_activity_mentions on crm_activity using gin (mentions);

comment on table crm_activity is
  'The Directory timeline: stage, owner and follow-up changes, notes with @mentions, and touches with executives and talent. Team only.';

alter table crm_activity enable row level security;
drop policy if exists "team manages activity" on crm_activity;
create policy "team manages activity" on crm_activity
  for all using (is_admin()) with check (is_admin());

-- How long a lead has sat in its stage.
alter table prospects add column if not exists stage_changed_at timestamptz;
update prospects set stage_changed_at = coalesce(updated_at, created_at) where stage_changed_at is null;

create or replace function prospect_stage_stamp() returns trigger
language plpgsql set search_path = public, auth, extensions as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists prospect_stage_stamp on prospects;
create trigger prospect_stage_stamp before update on prospects
  for each row execute function prospect_stage_stamp();
