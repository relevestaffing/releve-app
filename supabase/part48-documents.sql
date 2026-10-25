-- PART 48: documents on every record.
--
-- Sage, 25 October 2026: payroll, invoices and documents are one of the
-- app's five purposes. Vetting documents and signed agreements each had a
-- home; everything else a staffing firm keeps on file did not. An NDA
-- addendum, a W-8BEN, a contract amendment, an SOP written for a placement,
-- a reference letter: there was nowhere to put them, so they lived in
-- email. One table, one private bucket, a Files card on each person and
-- each placement. Team only, deliberately: this is Relève's filing
-- cabinet, not a shared drive.

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  owner_kind  text not null check (owner_kind in ('person','placement')),
  owner_id    uuid not null,                 -- profiles.id or placements.id
  name        text not null,                 -- the file name as Sage sees it
  label       text,                          -- what it is, in her words
  file_path   text not null,                 -- inside the private 'documents' bucket
  mime        text not null,
  bytes       int  not null,
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index if not exists documents_owner on documents (owner_kind, owner_id, uploaded_at desc);

comment on table documents is
  'Relève''s filing cabinet: anything kept on a person or a placement that is not a vetting document or a signed agreement. Team only.';

alter table documents enable row level security;
drop policy if exists "team manages documents" on documents;
create policy "team manages documents" on documents
  for all using (is_admin()) with check (is_admin());

-- The bucket. NOT public: nothing here is reachable by URL alone, and the
-- app serves each file through a one-minute signed link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400,
        array['application/pdf','image/jpeg','image/png','image/webp',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false, file_size_limit = 26214400,
      allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

drop policy if exists "team reads documents" on storage.objects;
create policy "team reads documents" on storage.objects for select
  using (bucket_id = 'documents' and is_admin());
drop policy if exists "team uploads documents" on storage.objects;
create policy "team uploads documents" on storage.objects for insert
  with check (bucket_id = 'documents' and is_admin());
drop policy if exists "team removes documents" on storage.objects;
create policy "team removes documents" on storage.objects for delete
  using (bucket_id = 'documents' and is_admin());
