ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS telegram_exists boolean,
  ADD COLUMN IF NOT EXISTS telegram_checked_at timestamptz;
