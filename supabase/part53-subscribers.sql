-- PART 53 — the email list (29 October 2026)
--
-- One list of every business owner who has given Relève an email address,
-- so the biweekly emails go to all of them. Talent are never on it.
--
-- How people arrive:
--   * Every new lead in prospects (the website form, /discovery, the free
--     training at /training, Calendly, anything added in the console) is
--     copied in by a trigger, so nothing has to remember to do it.
--   * Every executive (profiles.role = 'client') is copied in the same way.
--   * The backfill at the bottom adds everyone already in either table.
--
-- Free-training signups post to /api/interest with a note that starts
-- "FREE TRAINING SIGNUP". A second trigger files those leads as 'nurturing'
-- with a follow-up three days out, so they never flood Follow up today and
-- Sage reaches out after they have had time to go through the training.
--
-- Re-runnable. Nothing is dropped except this file's own triggers/policies.

create table if not exists subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  full_name        text,
  origin           text not null default 'lead'
                   check (origin in ('training','lead','client','import')),
  source           text,                      -- linkedin, instagram, website ...
  subscribed       boolean not null default true,
  unsubscribed_at  timestamptz,
  training_at      timestamptz,               -- when they unlocked the free training
  unsubscribe_token text not null default replace(gen_random_uuid()::text,'-',''),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists subscribers_email on subscribers (lower(email));
create unique index if not exists subscribers_token on subscribers (unsubscribe_token);

comment on table subscribers is
  'The Relève email list: every business owner who has given an email (leads, training signups, executives). Feeds the biweekly emails. Talent are never added.';

alter table subscribers enable row level security;
drop policy if exists "team manages subscribers" on subscribers;
create policy "team manages subscribers" on subscribers
  for all using (is_admin()) with check (is_admin());

-- a lead note marks a free-training signup (from /training or the /discovery exit window)
create or replace function is_training_note(n text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(n,'') ilike 'FREE TRAINING SIGNUP%' or coalesce(n,'') ilike '%OPTED IN: free training%'
$$;

-- training signups go to nurturing, follow-up in three days
create or replace function prospects_training_stage() returns trigger
language plpgsql set search_path = public as $$
begin
  if is_training_note(new.note) and coalesce(new.stage,'new') = 'new' then
    new.stage := 'nurturing';
    new.next_follow_up := (now() at time zone 'America/Los_Angeles')::date + 3;
  end if;
  return new;
end $$;
drop trigger if exists prospects_training_stage on prospects;
create trigger prospects_training_stage before insert on prospects
  for each row execute function prospects_training_stage();

-- every lead joins the list
create or replace function subscribers_from_prospect() returns trigger
language plpgsql security definer set search_path = public as $$
declare t boolean := is_training_note(new.note);
begin
  if new.email is null or position('@' in new.email) = 0 then return new; end if;
  insert into subscribers (email, full_name, origin, source, training_at)
  values (lower(trim(new.email)), new.full_name,
          case when t then 'training' else 'lead' end,
          new.source, case when t then now() end)
  on conflict ((lower(email))) do update
    set training_at = coalesce(subscribers.training_at, excluded.training_at),
        full_name   = coalesce(subscribers.full_name, excluded.full_name),
        updated_at  = now();
  return new;
exception when others then
  return new;   -- the list must never stop a lead from being filed
end $$;
drop trigger if exists subscribers_from_prospect on prospects;
create trigger subscribers_from_prospect after insert on prospects
  for each row execute function subscribers_from_prospect();

-- every executive joins the list
create or replace function subscribers_from_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'client' and new.email is not null then
    insert into subscribers (email, full_name, origin)
    values (lower(trim(new.email)), new.full_name, 'client')
    on conflict ((lower(email))) do update
      set origin = 'client', full_name = coalesce(subscribers.full_name, excluded.full_name), updated_at = now();
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists subscribers_from_client on profiles;
create trigger subscribers_from_client after insert or update of role, email on profiles
  for each row execute function subscribers_from_client();

-- backfill everyone already here
insert into subscribers (email, full_name, origin, source, training_at, created_at)
select distinct on (lower(trim(email)))
       lower(trim(email)), full_name,
       case when is_training_note(note) then 'training' else 'lead' end,
       source, case when is_training_note(note) then created_at end, created_at
from prospects
where email is not null and position('@' in email) > 0
order by lower(trim(email)), created_at
on conflict ((lower(email))) do nothing;

insert into subscribers (email, full_name, origin, created_at)
select lower(trim(email)), full_name, 'client', created_at
from profiles where role = 'client' and email is not null
on conflict ((lower(email))) do update set origin = 'client';

-- the export view the team reads
create or replace view subscriber_list with (security_invoker = true) as
  select email, full_name, origin, source, subscribed, training_at, created_at,
         unsubscribe_token
  from subscribers order by created_at desc;
