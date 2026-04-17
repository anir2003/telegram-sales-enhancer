create table if not exists public.telegram_group_lead_scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  account_id uuid references public.telegram_connected_accounts (id) on delete set null,
  group_ref text not null,
  group_title text,
  mode text not null default 'auto' check (mode in ('auto', 'members', 'messages')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  total_found integer not null default 0,
  processed_count integer not null default 0,
  saved_count integer not null default 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.telegram_group_lead_scrape_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_id uuid not null references public.telegram_group_lead_scrape_jobs (id) on delete cascade,
  telegram_user_id text not null,
  name text not null default '',
  username text,
  bio text,
  premium boolean not null default false,
  avatar_data_url text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (job_id, telegram_user_id)
);

create index if not exists telegram_group_lead_scrape_jobs_workspace_idx
  on public.telegram_group_lead_scrape_jobs (workspace_id, created_at desc);

create index if not exists telegram_group_lead_scrape_results_job_idx
  on public.telegram_group_lead_scrape_results (workspace_id, job_id, created_at asc);

drop trigger if exists set_telegram_group_lead_scrape_jobs_updated_at on public.telegram_group_lead_scrape_jobs;
create trigger set_telegram_group_lead_scrape_jobs_updated_at
  before update on public.telegram_group_lead_scrape_jobs
  for each row execute function public.set_updated_at();

alter table public.telegram_group_lead_scrape_jobs enable row level security;
alter table public.telegram_group_lead_scrape_results enable row level security;

drop policy if exists "workspace access telegram group lead scrape jobs" on public.telegram_group_lead_scrape_jobs;
create policy "workspace access telegram group lead scrape jobs"
  on public.telegram_group_lead_scrape_jobs
  for all
  using (workspace_id = public.requesting_workspace_id())
  with check (workspace_id = public.requesting_workspace_id());

drop policy if exists "workspace access telegram group lead scrape results" on public.telegram_group_lead_scrape_results;
create policy "workspace access telegram group lead scrape results"
  on public.telegram_group_lead_scrape_results
  for all
  using (workspace_id = public.requesting_workspace_id())
  with check (workspace_id = public.requesting_workspace_id());
