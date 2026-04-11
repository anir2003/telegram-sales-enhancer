-- Add avatar_url columns for profile photos fetched during sync
alter table public.telegram_dialogs add column if not exists avatar_url text;
alter table public.telegram_connected_accounts add column if not exists avatar_url text;
