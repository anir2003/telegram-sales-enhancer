-- 1. Add step_name to campaign_sequence_steps
ALTER TABLE campaign_sequence_steps 
  ADD COLUMN IF NOT EXISTS step_name text;

-- 2. Add step_events JSONB to campaign_leads for per-step date tracking
ALTER TABLE campaign_leads 
  ADD COLUMN IF NOT EXISTS step_events jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Update the status CHECK constraint on campaign_leads to include new stages
ALTER TABLE campaign_leads DROP CONSTRAINT IF EXISTS campaign_leads_status_check;
ALTER TABLE campaign_leads ADD CONSTRAINT campaign_leads_status_check 
  CHECK (status IN (
    'queued', 'due', 'sent_waiting_followup', 
    'first_followup_done', 'replied', 'meeting_scheduled',
    'blocked', 'call_in_future', 'skipped', 'completed'
  ));
