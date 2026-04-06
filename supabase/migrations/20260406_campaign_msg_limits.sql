-- Campaign-level message limits per account assignment
-- NULL means "use the account's global daily_limit"
ALTER TABLE public.campaign_account_assignments
  ADD COLUMN IF NOT EXISTS message_limit integer;
