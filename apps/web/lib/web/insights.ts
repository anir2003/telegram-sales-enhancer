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
  start_date?: string | null;
  end_date?: string | null;
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

export type HeatmapDay = {
  iso: string;
  label: string;
  count: number;
  intensity: number;
  dayOfWeek: number;
  weekIndex: number;
};

export function buildHeatmap(activity: Activity[], weeks = 12): { days: HeatmapDay[]; weeks: number; weekLabels: string[] } {
  const today = startOfDay(new Date());
  const todayDow = today.getDay(); // 0=Sun
  const totalDays = weeks * 7 + todayDow + 1;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - totalDays + 1);
  // align to Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const buckets: HeatmapDay[] = [];
  const current = new Date(startDate);
  let weekIdx = 0;
  let prevWeek = -1;

  while (current <= today) {
    const dow = current.getDay();
    if (dow === 0 && buckets.length > 0) weekIdx++;
    buckets.push({
      iso: current.toISOString().slice(0, 10),
      label: current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: 0,
      intensity: 0,
      dayOfWeek: dow,
      weekIndex: weekIdx,
    });
    current.setDate(current.getDate() + 1);
  }

  activity.forEach((entry) => {
    if (!entry.event_type.startsWith('task.')) return;
    const iso = new Date(entry.created_at).toISOString().slice(0, 10);
    const bucket = buckets.find((item) => item.iso === iso);
    if (bucket) bucket.count += 1;
  });

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  buckets.forEach((b) => { b.intensity = b.count / maxCount; });

  const totalWeeks = weekIdx + 1;
  const weekLabels: string[] = [];
  for (let w = 0; w < totalWeeks; w++) {
    const first = buckets.find((b) => b.weekIndex === w);
    if (first) {
      const d = new Date(first.iso);
      weekLabels.push(d.getDate() <= 7 ? d.toLocaleDateString(undefined, { month: 'short' }) : '');
    } else {
      weekLabels.push('');
    }
  }

  return { days: buckets, weeks: totalWeeks, weekLabels };
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
