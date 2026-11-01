-- Relève's assistant. 1 Nov 2026.
--   ai_messages  what people ask and what they were told (the clearest view of
--                what the product leaves unclear)
--   ai_actions   every change the founder's assistant proposed, and what came
--                of it: proposed, done, failed or dismissed, with the result
-- Both are written server-side with the service role. The team can read them
-- from the console; nobody else can read anything.

create table if not exists public.ai_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null,
  question    text not null,
  answer      text not null,
  proposed    int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists ai_messages_user on public.ai_messages(user_id, created_at desc);

create table if not exists public.ai_actions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null,
  params       jsonb not null default '{}'::jsonb,
  summary      text not null,
  status       text not null default 'proposed' check (status in ('proposed','done','failed','dismissed')),
  result       jsonb,
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists ai_actions_created on public.ai_actions(created_at desc);

alter table public.ai_messages enable row level security;
alter table public.ai_actions  enable row level security;

drop policy if exists "team reads ai messages" on public.ai_messages;
create policy "team reads ai messages" on public.ai_messages for select using (is_admin());
drop policy if exists "team reads ai actions" on public.ai_actions;
create policy "team reads ai actions" on public.ai_actions for select using (is_admin());
