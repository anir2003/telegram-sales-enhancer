import { z } from 'zod';

export const campaignStatusValues = ['draft', 'active', 'paused', 'completed'] as const;
export const campaignLeadStatusValues = [
  'queued',
  'due',
  'sent_waiting_followup',
  'first_followup_done',
  'replied',
  'meeting_scheduled',
  'blocked',
  'call_in_future',
  'skipped',
  'completed',
] as const;
export const sendTaskStatusValues = ['pending', 'claimed', 'sent', 'skipped', 'expired'] as const;
export const tgConsoleAccountStatusValues = ['pending_code', 'authenticated', 'needs_reauth', 'disabled'] as const;
export const tgConsoleDialogKindValues = ['user', 'group', 'channel', 'bot', 'unknown'] as const;
export const tgConsoleSendStatusValues = ['draft', 'pending_approval', 'approved', 'sending', 'sent', 'failed', 'cancelled'] as const;
export const tgConsoleProxySchemeValues = ['socks5', 'http', 'https'] as const;

export type CampaignStatus = (typeof campaignStatusValues)[number];
export type CampaignLeadStatus = (typeof campaignLeadStatusValues)[number];
export type SendTaskStatus = (typeof sendTaskStatusValues)[number];
export type TgConsoleAccountStatus = (typeof tgConsoleAccountStatusValues)[number];
export type TgConsoleDialogKind = (typeof tgConsoleDialogKindValues)[number];
export type TgConsoleSendStatus = (typeof tgConsoleSendStatusValues)[number];
export type TgConsoleProxyScheme = (typeof tgConsoleProxySchemeValues)[number];

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
  profile_picture_url: string | null;
  telegram_exists: boolean | null;
  telegram_checked_at: string | null;
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

export interface StepEvent {
  step_order: number;
  step_name?: string;
  event: 'sent' | 'replied' | 'followup_sent';
  at: string;
  account_id?: string;
}

export interface SequenceStepRecord {
  id: string;
  workspace_id: string;
  campaign_id: string;
  step_order: number;
  step_name: string | null;
  delay_days: number;
  message_template: string;
  message_variants: string[];
}

export interface TelegramAccountRecord {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  telegram_user_id: number | null;
  label: string;
  telegram_username: string;
  daily_limit: number;
  is_active: boolean;
  created_at: string;
  profile_picture_url: string | null;
  restricted_until: string | null;
  cooldown_until: string | null;
  restriction_reported_at: string | null;
  restriction_source_text: string | null;
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
  step_events: StepEvent[];
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

export interface TgConsoleProxyConfig {
  scheme: TgConsoleProxyScheme;
  ip?: string | null;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}

export interface TgConsoleAccountRecord {
  id: string;
  workspace_id: string;
  profile_id: string | null;
  phone: string;
  telegram_user_id: string | null;
  telegram_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_authenticated: boolean;
  status: TgConsoleAccountStatus;
  proxy_redacted: string | null;
  proxy_status: string | null;
  proxy_checked_at: string | null;
  last_sync_at: string | null;
  last_inbox_update_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TgConsoleDialogRecord {
  id: string;
  workspace_id: string;
  account_id: string;
  telegram_dialog_id: string;
  kind: TgConsoleDialogKind;
  title: string;
  username: string | null;
  folder_id: number | null;
  folder_name: string | null;
  crm_folder: string;
  unread_count: number;
  is_unread: boolean;
  is_replied: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  tags: string[];
  notes: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TgConsoleMessageRecord {
  id: string;
  workspace_id: string;
  account_id: string;
  dialog_id: string;
  telegram_message_id: string;
  sender_name: string | null;
  is_outbound: boolean;
  text: string;
  sent_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TgWarmedUsernameRecord {
  id: string;
  workspace_id: string;
  username: string;
  label: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
}

export interface TgSendApprovalRecord {
  id: string;
  workspace_id: string;
  account_id: string;
  dialog_id: string | null;
  target_username: string | null;
  message_text: string;
  status: TgConsoleSendStatus;
  approved_by_profile_id: string | null;
  approved_at: string | null;
  delivery_result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
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

const messageVariantsSchema = z.array(z.string().trim()).default([]);

export const sequenceStepInputSchema = z.object({
  step_order: z.number().int().min(1),
  step_name: z.string().trim().nullish(),
  delay_days: z.number().int().min(0),
  message_template: z.string().trim().optional(),
  message_variants: messageVariantsSchema.optional(),
}).superRefine((value, ctx) => {
  const variants = normalizeMessageVariants(value);
  if (!variants.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add at least one message option.',
      path: ['message_variants'],
    });
  }
});

export const sequenceStepUpdateSchema = z.object({
  step_order: z.number().int().min(1).optional(),
  step_name: z.string().trim().nullish(),
  delay_days: z.number().int().min(0).optional(),
  message_template: z.string().trim().optional(),
  message_variants: messageVariantsSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.message_template === undefined && value.message_variants === undefined) {
    return;
  }
  const variants = normalizeMessageVariants(value);
  if (!variants.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add at least one message option.',
      path: ['message_variants'],
    });
  }
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

export const tgConsolePhoneSchema = z.object({
  phone: z.string().trim().min(6).max(32),
});

export const tgConsoleProxySchema = z.object({
  scheme: z.enum(tgConsoleProxySchemeValues).default('socks5'),
  ip: z.string().trim().max(255).optional().nullable(),
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().trim().max(255).optional().nullable(),
  password: z.string().max(1024).optional().nullable(),
});

export const tgConsoleDialogUpdateSchema = z.object({
  crm_folder: z.string().trim().min(1).max(64).optional(),
  tags: z.array(z.string().trim().min(1).max(48)).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  is_replied: z.boolean().optional(),
  is_unread: z.boolean().optional(),
});

export const tgWarmedUsernameInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  label: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(48)).default([]),
});

export const tgSendApprovalInputSchema = z.object({
  account_id: z.string().trim().min(1),
  dialog_ids: z.array(z.string().trim().min(1)).default([]),
  target_usernames: z.array(z.string().trim().min(1).max(64)).default([]),
  message_text: z.string().trim().min(1).max(4000),
  approve_now: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (!value.dialog_ids.length && !value.target_usernames.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Choose at least one dialog or warmed username.',
      path: ['dialog_ids'],
    });
  }
});

export function normalizeTelegramUsername(value: string) {
  return value.replace(/^@/, '').trim();
}

export function redactTgProxyConfig(proxy: TgConsoleProxyConfig | null | undefined) {
  if (!proxy) return null;
  const auth = proxy.username ? `${proxy.username}:***@` : '';
  const ipNote = proxy.ip && proxy.ip !== proxy.host ? ` (${proxy.ip})` : '';
  return `${proxy.scheme}://${auth}${proxy.host}:${proxy.port}${ipNote}`;
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

export function normalizeMessageVariants(input: {
  message_template?: string | null;
  message_variants?: string[] | null;
}) {
  const variants = (input.message_variants ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (variants.length) return variants;
  const fallback = input.message_template?.trim();
  return fallback ? [fallback] : [];
}

export function getSequenceStepVariants(step: Pick<SequenceStepRecord, 'message_template' | 'message_variants'>) {
  return normalizeMessageVariants(step);
}

export function pickRandomMessageVariant(
  variants: string[],
  options?: { exclude?: string | null },
) {
  const trimmed = variants.map((item) => item.trim()).filter(Boolean);
  if (!trimmed.length) return '';
  const exclude = options?.exclude?.trim();
  const pool = exclude ? trimmed.filter((item) => item !== exclude) : trimmed;
  const source = pool.length ? pool : trimmed;
  return source[Math.floor(Math.random() * source.length)];
}

export type AccountRestrictionStatus = 'normal' | 'restricted' | 'cooldown' | 'recovering';

export function getAccountRestrictionState(
  account: Pick<TelegramAccountRecord, 'daily_limit' | 'restricted_until' | 'cooldown_until'>,
  at = new Date(),
) {
  const now = at.getTime();
  const restrictedUntilMs = account.restricted_until ? new Date(account.restricted_until).getTime() : null;
  const cooldownUntilMs = account.cooldown_until ? new Date(account.cooldown_until).getTime() : null;

  if (restrictedUntilMs && now < restrictedUntilMs) {
    return {
      status: 'restricted' as AccountRestrictionStatus,
      multiplier: 0,
      effectiveDailyLimit: 0,
      recoveryCompleteAt: cooldownUntilMs ? new Date(cooldownUntilMs + 3 * 86400000).toISOString() : null,
      hasWarning: true,
    };
  }

  if (cooldownUntilMs && now < cooldownUntilMs) {
    return {
      status: 'cooldown' as AccountRestrictionStatus,
      multiplier: 0,
      effectiveDailyLimit: 0,
      recoveryCompleteAt: new Date(cooldownUntilMs + 3 * 86400000).toISOString(),
      hasWarning: true,
    };
  }

  if (cooldownUntilMs) {
    const daysSinceCooldown = Math.floor((now - cooldownUntilMs) / 86400000);
    const ramp = [0.5, 0.65, 0.8, 1];
    const multiplier = ramp[Math.max(0, Math.min(daysSinceCooldown, ramp.length - 1))];
    const recoveryCompleteAt = new Date(cooldownUntilMs + (ramp.length - 1) * 86400000).toISOString();
    if (multiplier < 1) {
      return {
        status: 'recovering' as AccountRestrictionStatus,
        multiplier,
        effectiveDailyLimit: Math.max(1, Math.floor(account.daily_limit * multiplier)),
        recoveryCompleteAt,
        hasWarning: true,
      };
    }
  }

  return {
    status: 'normal' as AccountRestrictionStatus,
    multiplier: 1,
    effectiveDailyLimit: account.daily_limit,
    recoveryCompleteAt: null,
    hasWarning: false,
  };
}

export function parseSpamBotRestrictionUntil(message: string) {
  const patterns = [
    /limited until\s+([^.]+?\bUTC)\.?/i,
    /released on\s+([^.]+?\bUTC)\.?/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;
    const parsed = new Date(match[1].trim());
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
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
