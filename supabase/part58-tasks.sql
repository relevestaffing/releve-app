-- PART 58: delegation, properly. 1 Nov 2026.
--   seen       the talent acknowledges a task; the executive sees when
--   review     a task the executive assigned waits for their review once the
--              talent finishes it; accept closes it, send back reopens it
--   files      documents on a task, both directions, in a private bucket
--   overdue    a daily nudge to the talent, and an escalation to Relève
--              after two days, each recorded so it happens once
-- Row level security on tasks is unchanged: both sides may move a task
-- along; only the author, the executive or Relève may rewrite its words.

alter table tasks add column if not exists seen_at      timestamptz;
alter table tasks add column if not exists seen_by      uuid references profiles(id) on delete set null;
alter table tasks add column if not exists review_note  text;
alter table tasks add column if not exists nudged_on    date;
alter table tasks add column if not exists escalated_on date;

alter table tasks drop constraint if exists tasks_status_chk;
alter table tasks add constraint tasks_status_chk
  check (status in ('todo', 'in_progress', 'waiting', 'review', 'done'));

comment on column tasks.seen_at is 'When the talent first opened this task after it was assigned.';
comment on column tasks.review_note is 'What the executive said when sending a finished task back.';

-- ---------- files on a task ----------
create table if not exists task_files (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  uploaded_by  uuid not null references profiles(id) on delete cascade,
  file_path    text not null,
  file_name    text not null,
  content_type text,
  size_bytes   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists task_files_task_idx on task_files (task_id, created_at);
alter table task_files enable row level security;

drop policy if exists "read task files" on task_files;
create policy "read task files" on task_files for select
  using (is_admin() or exists (
    select 1 from tasks t where t.id = task_files.task_id and in_placement(t.placement_id)));

drop policy if exists "add task files" on task_files;
create policy "add task files" on task_files for insert
  with check (uploaded_by = auth.uid() and (is_admin() or exists (
    select 1 from tasks t where t.id = task_files.task_id and in_placement(t.placement_id))));

drop policy if exists "remove own task files" on task_files;
create policy "remove own task files" on task_files for delete
  using (uploaded_by = auth.uid() or is_admin());

-- The bucket is private. Uploads and signed links go through the server,
-- which checks the task is on a placement the caller belongs to.
insert into storage.buckets (id, name, public)
  values ('task-files', 'task-files', false)
  on conflict (id) do nothing;
