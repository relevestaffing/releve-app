-- PART 51: the lead pipeline.
--
-- Sage, 28 October 2026: a lead management CRM, so she knows who to follow up
-- with. Rather than a second list beside Prospects, the prospects table
-- becomes the whole journey, from first interest to signed client. One record
-- per person, one place to look. A lead is simply an earlier stage.
--
-- Adds the lead stages before the call, a next-follow-up date and a last-
-- touched date (the heart of "who do I chase today"), an owner, two more
-- sources, and a touch log so every follow-up is recorded.
--
-- This drops and re-adds the stage and source check constraints and a policy,
-- so Supabase will show its "destructive operation" confirmation: press Run,
-- then confirm. Nothing is deleted; the constraints are only widened.

-- widen the stages: lead stages ahead of the call, through to signed or passed
alter table prospects drop constraint if exists prospects_stage_check;
alter table prospects add constraint prospects_stage_check
  check (stage in ('new','contacted','nurturing','booked','held','proposal','won','lost'));
alter table prospects alter column stage set default 'new';

-- widen the sources
alter table prospects drop constraint if exists prospects_source_check;
alter table prospects add constraint prospects_source_check
  check (source in ('calendly','referral','linkedin','instagram','website','event','other'));

-- who to follow up with, and when
alter table prospects add column if not exists next_follow_up  date;
alter table prospects add column if not exists last_touched_at timestamptz;
alter table prospects add column if not exists owner_id        uuid references profiles(id);
create index if not exists prospects_follow_up on prospects(next_follow_up)
  where next_follow_up is not null and stage not in ('won','lost');

comment on column prospects.next_follow_up  is 'The day to follow up with this lead next. Drives the Follow up today list.';
comment on column prospects.last_touched_at is 'When someone last logged a touch with this lead.';
comment on column prospects.owner_id        is 'The team member who owns this lead.';

-- the touch log: every follow-up, recorded, with the follow-up set at the time
create table if not exists prospect_touches (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null references prospects(id) on delete cascade,
  at            timestamptz not null default now(),
  by            uuid references profiles(id) on delete set null,
  kind          text not null default 'note'
                  check (kind in ('note','call','email','message','meeting')),
  note          text,
  next_follow_up date
);
create index if not exists prospect_touches_for on prospect_touches(prospect_id, at desc);

comment on table prospect_touches is
  'One row per contact with a lead: what was said and when, and the follow-up set at the time. Team only.';

alter table prospect_touches enable row level security;
drop policy if exists "team manages touches" on prospect_touches;
create policy "team manages touches" on prospect_touches
  for all using (is_admin()) with check (is_admin());

-- logging a touch moves the lead's clock forward: last touched now, and the
-- next follow-up to whatever was set (or left where it was).
create or replace function touch_bumps_prospect() returns trigger
language plpgsql set search_path = public, auth, extensions as $$
begin
  update prospects
     set last_touched_at = new.at,
         next_follow_up  = coalesce(new.next_follow_up, next_follow_up),
         updated_at      = now()
   where id = new.prospect_id;
  return new;
end $$;
drop trigger if exists prospect_touch_bumps on prospect_touches;
create trigger prospect_touch_bumps after insert on prospect_touches
  for each row execute function touch_bumps_prospect();
