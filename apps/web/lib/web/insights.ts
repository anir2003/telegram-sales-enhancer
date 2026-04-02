export type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  telegram_username: string;
  tags: string[];
  source?: string | null;
};

export type Account = {
  id: string;
  label: string;
  telegram_username: string;
  daily_limit: number;
  is_active: boolean;
};

export type Campaign = {
  id: string;
  name: string;
  status: string;
  timezone: string;
  send_window_start: string;
  send_window_end: string;
  description?: string | null;
};

export type CampaignLead = {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: string;
  assigned_account_id: string | null;
  current_step_order: number;
  next_step_order: number | null;
  next_due_at: string | null;
  last_sent_at: string | null;
  last_reply_at: string | null;
  stop_reason: string | null;
  notes: string | null;
};

export type SequenceStep = {
  id: string;
  campaign_id: string;
  step_order: number;
  delay_days: number;
  message_template: string;
};

export type Activity = {
  id: string;
  event_type: string;
  event_label: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type CampaignDetail = {
  campaign: Campaign | null;
  steps: SequenceStep[];
  attachedLeads: CampaignLead[];
  accounts: Account[];
  assignedAccountIds: string[];
  leads: Lead[];
};

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function isToday(value: string | null | undefined) {
  if (!value) return false;
  return sameDay(new Date(value), new Date());
}

export function isYesterday(value: string | null | undefined) {
  if (!value) return false;
  const yesterday = startOfDay(new Date());
  yesterday.setDate(yesterday.getDate() - 1);
  return sameDay(new Date(value), yesterday);
}

export function summariseCampaign(detail: CampaignDetail, activity: Activity[] = []) {
  const totalLeads = detail.attachedLeads.length;
  const replies = detail.attachedLeads.filter((lead) => lead.status === 'replied').length;
  const blocked = detail.attachedLeads.filter((lead) => lead.status === 'blocked').length;
  const active = detail.attachedLeads.filter((lead) => ['due', 'queued', 'sent_waiting_followup'].includes(lead.status)).length;
  const completed = detail.attachedLeads.filter((lead) => lead.status === 'completed').length;
  const sent = detail.attachedLeads.filter((lead) => Boolean(lead.last_sent_at)).length;
  const replyRate = sent ? Math.round((replies / sent) * 100) : 0;
  const sentToday = detail.attachedLeads.filter((lead) => isToday(lead.last_sent_at)).length;
  const assignedAccounts = detail.accounts.filter((account) => detail.assignedAccountIds.includes(account.id));
  const campaignActivity = activity.filter((entry) => String(entry.payload?.campaign_id ?? '') === detail.campaign?.id);

  return {
    totalLeads,
    replies,
    blocked,
    active,
    completed,
    sent,
    sentToday,
    replyRate,
    assignedAccounts,
    activityCount: campaignActivity.length,
  };
}

export function buildHeatmap(activity: Activity[], days = 21) {
  const today = startOfDay(new Date());
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    const iso = date.toISOString().slice(0, 10);
    return {
      iso,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: 0,
    };
  });

  activity.forEach((entry) => {
    if (!entry.event_type.startsWith('task.')) return;
    const iso = new Date(entry.created_at).toISOString().slice(0, 10);
    const bucket = buckets.find((item) => item.iso === iso);
    if (bucket) bucket.count += 1;
  });

  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return buckets.map((bucket) => ({
    ...bucket,
    intensity: bucket.count / maxCount,
  }));
}

export function buildAccountInsights(accounts: Account[], details: CampaignDetail[]) {
  return accounts.map((account) => {
    const relatedCampaigns = details.filter((detail) => detail.assignedAccountIds.includes(account.id));
    const campaignNames = relatedCampaigns.map((detail) => detail.campaign?.name).filter(Boolean) as string[];
    const assignedLeads = relatedCampaigns.flatMap((detail) =>
      detail.attachedLeads.filter((lead) => lead.assigned_account_id === account.id),
    );
    const sentToday = assignedLeads.filter((lead) => isToday(lead.last_sent_at)).length;
    const sentYesterday = assignedLeads.filter((lead) => isYesterday(lead.last_sent_at)).length;
    const activeLeads = assignedLeads.filter((lead) => ['due', 'queued', 'sent_waiting_followup'].includes(lead.status)).length;

    return {
      ...account,
      campaignCount: campaignNames.length,
      campaignNames,
      assignedLeadCount: assignedLeads.length,
      activeLeads,
      sentToday,
      sentYesterday,
      utilization: Math.min(100, Math.round((sentToday / Math.max(account.daily_limit, 1)) * 100)),
    };
  });
}

export function buildLeadMemberships(leads: Lead[], details: CampaignDetail[]) {
  return leads.map((lead) => {
    const memberships = details.flatMap((detail) =>
      detail.attachedLeads
        .filter((item) => item.lead_id === lead.id)
        .map((item) => ({
          campaignId: detail.campaign?.id ?? '',
          campaignName: detail.campaign?.name ?? 'Campaign',
          status: item.status,
        })),
    );

    return {
      ...lead,
      memberships,
      campaignCount: memberships.length,
    };
  });
}

export function formatPercent(value: number) {
  return `${value}%`;
}

export function formatWindow(campaign: Campaign) {
  return `${campaign.send_window_start} -> ${campaign.send_window_end}`;
}
