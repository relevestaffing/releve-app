-- PART 45: the platform notices when somebody cannot get in.
--
-- WHY. PART 44 fixed a sign-in that had been refusing invited executives and
-- admins since 13 October. It was found because Nona happened to try it
-- herself, eleven days later. Nothing in the app watched sign-in, so the one
-- failure that silences every other signal, nobody can reach their account,
-- was the only failure with no evidence behind it. email_log exists for
-- exactly this reason on the mail side; this is its twin.
--
-- WHAT. One row per failed sign-in, written with the service role from the
-- three places that can refuse one. Readable by the team only. Nothing here
-- is ever written from a signed-in session, same rule as email_log.

create table if not exists signin_failures (
  id      uuid primary key default gen_random_uuid(),
  email   text,                       -- null when the exchange failed before we knew who
  stage   text not null,              -- 'exchange' | 'profile_create' | 'role_set'
  detail  text,                       -- the database's or Auth's own words
  at      timestamptz not null default now()
);

comment on table signin_failures is
  'One row per failed sign-in. The only evidence that anybody tried to get in and could not. Written only by the service role; see lib/signin-watch.ts.';

create index if not exists signin_failures_recent on signin_failures(at desc);

alter table signin_failures enable row level security;

-- The team reads it. Nobody writes it from a session: the service role
-- bypasses RLS, so the absence of an insert policy is the write rule.
drop policy if exists "team sees signin failures" on signin_failures;
create policy "team sees signin failures" on signin_failures
  for select using (is_admin());

-- Mirrors email_health: one row, cheap enough for the console to read on
-- every load. security_invoker so it obeys the policy above rather than
-- handing a non-admin a count of something they cannot see.
create or replace view signin_health with (security_invoker = true) as
  select
    count(*) filter (where at > now() - interval '7 days')::int as failed_week,
    max(at) as last_failure
  from signin_failures;

comment on view signin_health is
  'Failed sign-ins in the last seven days, for the console Today list.';
