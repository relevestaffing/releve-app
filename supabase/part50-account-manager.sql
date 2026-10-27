-- PART 50: the account manager, held end to end.
--
-- Sage, 27 October 2026: a Client Success Manager looks after an executive,
-- and a Talent Success Manager after a talent, from onboarding onward, not
-- only once a placement exists. Until now the manager lived on the placement
-- (placements.csm_id / placements.tsm_id), so a person who had paid a deposit
-- and was waiting on their first match had no named owner. These two columns
-- put the owner on the person. A new placement still defaults its own
-- managers from here, so the placement view keeps working as before.
--
-- Lanes enforcement (who may read and change what) is a separate migration
-- built later. This file only adds the columns, their comments and indexes.

alter table profiles add column if not exists csm_id uuid references profiles(id);
alter table profiles add column if not exists tsm_id uuid references profiles(id);

comment on column profiles.csm_id is 'The Client Success Manager who owns this executive''s account, end to end.';
comment on column profiles.tsm_id is 'The Talent Success Manager who owns this talent, end to end.';

create index if not exists profiles_csm on profiles(csm_id) where csm_id is not null;
create index if not exists profiles_tsm on profiles(tsm_id) where tsm_id is not null;
