-- ============================================================
-- PART 39 (Lane C) — the client, talent and admin experience
-- (2 Oct 2026; safe to run on top of everything above, and safe to re-run)
--
--   1. Message read state, per person per thread, and an unread tally
--   2. Client <-> talent threads, listed for the console (read-only there)
--   3. Who looks after me: the named Success Manager, readable by the client
--      and the talent on that placement without opening profiles to them
--   4. Tasks: a status beyond done, guarded edits, and comments / questions
--   5. The talent's daily log (private), with highlights they choose to share
--   6. The executive's briefing for their talent (tools, access, preferences)
--   7. Client requests: a replacement, a pause, a quarterly review
--   8. Bookkeeping for the two new scheduled jobs (report and reminders)
--
-- Nothing here touches billing, invoices, profiles insert, storage,
-- interviews' own policies, Taking The Watch or applications.
-- ============================================================

-- ---------- 1. message read state ----------
-- read_at on messages is the TEAM's flag (set when the console opens a thread)
-- and only an admin may update a message row (PART 23). A client or talent
-- reading their own thread needs somewhere of their own to record it, which
-- is this: one row per person per thread, holding the last moment they read.
-- thread is 'subject:<uuid>' for a person's line to their Success Manager and
-- 'placement:<uuid>' for the direct line between a client and their talent.
create table if not exists message_reads (
  user_id      uuid not null references profiles(id) on delete cascade,
  thread       text not null check (thread ~ '^(subject|placement):[0-9a-f-]{36}$'),
  last_read_at timestamptz not null default now(),
  primary key (user_id, thread)
);
alter table message_reads enable row level security;
drop policy if exists "own read state" on message_reads;
create policy "own read state" on message_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Everything already in a thread on the day this ships counts as read, so
-- nobody opens their account to a badge for a conversation they finished
-- weeks ago.
insert into message_reads (user_id, thread, last_read_at)
select distinct m.subject_id, 'subject:' || m.subject_id::text, now()
  from messages m
 where m.subject_id is not null
on conflict (user_id, thread) do nothing;

insert into message_reads (user_id, thread, last_read_at)
select distinct x.uid, 'placement:' || x.pid::text, now()
  from (
    select p.client_id as uid, p.id as pid from placements p
     where exists (select 1 from messages m where m.placement_id = p.id)
    union
    select p.talent_id, p.id from placements p
     where exists (select 1 from messages m where m.placement_id = p.id)
  ) x
on conflict (user_id, thread) do nothing;

-- Unread messages per thread for whoever is signed in. Deliberately NOT
-- security definer: it runs as the caller, so row level security on messages
-- decides what is counted, exactly as a plain select would. Only live
-- placements count, because ended ones no longer have a tab to clear them.
create or replace function my_unread()
returns table (thread text, unread int)
language sql stable as $$
  select t.thread, count(*)::int
  from (
    select case when m.placement_id is null
                then 'subject:' || m.subject_id::text
                else 'placement:' || m.placement_id::text end as thread,
           m.created_at, m.sender_id
      from messages m
     where m.subject_id = auth.uid()
        or (m.placement_id is not null and exists (
              select 1 from placements p
               where p.id = m.placement_id and p.ended_on is null
                 and (p.client_id = auth.uid() or p.talent_id = auth.uid())))
  ) t
  left join message_reads r on r.user_id = auth.uid() and r.thread = t.thread
  where t.sender_id <> auth.uid()
    and t.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by t.thread;
$$;
revoke execute on function my_unread() from public, anon;
grant execute on function my_unread() to authenticated;

-- ---------- 2. client <-> talent threads, for the console ----------
-- message_threads() (PART 23) lists only the Success Manager lines. The
-- direct lines between a client and their talent were invisible to Relève
-- unless somebody opened the placement. One row per placement thread, run as
-- the caller (an admin sees all; anyone else only their own).
create or replace function placement_threads()
returns table (placement_id uuid, last text, last_at timestamptz, total int, last_sender uuid)
language sql stable as $$
  select m.placement_id,
         (array_agg(m.body order by m.created_at desc))[1],
         max(m.created_at),
         count(*)::int,
         (array_agg(m.sender_id order by m.created_at desc))[1]
    from messages m
   where m.placement_id is not null
   group by m.placement_id;
$$;
revoke execute on function placement_threads() from public, anon;
grant execute on function placement_threads() to authenticated;

-- ---------- 3. the named Success Manager ----------
-- A client cannot read another profile row, so "Your Success Manager" had to
-- stay anonymous. This returns just the name, and whether there is a photo,
-- of the manager assigned to each of the caller's own live placements: the
-- CSM for the executive, the TSM for the talent. Nothing else about the
-- manager leaves the database here (no email, no role detail).
create or replace function my_managers()
returns table (placement_id uuid, side text, manager_id uuid, manager_name text, has_photo boolean)
language sql stable security definer set search_path = public as $$
  select p.id, 'client'::text, p.csm_id, pr.full_name, pr.photo_url is not null
    from placements p join profiles pr on pr.id = p.csm_id
   where p.client_id = auth.uid() and p.ended_on is null
  union all
  select p.id, 'talent'::text, p.tsm_id, pr.full_name, pr.photo_url is not null
    from placements p join profiles pr on pr.id = p.tsm_id
   where p.talent_id = auth.uid() and p.ended_on is null;
$$;
revoke execute on function my_managers() from public, anon;
grant execute on function my_managers() to authenticated;

-- ---------- 4. tasks: status, guarded edits, comments ----------
alter table tasks add column if not exists status text not null default 'todo';
do $$ begin
  alter table tasks add constraint tasks_status_chk
    check (status in ('todo', 'in_progress', 'waiting', 'done'));
exception when duplicate_object then null; end $$;
update tasks set status = 'done' where done and status <> 'done';
update tasks set status = 'todo' where not done and status = 'done';

-- done stays the column everything else reads (the console, alerts, reports),
-- so status and done are kept in step here rather than in every caller.
create or replace function sync_task_status() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.done then new.status := 'done';
    elsif new.status = 'done' then new.done := true;
    end if;
  else
    if new.status is distinct from old.status then
      new.done := (new.status = 'done');
    elsif new.done is distinct from old.done then
      new.status := case when new.done then 'done'
                         when old.status = 'done' then 'todo'
                         else old.status end;
    end if;
    new.updated_at := now();
  end if;
  if new.done then
    new.done_at := coalesce(new.done_at, now());
    new.done_by := coalesce(new.done_by, auth.uid());
  else
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end $$;
drop trigger if exists sync_task_status_t on tasks;
create trigger sync_task_status_t before insert or update on tasks
for each row execute function sync_task_status();

-- Either side may move a task along (status, done). Rewriting what a task
-- says (title, detail, priority, due date) belongs to whoever wrote it, the
-- executive on that placement, or Relève. Without this, the update policy let
-- the talent quietly change the words of something they were asked to do.
create or replace function guard_task_edit() returns trigger language plpgsql as $$
begin
  if (new.title, coalesce(new.detail, ''), new.priority, coalesce(new.due_on, 'infinity'::date))
     is distinct from
     (old.title, coalesce(old.detail, ''), old.priority, coalesce(old.due_on, 'infinity'::date)) then
    if not (is_team_or_service()
            or old.created_by = auth.uid()
            or exists (select 1 from placements p
                        where p.id = old.placement_id and p.client_id = auth.uid())) then
      raise exception 'Only the person who added this task, or the executive, can change what it says.';
    end if;
  end if;
  if new.placement_id is distinct from old.placement_id or new.created_by is distinct from old.created_by then
    if not is_team_or_service() then
      raise exception 'A task cannot be moved to another placement.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_task_edit_t on tasks;
create trigger guard_task_edit_t before update on tasks
for each row execute function guard_task_edit();

create table if not exists task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  author_id   uuid not null references profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  is_question boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists task_comments_task_idx on task_comments (task_id, created_at);
alter table task_comments enable row level security;

drop policy if exists "read task comments" on task_comments;
create policy "read task comments" on task_comments for select
  using (is_admin() or exists (
    select 1 from tasks t where t.id = task_comments.task_id and in_placement(t.placement_id)));

drop policy if exists "write task comments" on task_comments;
create policy "write task comments" on task_comments for insert
  with check (author_id = auth.uid() and (is_admin() or exists (
    select 1 from tasks t where t.id = task_comments.task_id and in_placement(t.placement_id))));

drop policy if exists "remove own task comments" on task_comments;
create policy "remove own task comments" on task_comments for delete
  using (author_id = auth.uid() or is_admin());

-- ---------- 5. the talent's daily log ----------
-- What got done, hours, and blockers: private to the talent and Relève, the
-- same promise the weekly check-in makes. The executive sees only the
-- highlight the talent chooses to share (and the hours, for the month's
-- report), through placement_month_log() below, never this table.
create table if not exists talent_logs (
  id              uuid primary key default gen_random_uuid(),
  placement_id    uuid not null references placements(id) on delete cascade,
  talent_id       uuid not null references profiles(id) on delete cascade,
  log_date        date not null,
  done_text       text check (done_text is null or char_length(done_text) <= 4000),
  hours           numeric(4,2) check (hours is null or (hours >= 0 and hours <= 24)),
  blockers        text check (blockers is null or char_length(blockers) <= 2000),
  highlight       text check (highlight is null or char_length(highlight) <= 600),
  share_highlight boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (placement_id, log_date)
);
create index if not exists talent_logs_talent_idx on talent_logs (talent_id, log_date desc);
alter table talent_logs enable row level security;

drop policy if exists "talent reads own log" on talent_logs;
create policy "talent reads own log" on talent_logs for select
  using (talent_id = auth.uid() or is_admin());

drop policy if exists "talent writes own log" on talent_logs;
create policy "talent writes own log" on talent_logs for insert
  with check (talent_id = auth.uid() and exists (
    select 1 from placements p
     where p.id = talent_logs.placement_id and p.talent_id = auth.uid() and p.ended_on is null));

drop policy if exists "talent updates own log" on talent_logs;
create policy "talent updates own log" on talent_logs for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid() and exists (
    select 1 from placements p
     where p.id = talent_logs.placement_id and p.talent_id = auth.uid()));

drop policy if exists "talent removes own log" on talent_logs;
create policy "talent removes own log" on talent_logs for delete
  using (talent_id = auth.uid());

-- One month of a placement's log, as the executive may see it: the day, the
-- hours, and the highlight only where the talent chose to share it. What got
-- done in full and the blockers never leave through here.
create or replace function placement_month_log(p_placement uuid, p_month date)
returns table (log_date date, hours numeric, highlight text)
language sql stable security definer set search_path = public as $$
  select l.log_date, l.hours,
         case when l.share_highlight then nullif(btrim(l.highlight), '') end
    from talent_logs l
    join placements p on p.id = l.placement_id
   where l.placement_id = p_placement
     and l.log_date >= date_trunc('month', p_month)::date
     and l.log_date <  (date_trunc('month', p_month) + interval '1 month')::date
     and (p.client_id = auth.uid() or p.talent_id = auth.uid() or is_team_or_service())
   order by l.log_date;
$$;
revoke execute on function placement_month_log(uuid, date) from public, anon;
grant execute on function placement_month_log(uuid, date) to authenticated, service_role;

-- ---------- 6. the executive's briefing for their talent ----------
create table if not exists talent_briefs (
  placement_id uuid primary key references placements(id) on delete cascade,
  tools        text check (tools is null or char_length(tools) <= 4000),
  access       text check (access is null or char_length(access) <= 4000),
  preferences  text check (preferences is null or char_length(preferences) <= 4000),
  rhythm       text check (rhythm is null or char_length(rhythm) <= 4000),
  ask_first    text check (ask_first is null or char_length(ask_first) <= 4000),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references profiles(id) on delete set null
);
alter table talent_briefs enable row level security;

drop policy if exists "placement reads brief" on talent_briefs;
create policy "placement reads brief" on talent_briefs for select
  using (is_admin() or in_placement(placement_id));

drop policy if exists "executive or team writes brief" on talent_briefs;
create policy "executive or team writes brief" on talent_briefs for insert
  with check (is_admin() or exists (
    select 1 from placements p where p.id = talent_briefs.placement_id and p.client_id = auth.uid()));

drop policy if exists "executive or team edits brief" on talent_briefs;
create policy "executive or team edits brief" on talent_briefs for update
  using (is_admin() or exists (
    select 1 from placements p where p.id = talent_briefs.placement_id and p.client_id = auth.uid()))
  with check (is_admin() or exists (
    select 1 from placements p where p.id = talent_briefs.placement_id and p.client_id = auth.uid()));

-- ---------- 7. client requests ----------
-- Asking for a replacement, a pause, or a quarterly review used to mean
-- writing a message and hoping it was read as a request. Each is now a row
-- the console's Care page lists with a clear next action.
create table if not exists client_requests (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  client_id    uuid not null references profiles(id) on delete cascade,
  kind         text not null check (kind in ('replacement', 'pause', 'quarterly_review')),
  note         text check (note is null or char_length(note) <= 4000),
  preferred    text check (preferred is null or char_length(preferred) <= 400),
  pause_from   date,
  pause_until  date,
  state        text not null default 'open' check (state in ('open', 'in_hand', 'done', 'declined')),
  outcome      text check (outcome is null or char_length(outcome) <= 2000),
  created_at   timestamptz not null default now(),
  handled_at   timestamptz,
  handled_by   uuid references profiles(id) on delete set null,
  check (pause_until is null or pause_from is null or pause_until >= pause_from)
);
create index if not exists client_requests_open_idx on client_requests (state, created_at desc);
alter table client_requests enable row level security;

drop policy if exists "client reads own requests" on client_requests;
create policy "client reads own requests" on client_requests for select
  using (client_id = auth.uid() or is_admin());

drop policy if exists "client makes a request" on client_requests;
create policy "client makes a request" on client_requests for insert
  with check (
    is_admin() or (
      client_id = auth.uid() and state = 'open' and handled_at is null and handled_by is null
      and exists (select 1 from placements p
                   where p.id = client_requests.placement_id
                     and p.client_id = auth.uid() and p.ended_on is null)));

drop policy if exists "team handles requests" on client_requests;
create policy "team handles requests" on client_requests for update
  using (is_admin()) with check (is_admin());

-- ---------- 8. bookkeeping for the scheduled jobs ----------
-- Both jobs run with the service role (which passes row level security), so
-- these exist only to make each send happen once. The team may read them.
create table if not exists report_sends (
  placement_id uuid not null references placements(id) on delete cascade,
  month_of     date not null,
  sent_at      timestamptz not null default now(),
  primary key (placement_id, month_of)
);
alter table report_sends enable row level security;
drop policy if exists "team reads report sends" on report_sends;
create policy "team reads report sends" on report_sends for select using (is_admin());

create table if not exists interview_reminders (
  interview_id uuid not null references interviews(id) on delete cascade,
  kind         text not null check (kind in ('24h', '1h')),
  sent_at      timestamptz not null default now(),
  primary key (interview_id, kind)
);
alter table interview_reminders enable row level security;
drop policy if exists "team reads interview reminders" on interview_reminders;
create policy "team reads interview reminders" on interview_reminders for select using (is_admin());

do $$ begin raise notice 'PART 39 (experience) applied: read state, named managers, task status and comments, daily log, executive briefing, client requests, report and reminder bookkeeping.'; end $$;
