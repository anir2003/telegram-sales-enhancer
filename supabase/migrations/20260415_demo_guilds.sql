create table if not exists public.workspace_demo_guild_traces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  trace_id text not null,
  name text not null,
  source text not null default 'manual',
  initial_url text,
  event_count integer not null default 0,
  event_counts jsonb not null default '{}'::jsonb,
  started_at_ms bigint not null default 0,
  ended_at_ms bigint not null default 0,
  duration_ms bigint not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  synced_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, trace_id)
);

create index if not exists workspace_demo_guild_traces_workspace_idx
  on public.workspace_demo_guild_traces (workspace_id, updated_at desc);

drop trigger if exists set_workspace_demo_guild_traces_updated_at on public.workspace_demo_guild_traces;
create trigger set_workspace_demo_guild_traces_updated_at
  before update on public.workspace_demo_guild_traces
  for each row execute function public.set_updated_at();

alter table public.workspace_demo_guild_traces enable row level security;

drop policy if exists "workspace members can manage demo guild traces" on public.workspace_demo_guild_traces;
create policy "workspace members can manage demo guild traces"
  on public.workspace_demo_guild_traces
  for all
  using (
    workspace_id in (
      select workspace_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select workspace_id from public.profiles where id = auth.uid()
    )
  );
