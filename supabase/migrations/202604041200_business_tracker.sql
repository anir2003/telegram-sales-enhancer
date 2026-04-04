-- Business Tracker table for tracking company-level sales progress
CREATE TABLE IF NOT EXISTS public.business_tracker (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  comments text,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.telegram_accounts(id) ON DELETE SET NULL,
  current_status text DEFAULT 'Opportunity',
  group_created boolean DEFAULT false,
  follow_up_1_date date,
  follow_up_1_status text,
  follow_up_2_date date,
  follow_up_2_status text,
  follow_up_3_date date,
  follow_up_3_status text,
  follow_up_4_date date,
  follow_up_4_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.business_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_access_business_tracker" ON public.business_tracker
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  );
