create table if not exists public.workspace_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  label text not null,
  key_prefix text not null,
  key_hash text not null,          -- stores the AES-256-GCM encrypted value
  encrypted_value text not null,   -- same encrypted blob, kept explicit for clarity
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_api_keys_workspace_id_idx on public.workspace_api_keys (workspace_id);

create trigger set_workspace_api_keys_updated_at
  before update on public.workspace_api_keys
  for each row execute function public.set_updated_at();

alter table public.workspace_api_keys enable row level security;

create policy "workspace members can manage api keys"
  on public.workspace_api_keys
  for all
  using (
    workspace_id in (
      select workspace_id from public.profiles where id = auth.uid()
    )
  );
