-- PART 43: removing an account from the console no longer fails with
-- "Database error deleting user". APPLIED TO PRODUCTION 23 Oct 2026.
--
-- WHY IT FAILED. Deleting a person calls Supabase Auth, which deletes the
-- auth user as the role supabase_auth_admin, whose search_path is "auth" only.
-- The delete cascades into the person's invoices, and guard_invoice_delete()
-- (a BEFORE DELETE trigger) calls money_trusted() and is_owner() by bare name.
-- With a search_path of "auth" those names do not resolve, so Postgres raises
-- "function money_trusted() does not exist" and Auth reports it as a database
-- error. Any executive with an invoice on file, even a draft or a void one,
-- hit it. An executive with no invoices did not, which is why it looked random.
--
-- THE FIX. Pin a search_path on every trigger function in public that has none.
-- For the app's own roles (authenticated, service_role) the path already
-- included public, so nothing changes for them. Idempotent: functions that
-- already carry a search_path are left alone.
--
-- RULE FOR NEW MIGRATIONS: any trigger function that runs on a table a person's
-- account cascades into must either schema-qualify what it calls or carry
-- "set search_path = public, auth, extensions". Re-run this file after adding one.

do $$
declare f record; n int := 0;
begin
  for f in
    select distinct p.oid::regprocedure as sig
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace ns on ns.oid = p.pronamespace
    where not t.tgisinternal and ns.nspname = 'public' and p.proconfig is null
  loop
    execute format('alter function %s set search_path = public, auth, extensions', f.sig);
    n := n + 1;
  end loop;
  raise notice 'pinned % trigger functions', n;
end $$;
