-- Push notification subscriptions (web push / VAPID). 1 Nov 2026.
-- One row per browser/device a person has turned notifications on in.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A person can see and remove their own subscriptions. Inserts/sends are done
-- server-side with the service role, which bypasses RLS.
drop policy if exists "own push subs select" on public.push_subscriptions;
create policy "own push subs select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
drop policy if exists "own push subs delete" on public.push_subscriptions;
create policy "own push subs delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
