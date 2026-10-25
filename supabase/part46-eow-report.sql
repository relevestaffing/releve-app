-- PART 46: the weekly check-in becomes the end-of-week report.
--
-- Sage, 25 October 2026: every Friday the talent file their hours, the tasks
-- they accomplished, a win from the week, and any concerns. The old check-in
-- asked for what got done, what is in the way, a 1-to-5 rapport score and a
-- workload pick, which is a different question: it measured how the person
-- felt rather than recording what the week contained.
--
-- The table is kept, so every report already filed stays readable. Two
-- columns are added and the two rating columns are simply no longer asked
-- for; they stay in place so old rows keep their meaning.

alter table checkins add column if not exists hours numeric(5,1);
alter table checkins add column if not exists win   text;

comment on column checkins.hours is 'Hours worked in the week, as the talent reports them.';
comment on column checkins.win   is 'One win from the week, in their own words.';
comment on column checkins.shipped is 'Tasks accomplished this week.';
comment on column checkins.blocked is 'Concerns. Non-empty is what raises a hand.';

-- A hand goes up when somebody writes a concern. The two older conditions
-- stay so that reports filed before today still read the same way; nothing
-- new will set them, because the form no longer asks.
-- PART 43 rule: a trigger function carries its own search_path.
create or replace function flag_checkin() returns trigger
language plpgsql set search_path = public, auth, extensions as $$
begin
  new.needs_attention :=
    coalesce(nullif(btrim(coalesce(new.blocked, '')), ''), null) is not null
    or coalesce(new.rapport, 5) <= 2
    or new.workload = 'heavy';
  return new;
end $$;

drop trigger if exists checkin_flag on checkins;
create trigger checkin_flag before insert or update on checkins
  for each row execute function flag_checkin();
