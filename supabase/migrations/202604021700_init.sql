create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'UTC',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  telegram_user_id bigint unique,
  telegram_username text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  company_name text not null,
  telegram_username text not null,
  tags text[] not null default '{}',
  notes text,
  source text,
  owner_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, telegram_username)
);

create table if not exists public.telegram_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  label text not null,
  telegram_username text not null,
  daily_limit integer not null default 20,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, telegram_username)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  timezone text not null default 'UTC',
  send_window_start time not null default '09:00',
  send_window_end time not null default '18:00',
  launched_at timestamptz,
  paused_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.campaign_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  step_order integer not null,
  delay_days integer not null default 0,
  message_template text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id, step_order)
);

create table if not exists public.campaign_account_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  telegram_account_id uuid not null references public.telegram_accounts (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id, telegram_account_id)
);

create table if not exists public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'due', 'sent_waiting_followup', 'replied', 'skipped', 'completed', 'blocked')),
  assigned_account_id uuid references public.telegram_accounts (id) on delete set null,
  current_step_order integer not null default 0,
  next_step_order integer,
  next_due_at timestamptz,
  last_sent_at timestamptz,
  last_reply_at timestamptz,
  stop_reason text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id, lead_id)
);

create table if not exists public.send_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  campaign_lead_id uuid not null references public.campaign_leads (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  sequence_step_id uuid not null references public.campaign_sequence_steps (id) on delete cascade,
  assigned_account_id uuid not null references public.telegram_accounts (id) on delete cascade,
  claimed_by_profile_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'sent', 'skipped', 'expired')),
  step_order integer not null,
  due_at timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  rendered_message text not null,
  lead_snapshot jsonb not null default '{}'::jsonb,
  action_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  campaign_lead_id uuid references public.campaign_leads (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  telegram_account_id uuid references public.telegram_accounts (id) on delete set null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  event_label text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bot_link_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists leads_workspace_idx on public.leads (workspace_id, company_name);
create index if not exists campaign_workspace_idx on public.campaigns (workspace_id, status);
create index if not exists campaign_leads_due_idx on public.campaign_leads (workspace_id, status, next_due_at);
create index if not exists send_tasks_pending_idx on public.send_tasks (workspace_id, status, due_at);
create index if not exists activity_workspace_idx on public.activity_log (workspace_id, created_at desc);

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at before update on public.leads for each row execute function public.set_updated_at();
drop trigger if exists set_accounts_updated_at on public.telegram_accounts;
create trigger set_accounts_updated_at before update on public.telegram_accounts for each row execute function public.set_updated_at();
drop trigger if exists set_campaigns_updated_at on public.campaigns;
create trigger set_campaigns_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
drop trigger if exists set_steps_updated_at on public.campaign_sequence_steps;
create trigger set_steps_updated_at before update on public.campaign_sequence_steps for each row execute function public.set_updated_at();
drop trigger if exists set_campaign_leads_updated_at on public.campaign_leads;
create trigger set_campaign_leads_updated_at before update on public.campaign_leads for each row execute function public.set_updated_at();
drop trigger if exists set_send_tasks_updated_at on public.send_tasks;
create trigger set_send_tasks_updated_at before update on public.send_tasks for each row execute function public.set_updated_at();

create or replace function public.requesting_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_workspace_id uuid;
  next_role text := 'member';
begin
  select id into default_workspace_id
  from public.workspaces
  order by created_at asc
  limit 1;

  if default_workspace_id is null then
    insert into public.workspaces (name, slug, timezone)
    values ('Primary Workspace', 'primary-workspace', 'UTC')
    returning id into default_workspace_id;
  end if;

  if not exists (select 1 from public.profiles) then
    next_role := 'admin';
  end if;

  insert into public.profiles (id, workspace_id, email, full_name, role)
  values (
    new.id,
    default_workspace_id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    next_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.telegram_accounts enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_sequence_steps enable row level security;
alter table public.campaign_account_assignments enable row level security;
alter table public.campaign_leads enable row level security;
alter table public.send_tasks enable row level security;
alter table public.activity_log enable row level security;
alter table public.bot_link_codes enable row level security;

create policy "workspace read" on public.workspaces
for select using (id = public.requesting_workspace_id());

create policy "profiles read workspace" on public.profiles
for select using (workspace_id = public.requesting_workspace_id());

create policy "profiles update self" on public.profiles
for update using (id = auth.uid()) with check (workspace_id = public.requesting_workspace_id());

create policy "workspace access leads" on public.leads
for all using (workspace_id = public.requesting_workspace_id())
with check (workspace_id = public.requesting_workspace_id());

create policy "workspace access accounts" on public.telegram_accounts
for all using (workspace_id = public.requesting_workspace_id())
with check (workspace_id = public.requesting_workspace_id());

create policy "workspace access campaigns" on public.campaigns
for all using (workspace_id = public.requesting_workspace_id())
with check (workspace_id = public.requesting_workspace_id());

create policy "workspace access steps" on public.campaign_sequence_steps
for all using (workspace_id = public.requesting_workspace_id())
with check (workspace_id = public.requesting_workspace_id());

create policy "workspace access campaign account assignments" on public.campaign_account_assignments
for all using (workspace_id = public.requesting_workspace_id())
with check (workspace_id = public.requesting_workspace_id());

create policy "workspace access campaign leads" on public.campaign_leads
for all using (workspace_id = public.requesting_workspace_id())
with check (workspace_id = public.requesting_workspace_id());

create policy "workspace access send tasks" on public.send_tasks
for all using (workspace_id = public.requesting_workspace_id())
with check (workspace_id = public.requesting_workspace_id());

create policy "workspace access activity" on public.activity_log
for all using (workspace_id = public.requesting_workspace_id())
with check (workspace_id = public.requesting_workspace_id());

create policy "workspace access bot link codes" on public.bot_link_codes
for all using (workspace_id = public.requesting_workspace_id())
with check (workspace_id = public.requesting_workspace_id());
