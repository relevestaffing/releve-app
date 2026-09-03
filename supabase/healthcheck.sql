select 'tables'    as thing, count(*)::text || ' of 10' as found,
       (count(*) = 10) as ok
  from pg_tables where schemaname='public'
   and tablename in ('profiles','signatures','signature_attempts','searches','matches',
                     'placements','pending_people','availability','interviews','calendar_connections')
union all
select 'views', count(*)::text || ' of 2', count(*) = 2
  from pg_views where schemaname='public' and viewname in ('talent_directory','interview_list')
union all
select 'security rules', count(*)::text || ' of 24', count(*) >= 24
  from pg_policies where schemaname in ('public','storage')
union all
select 'profile columns', count(*)::text || ' of 6', count(*) = 6
  from information_schema.columns where table_name='profiles'
   and column_name in ('bio','skills','onboarded_at','role_chosen_at','assigned_by_releve','photo_url')
union all
select 'role brief columns', count(*)::text || ' of 3', count(*) = 3
  from information_schema.columns where table_name='searches'
   and column_name in ('tools','pending_id','updated_at')
union all
select 'functions', count(*)::text || ' of 3', count(*) = 3
  from pg_proc where proname in ('is_admin','claim_pending','guard_profile_edit')
union all
select 'photo storage', coalesce((select id from storage.buckets where id='avatars'), 'MISSING'),
       exists (select 1 from storage.buckets where id='avatars')
union all
select 'part 7 applied', case when (select prosrc like '%assigned_by_releve = false%' from pg_proc where proname='guard_profile_edit') then 'yes' else 'no' end,
       (select prosrc like '%assigned_by_releve = false%' from pg_proc where proname='guard_profile_edit');
