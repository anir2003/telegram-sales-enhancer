alter table public.telegram_send_approvals
add column if not exists scheduled_for timestamptz,
add column if not exists media_name text,
add column if not exists media_mime_type text,
add column if not exists media_size integer,
add column if not exists media_base64 text;

alter table public.telegram_send_approvals
drop constraint if exists telegram_send_approvals_status_check;

alter table public.telegram_send_approvals
add constraint telegram_send_approvals_status_check
check (status in ('draft', 'pending_approval', 'scheduled', 'approved', 'sending', 'sent', 'failed', 'cancelled'));

create index if not exists telegram_send_approvals_due_idx
on public.telegram_send_approvals (status, scheduled_for, created_at)
where status in ('approved', 'scheduled');
