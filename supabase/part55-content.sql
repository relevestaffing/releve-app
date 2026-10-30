-- PART 55 — the content engine (30 October 2026)
--
-- Claude drafts a full week of Relève social content every Thursday:
--   li_personal     Sage's LinkedIn, 6 a week, her words plus an image she picks
--   li_group        a training post or carousel for 4 LinkedIn groups, 5 a week
--                   (one is a face-to-camera video script); posted by hand
--   ig_client       @relevestaffing on Instagram + Facebook, 6 a week
--   ig_careers      the careers account on Instagram + Facebook, 3 a week
--   li_page_client  the Relève LinkedIn page, a copy of each client post
--   li_page_careers the careers LinkedIn page, a copy of each careers post
-- Everything posts on schedule unless held. Posts nobody can publish for us
-- (groups, and the LinkedIn pages until LinkedIn approves page access) are
-- 'manual' and land in the team's 7:00 AM email and the Content tab.
-- Re-runnable.

create table if not exists content_posts (
  id          uuid primary key default gen_random_uuid(),
  slot        text unique not null,                -- e.g. 2026-11-02-ig_client-mon
  week_start  date not null,                       -- the Monday of its week (Pacific)
  channel     text not null check (channel in
                ('li_personal','li_group','ig_client','ig_careers','li_page_client','li_page_careers')),
  format      text not null check (format in ('text','card','carousel','video')),
  publish_at  timestamptz not null,
  status      text not null default 'scheduled' check (status in
                ('needs_image','needs_video','scheduled','held','manual','publishing','posted','failed','skipped')),
  hold_reason text,
  topic       text,
  hook        text,
  caption     text not null default '',            -- the main caption (LinkedIn / Instagram)
  caption_fb  text,                                -- Facebook's version, when it differs
  card        jsonb,                               -- a single graphic: {kicker, quote, sub}
  slides      jsonb not null default '[]'::jsonb,  -- a carousel: [{title, body}]
  script      jsonb,                               -- a video: {hook, beats[], close, onscreen[]}
  image_idea  text,                                -- for Sage's posts: what picture fits
  image_path  text,                                -- storage path in the 'content' bucket
  video_path  text,
  parent_id   uuid references content_posts(id) on delete cascade,  -- a cross-post's source
  results     jsonb not null default '{}'::jsonb,  -- per target: {instagram:{id,at}, facebook:{...}, linkedin:{...}, groups:{"0":at,...}, ig_container:...}
  error       text,
  posted_at   timestamptz,
  written_by  text not null default 'claude' check (written_by in ('claude','team')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists content_posts_due on content_posts (status, publish_at);
create index if not exists content_posts_week on content_posts (week_start);

-- Settings and connections. Tokens live here, readable by the server only:
-- row level security is on and no policy grants a browser anything, except
-- the team reading and writing the plain settings rows (never 'conn:' rows).
create table if not exists content_settings (
  key        text primary key,                     -- 'groups', 'conn:meta', 'conn:linkedin', 'digest:2026-11-02', 'draft:2026-11-02'
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table content_posts enable row level security;
alter table content_settings enable row level security;
drop policy if exists "team manages content" on content_posts;
create policy "team manages content" on content_posts for all using (is_admin()) with check (is_admin());
drop policy if exists "team manages content settings" on content_settings;
create policy "team manages content settings" on content_settings for all
  using (is_admin() and key not like 'conn:%') with check (is_admin() and key not like 'conn:%');

-- Pictures and videos for posts. Public, because Instagram and Facebook
-- fetch the file from its URL when they publish; every path is random.
-- No size limit of its own: the project's upload limit applies (50 MB on the
-- free plan, so record videos at 1080p and under about a minute).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content', 'content', true, null,
        array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do update
  set public = true, file_size_limit = null,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'];

drop policy if exists "team uploads content" on storage.objects;
create policy "team uploads content" on storage.objects for insert
  with check (bucket_id = 'content' and is_admin());
drop policy if exists "team updates content" on storage.objects;
create policy "team updates content" on storage.objects for update
  using (bucket_id = 'content' and is_admin());
drop policy if exists "team deletes content" on storage.objects;
create policy "team deletes content" on storage.objects for delete
  using (bucket_id = 'content' and is_admin());

comment on table content_posts is
  'Relève social content: Claude drafts each week on Thursday; posts on schedule unless held. Part 55.';
