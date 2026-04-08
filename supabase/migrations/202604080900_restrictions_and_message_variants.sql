ALTER TABLE public.telegram_accounts
  ADD COLUMN IF NOT EXISTS restricted_until timestamptz,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS restriction_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS restriction_source_text text;

ALTER TABLE public.campaign_sequence_steps
  ADD COLUMN IF NOT EXISTS message_variants jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.campaign_sequence_steps
SET message_variants = CASE
  WHEN message_template IS NULL OR btrim(message_template) = '' THEN '[]'::jsonb
  ELSE jsonb_build_array(message_template)
END
WHERE message_variants = '[]'::jsonb
   OR jsonb_typeof(message_variants) IS DISTINCT FROM 'array';
