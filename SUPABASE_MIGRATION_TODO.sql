-- Run this entire script in your Supabase SQL Editor

-- 1. Org Onboarding & Profile RLS Fixes
alter table public.workspaces
add column if not exists join_password_hash text;

alter table public.profiles
alter column workspace_id drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, workspace_id, email, full_name, role)
  values (
    new.id,
    null,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'member'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create policy "profiles read self" on public.profiles
for select using (id = auth.uid());

-- 2. Account Link Codes (extends bot_link_codes)
alter table public.bot_link_codes
add column if not exists purpose text not null default 'profile',
add column if not exists metadata jsonb not null default '{}'::jsonb;

-- 3. Campaign Dates (fixes campaign creation crash!)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS end_date date;

-- 4. Telegram Accounts Isolation Fix
-- Stores the Telegram User ID of secondary accounts so they can pull tasks autonomously.
ALTER TABLE telegram_accounts ADD COLUMN IF NOT EXISTS telegram_user_id bigint;
