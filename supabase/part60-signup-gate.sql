-- PART 60: invitation-only accounts, enforced in the database.
-- A row can only be added to auth.users if Relève has already sent that email
-- an invitation (a pending_people row that nobody has claimed yet). This holds
-- for every route in: email link, Google, the public sign-up endpoint, anything
-- using the public anon key, and the dashboard setting for sign-ups.
-- It only fires on INSERT, so every existing account signs in exactly as before.
-- Triggers on auth.users run as supabase_auth_admin, so the function is
-- SECURITY DEFINER with its search_path pinned (see PART 43).

create or replace function public.gate_new_auth_user() returns trigger
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if new.email is not null and exists (
    select 1 from public.pending_people p
    where lower(p.email) = lower(new.email) and p.claimed_by is null
  ) then
    return new;
  end if;
  raise exception 'Relève accounts are opened by invitation only.' using errcode = 'P0001';
end $$;

revoke all on function public.gate_new_auth_user() from public, anon, authenticated;

drop trigger if exists gate_new_auth_user on auth.users;
create trigger gate_new_auth_user before insert on auth.users
  for each row execute function public.gate_new_auth_user();
