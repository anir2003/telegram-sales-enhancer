import { z } from 'zod';

export const campaignStatusValues = ['draft', 'active', 'paused', 'completed'] as const;
export const campaignLeadStatusValues = [
  'queued',
  'due',
  'sent_waiting_followup',
  'replied',
  'skipped',
  'completed',
  'blocked',
] as const;
export const sendTaskStatusValues = ['pending', 'claimed', 'sent', 'skipped', 'expired'] as const;

export type CampaignStatus = (typeof campaignStatusValues)[number];
export type CampaignLeadStatus = (typeof campaignLeadStatusValues)[number];
export type SendTaskStatus = (typeof sendTaskStatusValues)[number];

export const templatePlaceholders = [
  '{First Name}',
  '{Last Name}',
  '{Company}',
  '{Telegram Username}',
] as const;

export interface LeadRecord {
  id: string;
  workspace_id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  telegram_username: string;
  tags: string[];
  notes: string | null;
  source: string | null;
  owner_id: string | null;
  created_at: string;
}

export interface CampaignRecord {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  timezone: string;
  send_window_start: string;
  send_window_end: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface SequenceStepRecord {
  id: string;
  workspace_id: string;
  campaign_id: string;
  step_order: number;
  delay_days: number;
  message_template: string;
}

export interface TelegramAccountRecord {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  label: string;
  telegram_username: string;
  daily_limit: number;
  is_active: boolean;
  created_at: string;
}

export interface CampaignLeadRecord {
  id: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  status: CampaignLeadStatus;
  assigned_account_id: string | null;
  current_step_order: number;
  next_step_order: number | null;
  next_due_at: string | null;
  last_sent_at: string | null;
  last_reply_at: string | null;
  stop_reason: string | null;
  notes: string | null;
}

export interface SendTaskRecord {
  id: string;
  workspace_id: string;
  campaign_id: string;
  campaign_lead_id: string;
  lead_id: string;
  sequence_step_id: string;
  assigned_account_id: string;
  claimed_by_profile_id: string | null;
  status: SendTaskStatus;
  step_order: number;
  due_at: string;
  rendered_message: string;
}

export interface ActivityLogRecord {
  id: string;
  workspace_id: string;
  event_type: string;
  event_label: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export const leadInputSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().default(''),
  company_name: z.string().trim().default(''),
  telegram_username: z.string().trim().min(1),
  tags: z.array(z.string().trim()).default([]),
  notes: z.string().trim().nullish(),
  source: z.string().trim().nullish(),
  owner_id: z.string().uuid().nullish(),
});

export const sequenceStepInputSchema = z.object({
  step_order: z.number().int().min(1),
  delay_days: z.number().int().min(0),
  message_template: z.string().trim().min(1),
});

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullish(),
  timezone: z.string().trim().min(1).default('UTC'),
  send_window_start: z.string().trim().min(1).default('09:00'),
  send_window_end: z.string().trim().min(1).default('18:00'),
  start_date: z.string().trim().nullish(),
  end_date: z.string().trim().nullish(),
});

export const telegramAccountInputSchema = z.object({
  label: z.string().trim().min(1),
  telegram_username: z.string().trim().min(1),
  daily_limit: z.number().int().min(1).max(500),
  owner_id: z.string().uuid().nullish(),
  is_active: z.boolean().default(true),
});

export function normalizeTelegramUsername(value: string) {
  return value.replace(/^@/, '').trim();
}

export function renderMessageTemplate(template: string, lead: Pick<LeadRecord, 'first_name' | 'last_name' | 'company_name' | 'telegram_username'>) {
  return template
    .replaceAll('{First Name}', lead.first_name)
    .replaceAll('{Last Name}', lead.last_name)
    .replaceAll('{Company}', lead.company_name)
    .replaceAll('{Telegram Username}', normalizeTelegramUsername(lead.telegram_username));
}

export function validateTemplate(template: string) {
  const matches = template.match(/\{[^}]+\}/g) ?? [];
  const invalid = matches.filter((token) => !templatePlaceholders.includes(token as (typeof templatePlaceholders)[number]));
  return {
    valid: invalid.length === 0,
    invalid,
    allowed: [...templatePlaceholders],
  };
}

export function buildTelegramProfileUrl(username: string) {
  return `https://t.me/${normalizeTelegramUsername(username)}`;
}

export function createOneTimeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function computeNextDueAt({
  from,
  delayDays,
  timezone,
  sendWindowStart,
}: {
  from: Date;
  delayDays: number;
  timezone: string;
  sendWindowStart: string;
}) {
  const base = new Date(from);
  base.setUTCDate(base.getUTCDate() + delayDays);
  const [hours, minutes] = sendWindowStart.split(':').map(Number);
  const next = new Date(base);
  next.setUTCHours(hours ?? 9, minutes ?? 0, 0, 0);

  return {
    dueAtIso: next.toISOString(),
    timezone,
  };
}
