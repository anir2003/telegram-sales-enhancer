-- Add profile picture URL columns to leads and telegram_accounts
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS profile_picture_url text;

ALTER TABLE public.telegram_accounts
  ADD COLUMN IF NOT EXISTS profile_picture_url text;
