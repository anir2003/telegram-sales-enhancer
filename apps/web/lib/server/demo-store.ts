import type {
  ActivityLogRecord,
  CampaignLeadRecord,
  CampaignRecord,
  LeadRecord,
  SendTaskRecord,
  SequenceStepRecord,
  TelegramAccountRecord,
} from '@telegram-enhancer/shared';

const workspaceId = 'demo-workspace';
const now = new Date().toISOString();

export const demoWorkspace = {
  id: workspaceId,
  name: 'Primary Workspace',
  slug: 'primary-workspace',
  timezone: 'UTC',
};

export const demoProfile = {
  id: 'demo-profile',
  workspace_id: workspaceId,
  email: 'demo@workspace.local',
  full_name: 'Workspace Admin',
  role: 'admin',
};

export const demoState: {
  leads: LeadRecord[];
  accounts: TelegramAccountRecord[];
  campaigns: CampaignRecord[];
  steps: SequenceStepRecord[];
  campaignLeads: CampaignLeadRecord[];
  sendTasks: SendTaskRecord[];
  activity: ActivityLogRecord[];
  assignments: Array<{ id: string; workspace_id: string; campaign_id: string; telegram_account_id: string; message_limit: number | null; created_at: string }>;
  botCodes: Array<any>;
} = {
  leads: [
    {
      id: 'lead-1',
      workspace_id: workspaceId,
      first_name: 'Ava',
      last_name: 'Patel',
      company_name: 'Company A',
      telegram_username: 'avapatel',
      tags: ['ICP', 'Fintech'],
      notes: 'Prefers async intros.',
      source: 'CSV import',
      owner_id: null,
      profile_picture_url: null,
      telegram_exists: null,
      telegram_checked_at: null,
      created_at: now,
    },
    {
      id: 'lead-2',
      workspace_id: workspaceId,
      first_name: 'Leo',
      last_name: 'Martin',
      company_name: 'Company A',
      telegram_username: 'leomartin',
      tags: ['CTO'],
      notes: null,
      source: 'CSV import',
      owner_id: null,
      profile_picture_url: null,
      telegram_exists: null,
      telegram_checked_at: null,
      created_at: now,
    },
    {
      id: 'lead-3',
      workspace_id: workspaceId,
      first_name: 'Mina',
      last_name: 'Cho',
      company_name: 'Company B',
      telegram_username: 'minacho',
      tags: ['Warm'],
      notes: null,
      source: 'Manual',
      owner_id: null,
      profile_picture_url: null,
      telegram_exists: null,
      telegram_checked_at: null,
      created_at: now,
    },
  ],
  accounts: [
    {
      id: 'account-1',
      workspace_id: workspaceId,
      owner_id: null,
      telegram_user_id: null,
      label: 'Outbound 01',
      telegram_username: 'team_sender_01',
      daily_limit: 25,
      is_active: true,
      profile_picture_url: null,
      created_at: now,
      restricted_until: null,
      cooldown_until: null,
      restriction_reported_at: null,
      restriction_source_text: null,
    },
    {
      id: 'account-2',
      workspace_id: workspaceId,
      owner_id: null,
      telegram_user_id: null,
      label: 'Outbound 02',
      telegram_username: 'team_sender_02',
      daily_limit: 25,
      is_active: true,
      profile_picture_url: null,
      created_at: now,
      restricted_until: null,
      cooldown_until: null,
      restriction_reported_at: null,
      restriction_source_text: null,
    },
  ],
  campaigns: [
    {
      id: 'campaign-1',
      workspace_id: workspaceId,
      name: 'Founder Warm Intro',
      description: 'Manual-send enhancer for founder outreach.',
      status: 'draft',
      timezone: 'UTC',
      send_window_start: '09:00',
      send_window_end: '18:00',
      start_date: null,
      end_date: null,
      created_at: now,
    },
  ],
  steps: [
    {
      id: 'step-1',
      workspace_id: workspaceId,
      campaign_id: 'campaign-1',
      step_order: 1,
      step_name: 'Reachout',
      delay_days: 0,
      message_template: 'Hi {First Name}, reaching out from {Company}. Thought it could make sense to connect.',
      message_variants: ['Hi {First Name}, reaching out from {Company}. Thought it could make sense to connect.'],
    },
    {
      id: 'step-2',
      workspace_id: workspaceId,
      campaign_id: 'campaign-1',
      step_order: 2,
      step_name: 'Follow Up 1',
      delay_days: 2,
      message_template: 'Quick follow-up, {First Name}. Sharing this in case {Company} is exploring outbound support.',
      message_variants: ['Quick follow-up, {First Name}. Sharing this in case {Company} is exploring outbound support.'],
    },
  ],
  campaignLeads: [],
  sendTasks: [],
  activity: [],
  assignments: [
    {
      id: 'assignment-1',
      workspace_id: workspaceId,
      campaign_id: 'campaign-1',
      telegram_account_id: 'account-1',
      message_limit: null,
      created_at: now,
    },
    {
      id: 'assignment-2',
      workspace_id: workspaceId,
      campaign_id: 'campaign-1',
      telegram_account_id: 'account-2',
      message_limit: null,
      created_at: now,
    },
  ],
  botCodes: [],
};

export function demoId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
