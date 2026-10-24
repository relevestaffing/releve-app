-- PART 44: signing in with the address Relève invited works again.
--
-- WHAT BROKE. PART 40 (archiving, 13 October 2026) rewrote guard_profile_edit()
-- in full, from the PART 21 text, and in doing so overwrote the PART 39
-- version. The PART 21 text decides by auth.uid() instead of by current_user,
-- so it also fires on claim_pending()'s own update (a security definer
-- function that runs inside the new person's session). claim_pending sets the
-- role to client, the guard sees a self-edit to client, and raises "An
-- executive account starts with a discovery call". The sign-in then fails with
-- "Your account could not be set up". Every invited executive and every
-- invited admin was affected from 13 October on.
--
-- THE FIX. Restore the PART 39 guard (it stands aside for the database's own
-- trusted paths via current_user) and carry PART 40's three archive columns
-- inside it, with a pinned search_path (PART 43). Rule going forward: when a
-- migration replaces a function, start from the newest definition, never from
-- an older part.

create or replace function guard_profile_edit() returns trigger language plpgsql set search_path = public, auth, extensions as $$
declare i_am_admin boolean := coalesce(is_admin(), false);
begin
  if current_user in ('anon', 'authenticated') then
    if not i_am_admin then
      new.id                 := old.id;
      new.email              := old.email;
      new.stage              := old.stage;          -- the team owns the pipeline stage
      new.assigned_by_releve := old.assigned_by_releve;
      -- PART 40: and the team owns whether you are archived.
      new.archived_at        := old.archived_at;
      new.archived_by        := old.archived_by;
      new.archive_reason     := old.archive_reason;

      if old.role_chosen_at is not null or old.assigned_by_releve = true or old.role = 'admin' then
        new.role           := old.role;              -- every later attempt: ignored
        new.role_chosen_at := old.role_chosen_at;
      elsif new.role = 'client' then
        raise exception 'An executive account starts with a discovery call. Talk to your Client Success Manager.';
      elsif new.role = 'talent' then
        new.role_chosen_at := now();                 -- the one-time choice: allowed, and stamped
      else
        new.role           := old.role;
        new.role_chosen_at := old.role_chosen_at;
      end if;

      if new.photo_url is distinct from old.photo_url and new.photo_url is not null
         and new.photo_url not like '/api/photo/view?u=' || new.id::text || '%' then
        new.photo_url := old.photo_url;
      end if;
      if new.intro_video_url is distinct from old.intro_video_url and new.intro_video_url is not null
         and new.intro_video_url not like '/api/video/view?u=' || new.id::text || '%' then
        new.intro_video_url := old.intro_video_url;
      end if;
    elsif new.role is distinct from old.role
          and (new.role = 'admin' or old.role = 'admin')
          and not is_owner() then
      raise exception 'Only an owner can change who has console access.';
    end if;
  end if;

  if old.role = 'admin' and new.role is distinct from 'admin'
     and is_owner_id(old.id) and owners_besides(old.id) = 0 then
    raise exception 'Relève always keeps at least one owner. Make someone else an owner first.';
  end if;
  return new;
end $$;
