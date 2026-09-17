-- ============================================================
-- PART 7 — picking a side, without a separate function
-- The rule ("once, and only if Relève has not already assigned one")
-- belongs in the trigger that guards every profile edit. Putting it
-- there means an ordinary update does the job, so nothing depends on
-- PostgREST having discovered a new function yet.
-- ============================================================
create or replace function guard_profile_edit() returns trigger language plpgsql as $$
declare i_am_admin boolean;
begin
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') into i_am_admin;

  if auth.uid() = new.id and not i_am_admin then
    new.rate_month := old.rate_month;   -- pay is set by Relève
    new.stage      := old.stage;        -- the team owns the pipeline stage
    new.assigned_by_releve := old.assigned_by_releve;

    if old.role_chosen_at is null
       and old.assigned_by_releve = false
       and old.role <> 'admin'
       and new.role in ('client', 'talent')
    then
      new.role_chosen_at := now();      -- the one-time choice: allowed, and stamped
    else
      new.role           := old.role;   -- every later attempt: ignored
      new.role_chosen_at := old.role_chosen_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profile_edit_guard on profiles;
create trigger profile_edit_guard before update on profiles
  for each row execute function guard_profile_edit();

drop function if exists choose_role(user_role);
