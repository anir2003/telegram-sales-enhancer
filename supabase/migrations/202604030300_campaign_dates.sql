-- Add start_date and end_date to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS end_date date;
