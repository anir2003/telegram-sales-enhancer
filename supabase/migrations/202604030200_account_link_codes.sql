-- Extend bot_link_codes to support both profile linking and account registration.
-- purpose = 'profile' (default, existing behavior) or 'account' (new: register sender account)
-- metadata stores extra info like account label and daily_limit for account registrations.

alter table public.bot_link_codes
add column if not exists purpose text not null default 'profile',
add column if not exists metadata jsonb not null default '{}'::jsonb;
