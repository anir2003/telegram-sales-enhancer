create table if not exists public.telegram_connected_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  profile_id uuid references public.profiles (id),
  phone text not null,
  telegram_user_id bigint,
  telegram_username text,
  display_name text,
  session_ciphertext text,
  pending_session_ciphertext text,
  phone_code_hash text,
  is_authenticated boolean not null default false,
  status text not null default 'pending_code' check (status in ('pending_code', 'authenticated', 'needs_reauth', 'disabled')),
  proxy_config_ciphertext text,
  proxy_redacted text,
  proxy_status text,
  proxy_checked_at timestamptz,
  last_sync_at timestamptz,
  last_inbox_update_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, phone)
);

create table if not exists public.telegram_dialogs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  account_id uuid not null references public.telegram_connected_accounts (id),
  telegram_dialog_id text not null,
  kind text not null default 'unknown' check (kind in ('user', 'group', 'channel', 'bot', 'unknown')),
  title text not null,
  username text,
  folder_id integer,
  folder_name text,
  crm_folder text not null default 'Inbox',
  unread_count integer not null default 0,
  is_unread boolean not null default false,
  is_replied boolean not null default false,
  last_message_at timestamptz,
  last_message_preview text,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, telegram_dialog_id)
);

create table if not exists public.telegram_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  account_id uuid not null references public.telegram_connected_accounts (id),
  dialog_id uuid not null references public.telegram_dialogs (id),
  telegram_message_id text not null,
  sender_name text,
  is_outbound boolean not null default false,
  text text not null default '',
  sent_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (dialog_id, telegram_message_id)
);

create table if not exists public.telegram_warmed_usernames (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  username text not null,
  label text,
  notes text,
  tags text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, username)
);

create table if not exists public.telegram_send_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  account_id uuid not null references public.telegram_connected_accounts (id),
  dialog_id uuid references public.telegram_dialogs (id),
  target_username text,
  message_text text not null,
  status text not null default 'pending_approval' check (status in ('draft', 'pending_approval', 'approved', 'sending', 'sent', 'failed', 'cancelled')),
  approved_by_profile_id uuid references public.profiles (id),
  approved_at timestamptz,
  delivery_result jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists telegram_connected_accounts_workspace_idx on public.telegram_connected_accounts (workspace_id, created_at desc);
create index if not exists telegram_dialogs_workspace_account_idx on public.telegram_dialogs (workspace_id, account_id, last_message_at desc);
create index if not exists telegram_dialogs_filters_idx on public.telegram_dialogs (workspace_id, crm_folder, is_replied, is_unread);
create index if not exists telegram_messages_dialog_idx on public.telegram_messages (dialog_id, sent_at desc);
create index if not exists telegram_warmed_usernames_workspace_idx on public.telegram_warmed_usernames (workspace_id, username);
create index if not exists telegram_send_approvals_worker_idx on public.telegram_send_approvals (workspace_id, status, created_at);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_telegram_connected_accounts_updated_at'
      and tgrelid = 'public.telegram_connected_accounts'::regclass
  ) then
    create trigger set_telegram_connected_accounts_updated_at
    before update on public.telegram_connected_accounts
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_telegram_dialogs_updated_at'
      and tgrelid = 'public.telegram_dialogs'::regclass
  ) then
    create trigger set_telegram_dialogs_updated_at
    before update on public.telegram_dialogs
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_telegram_send_approvals_updated_at'
      and tgrelid = 'public.telegram_send_approvals'::regclass
  ) then
    create trigger set_telegram_send_approvals_updated_at
    before update on public.telegram_send_approvals
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.telegram_connected_accounts enable row level security;
alter table public.telegram_dialogs enable row level security;
alter table public.telegram_messages enable row level security;
alter table public.telegram_warmed_usernames enable row level security;
alter table public.telegram_send_approvals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_connected_accounts'
      and policyname = 'workspace access telegram connected accounts'
  ) then
    create policy "workspace access telegram connected accounts" on public.telegram_connected_accounts
    for all using (workspace_id = public.requesting_workspace_id())
    with check (workspace_id = public.requesting_workspace_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_dialogs'
      and policyname = 'workspace access telegram dialogs'
  ) then
    create policy "workspace access telegram dialogs" on public.telegram_dialogs
    for all using (workspace_id = public.requesting_workspace_id())
    with check (workspace_id = public.requesting_workspace_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_messages'
      and policyname = 'workspace access telegram messages'
  ) then
    create policy "workspace access telegram messages" on public.telegram_messages
    for all using (workspace_id = public.requesting_workspace_id())
    with check (workspace_id = public.requesting_workspace_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_warmed_usernames'
      and policyname = 'workspace access telegram warmed usernames'
  ) then
    create policy "workspace access telegram warmed usernames" on public.telegram_warmed_usernames
    for all using (workspace_id = public.requesting_workspace_id())
    with check (workspace_id = public.requesting_workspace_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_send_approvals'
      and policyname = 'workspace access telegram send approvals'
  ) then
    create policy "workspace access telegram send approvals" on public.telegram_send_approvals
    for all using (workspace_id = public.requesting_workspace_id())
    with check (workspace_id = public.requesting_workspace_id());
  end if;
end $$;
