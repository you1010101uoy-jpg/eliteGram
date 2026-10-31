-- ELITIUM: базовая схема для ранней версии.
-- Выполняйте в Supabase SQL Editor. После выполнения проверьте RLS и Auth настройки.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null,
  avatar_url text,
  phone_searchable boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct','group')),
  title text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text default '',
  avatar_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_conversation_member(cid uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = cid and user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.channels enable row level security;

drop policy if exists "Profiles readable by signed in users" on public.profiles;
create policy "Profiles readable by signed in users" on public.profiles
for select to authenticated using (true);
drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile" on public.profiles
for insert to authenticated with check (id = auth.uid());
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Members can view conversations" on public.conversations;
create policy "Members can view conversations" on public.conversations
for select to authenticated using (public.is_conversation_member(id));
drop policy if exists "Authenticated users create conversations" on public.conversations;
create policy "Authenticated users create conversations" on public.conversations
for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "Members can view memberships" on public.conversation_members;
create policy "Members can view memberships" on public.conversation_members
for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Users can add themselves to conversation" on public.conversation_members;
create policy "Users can add themselves to conversation" on public.conversation_members
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages
for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages" on public.messages
for insert to authenticated with check (
  sender_id = auth.uid() and public.is_conversation_member(conversation_id)
);

drop policy if exists "Public channels readable" on public.channels;
create policy "Public channels readable" on public.channels
for select to authenticated using (is_public = true or owner_id = auth.uid());
drop policy if exists "Owners create channels" on public.channels;
create policy "Owners create channels" on public.channels
for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "Owners update channels" on public.channels;
create policy "Owners update channels" on public.channels
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Realtime: включите таблицу messages в Database → Replication, если она не включена.
