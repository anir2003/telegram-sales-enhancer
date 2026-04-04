-- Calendar Highlights Table
-- Run this SQL in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS calendar_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_highlighted BOOLEAN DEFAULT false,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, date)
);

-- Enable RLS
ALTER TABLE calendar_highlights ENABLE ROW LEVEL SECURITY;

-- RLS Policy: workspace members can manage their own highlights
CREATE POLICY "workspace_access" ON calendar_highlights
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_calendar_highlights_workspace_date
  ON calendar_highlights(workspace_id, date);
