-- PART 49: tasks that repeat weekly, and tasks with a time.
--
-- Sage, 25 October 2026: talent and executives can mark a task as
-- repeatable, so it comes back on the list every week, and can schedule a
-- task to a time, and put either on their Google Calendar from the app.
--
-- Repeating is done by the app, not by the database: finishing a weekly
-- task creates the next one seven days on, in the same series. Nothing
-- fires on a timer, so there is nothing to go wrong at 3am, and a task that
-- was never finished simply stays where it is rather than doubling.

alter table tasks add column if not exists due_time      time;
alter table tasks add column if not exists repeat_weekly boolean not null default false;
alter table tasks add column if not exists series_id     uuid;
create index if not exists tasks_series on tasks (series_id) where series_id is not null;

comment on column tasks.due_time      is 'Optional time on the due date, in the viewer''s own timezone.';
comment on column tasks.repeat_weekly is 'Finishing this task creates next week''s, in the same series.';
comment on column tasks.series_id     is 'Every occurrence of a weekly task shares one id; the first occurrence''s own id.';
