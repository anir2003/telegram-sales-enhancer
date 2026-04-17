alter table public.telegram_group_lead_scrape_results
  add column if not exists company_name text,
  add column if not exists company_confidence double precision,
  add column if not exists company_reason text,
  add column if not exists ai_cleaned_at timestamptz;
