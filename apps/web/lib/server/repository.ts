import {
  buildTelegramProfileUrl,
  campaignInputSchema,
  createOneTimeCode,
  getAccountRestrictionState,
  getSequenceStepVariants,
  leadInputSchema,
  normalizeTelegramUsername,
  normalizeMessageVariants,
  parseSpamBotRestrictionUntil,
  pickRandomMessageVariant,
  renderMessageTemplate,
  sequenceStepInputSchema,
  sequenceStepUpdateSchema,
  telegramAccountInputSchema,
  redactTgProxyConfig,
  tgConsoleDialogUpdateSchema,
  tgConsolePhoneSchema,
  tgConsoleProxySchema,
  tgSendApprovalInputSchema,
  tgWarmedUsernameInputSchema,
  type ActivityLogRecord,
  type CampaignLeadRecord,
  type CampaignRecord,
  type LeadRecord,
  type SendTaskRecord,
  type SequenceStepRecord,
  type TelegramAccountRecord,
  type TgConsoleAccountRecord,
  type TgConsoleDialogRecord,
  type TgConsoleMessageRecord,
  type TgConsoleProxyConfig,
  type TgSendApprovalRecord,
  type TgWarmedUsernameRecord,
} from '@telegram-enhancer/shared';
import Papa from 'papaparse';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { demoId, demoProfile, demoState, demoWorkspace } from '@/lib/server/demo-store';
import { isSupabaseConfigured } from '@/lib/env';

type WorkspaceContext = {
  workspaceId: string;
  profileId: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function addHours(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString();
}

function addDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}

function resolveStepMessagePayload(input: {
  message_template?: string | null;
  message_variants?: string[] | null;
}) {
  const messageVariants = normalizeMessageVariants(input);
  if (!messageVariants.length) {
    throw new Error('Add at least one message option.');
  }
  return {
    message_template: messageVariants[0],
    message_variants: messageVariants,
  };
}

function getEffectiveAccountLimit(account: Pick<TelegramAccountRecord, 'daily_limit' | 'restricted_until' | 'cooldown_until'>, at = new Date()) {
  return getAccountRestrictionState(account, at).effectiveDailyLimit;
}

function getEffectiveCampaignLimit(
  campaignLimit: number | null | undefined,
  account: Pick<TelegramAccountRecord, 'daily_limit' | 'restricted_until' | 'cooldown_until'>,
  at = new Date(),
) {
  if (campaignLimit === null || campaignLimit === undefined) return null;
  const multiplier = getAccountRestrictionState(account, at).multiplier;
  if (multiplier <= 0) return 0;
  return Math.max(1, Math.floor(campaignLimit * multiplier));
}

function isAccountSendable(account: Pick<TelegramAccountRecord, 'is_active' | 'daily_limit' | 'restricted_until' | 'cooldown_until'>, at = new Date()) {
  if (!account.is_active) return false;
  return getEffectiveAccountLimit(account, at) > 0;
}

function getRestrictionPauseUntil(account: Pick<TelegramAccountRecord, 'restricted_until' | 'cooldown_until'>) {
  return account.cooldown_until ?? account.restricted_until ?? null;
}

function getRecoveryWarningUntil(account: Pick<TelegramAccountRecord, 'cooldown_until'>) {
  return account.cooldown_until ? addDays(account.cooldown_until, 3) : null;
}

function pickRenderedMessageForStep(
  step: Pick<SequenceStepRecord, 'message_template' | 'message_variants'>,
  lead: Pick<LeadRecord, 'first_name' | 'last_name' | 'company_name' | 'telegram_username'>,
  options?: { excludeRendered?: string | null },
) {
  const renderedVariants = getSequenceStepVariants(step).map((variant) => renderMessageTemplate(variant, lead));
  const renderedMessage = pickRandomMessageVariant(renderedVariants, { exclude: options?.excludeRendered ?? null });
  if (!renderedMessage) {
    throw new Error('Sequence step has no message options.');
  }
  return renderedMessage;
}

const openCampaignLeadStatuses = [
  'queued',
  'due',
  'sent_waiting_followup',
  'first_followup_done',
  'blocked',
  'call_in_future',
  'meeting_scheduled',
] as const;

function compareCampaignLeadOrder(
  a: { id: string; created_at?: string | null },
  b: { id: string; created_at?: string | null },
) {
  const aCreated = a.created_at ?? '';
  const bCreated = b.created_at ?? '';
  if (aCreated === bCreated) return a.id.localeCompare(b.id);
  return aCreated.localeCompare(bCreated);
}

function isDue(value: string | null | undefined) {
  if (!value) return false;
  return new Date(value).getTime() <= Date.now();
}

function assertWorkspace(context: WorkspaceContext) {
  if (!context.workspaceId) {
    throw new Error('Workspace is required');
  }
}

function getDemoContext(): WorkspaceContext {
  return {
    workspaceId: demoWorkspace.id,
    profileId: demoProfile.id,
  };
}

function resolveWorkspaceContext(context?: WorkspaceContext) {
  if (context) {
    return context;
  }

  if (!isSupabaseConfigured()) {
    return getDemoContext();
  }

  throw new Error('Join or create an organization before using the CRM.');
}

function normalizeOrganizationSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function hashOrganizationPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyOrganizationPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), derived);
}

export async function createOrganizationForProfile(input: {
  profileId: string;
  name: string;
  slug?: string | null;
  timezone?: string | null;
  password: string;
}) {
  const name = input.name.trim();
  const slug = normalizeOrganizationSlug(input.slug?.trim() || input.name);
  const password = input.password.trim();

  if (!name) {
    throw new Error('Enter an organization name.');
  }
  if (!slug) {
    throw new Error('Choose a valid organization slug.');
  }
  if (password.length < 8) {
    throw new Error('Use an organization password with at least 8 characters.');
  }

  if (!isSupabaseConfigured()) {
    demoWorkspace.name = name;
    demoWorkspace.slug = slug;
    demoWorkspace.timezone = input.timezone?.trim() || 'UTC';
    demoProfile.workspace_id = demoWorkspace.id;
    demoProfile.role = 'admin';
    return {
      workspace: demoWorkspace,
      profile: demoProfile,
    };
  }

  const supabase = getAdminSupabaseClient();
  const { data: profile } = await supabase!
    .from('profiles')
    .select('*')
    .eq('id', input.profileId)
    .single();

  if (profile.workspace_id) {
    throw new Error('This user is already attached to an organization.');
  }

  const { data: existing } = await supabase!
    .from('workspaces')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    throw new Error('That organization slug is already in use.');
  }

  const { data: workspace, error: workspaceError } = await supabase!
    .from('workspaces')
    .insert({
      name,
      slug,
      timezone: input.timezone?.trim() || 'UTC',
      join_password_hash: hashOrganizationPassword(password),
    })
    .select('*')
    .single();

  if (workspaceError) throw workspaceError;

  const { data: updatedProfile, error: profileError } = await supabase!
    .from('profiles')
    .update({
      workspace_id: workspace.id,
      role: 'admin',
    })
    .eq('id', input.profileId)
    .select('*')
    .single();

  if (profileError) throw profileError;

  await logActivity({
    workspaceId: workspace.id,
    profileId: input.profileId,
    event_type: 'organization.created',
    event_label: `${workspace.name} created`,
    payload: { workspace_id: workspace.id, slug: workspace.slug },
  });

  return {
    workspace,
    profile: updatedProfile,
  };
}

export async function joinOrganizationForProfile(input: {
  profileId: string;
  slug: string;
  password: string;
}) {
  const slug = normalizeOrganizationSlug(input.slug);
  const password = input.password.trim();

  if (!slug) {
    throw new Error('Enter the organization slug.');
  }
  if (!password) {
    throw new Error('Enter the organization password.');
  }

  if (!isSupabaseConfigured()) {
    demoProfile.workspace_id = demoWorkspace.id;
    demoProfile.role = 'member';
    return {
      workspace: demoWorkspace,
      profile: demoProfile,
    };
  }

  const supabase = getAdminSupabaseClient();
  const { data: profile } = await supabase!
    .from('profiles')
    .select('*')
    .eq('id', input.profileId)
    .single();

  if (profile.workspace_id) {
    throw new Error('This user is already attached to an organization.');
  }

  const { data: workspace } = await supabase!
    .from('workspaces')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!workspace) {
    throw new Error('Organization not found.');
  }

  if (!verifyOrganizationPassword(password, workspace.join_password_hash)) {
    throw new Error('Organization password is incorrect.');
  }

  const { data: updatedProfile, error } = await supabase!
    .from('profiles')
    .update({
      workspace_id: workspace.id,
      role: 'member',
    })
    .eq('id', input.profileId)
    .select('*')
    .single();

  if (error) throw error;

  await logActivity({
    workspaceId: workspace.id,
    profileId: input.profileId,
    event_type: 'organization.joined',
    event_label: `${profile.email ?? 'User'} joined ${workspace.name}`,
    payload: { workspace_id: workspace.id, slug: workspace.slug },
  });

  return {
    workspace,
    profile: updatedProfile,
  };
}

export async function listLeads(context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return [...demoState.leads];
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('leads')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as LeadRecord[];
}

export async function createLead(input: unknown, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  assertWorkspace(active);
  const parsed = leadInputSchema.parse(input);
  const payload = {
    ...parsed,
    telegram_username: normalizeTelegramUsername(parsed.telegram_username),
    workspace_id: active.workspaceId,
    created_by: active.profileId,
  };

  if (!isSupabaseConfigured()) {
    const record: LeadRecord = {
      id: demoId('lead'),
      created_at: nowIso(),
      ...payload,
      owner_id: payload.owner_id ?? null,
      notes: payload.notes ?? null,
      source: payload.source ?? null,
      profile_picture_url: null,
      telegram_exists: null,
      telegram_checked_at: null,
    };
    demoState.leads.unshift(record);
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: 'lead.created',
      event_label: `Lead ${record.first_name} ${record.last_name} added`,
      payload: { lead_id: record.id },
    });
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!.from('leads').insert(payload).select('*').single();
  if (error) throw error;
  return data as LeadRecord;
}

export async function updateLead(leadId: string, input: Record<string, unknown>, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  assertWorkspace(active);
  const payload: Record<string, unknown> = {};
  let usernameChanged = false;
  if (input.first_name !== undefined) payload.first_name = String(input.first_name).trim();
  if (input.last_name !== undefined) payload.last_name = String(input.last_name).trim();
  if (input.company_name !== undefined) payload.company_name = String(input.company_name).trim();
  if (input.telegram_username !== undefined) {
    payload.telegram_username = normalizeTelegramUsername(String(input.telegram_username));
    usernameChanged = true;
  }
  if (input.tags !== undefined) payload.tags = Array.isArray(input.tags) ? input.tags : [];
  if (input.source !== undefined) payload.source = String(input.source).trim() || null;
  if (input.profile_picture_url !== undefined) payload.profile_picture_url = input.profile_picture_url || null;
  if (input.telegram_exists !== undefined) payload.telegram_exists = input.telegram_exists;
  if (input.telegram_checked_at !== undefined) payload.telegram_checked_at = input.telegram_checked_at || null;
  if (usernameChanged) {
    payload.profile_picture_url = null;
    payload.telegram_exists = null;
    payload.telegram_checked_at = null;
  }

  if (!isSupabaseConfigured()) {
    const record = demoState.leads.find((l) => l.id === leadId);
    if (!record) return null;
    Object.assign(record, payload);
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('leads')
    .update(payload)
    .eq('workspace_id', active.workspaceId)
    .eq('id', leadId)
    .select('*')
    .single();
  if (error) throw error;
  return data as LeadRecord;
}

export async function deleteLead(leadId: string, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  assertWorkspace(active);

  if (!isSupabaseConfigured()) {
    const idx = demoState.leads.findIndex((l) => l.id === leadId);
    if (idx !== -1) demoState.leads.splice(idx, 1);
    return;
  }

  const supabase = getAdminSupabaseClient();
  const { error } = await supabase!
    .from('leads')
    .delete()
    .eq('workspace_id', active.workspaceId)
    .eq('id', leadId);
  if (error) throw error;
}

export async function importLeadsCsv(csvText: string, extraTags?: string[], context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors[0]?.message || 'CSV parsing failed');
  }

  const validRows = parsed.data.filter((row) => {
    const first = (row['First Name'] ?? row.first_name ?? '').trim();
    const handle = (row['Telegram Username'] ?? row.telegram_username ?? '').trim();
    // Only process rows that have at least one character in the required fields.
    // This allows us to silently ignore empty/ghost rows at the bottom of Excel sheets.
    return first.length > 0 || handle.length > 0;
  });

  const records = validRows.map((row, index) => {
    try {
      return leadInputSchema.parse({
        first_name: row['First Name'] ?? row.first_name ?? '',
        last_name: row['Last Name'] ?? row.last_name ?? '',
        company_name: row.Company ?? row.company_name ?? row['Company Name'] ?? '',
        telegram_username: row['Telegram Username'] ?? row.telegram_username ?? '',
        tags: [
          ...(row.Tags ?? '').split(',').map((item) => item.trim()).filter(Boolean),
          ...(extraTags ?? []),
        ],
        notes: row.Notes ?? null,
        source: row.Source ?? 'CSV import',
      });
    } catch (err: any) {
      throw new Error(`Row ${index + 2}: Missing or invalid fields. Please ensure First Name and Telegram Username are provided.`);
    }
  });

  if (!isSupabaseConfigured()) {
    const imported = await Promise.all(records.map((record) => createLead(record, active)));
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: 'leads.imported',
      event_label: `${imported.length} leads imported`,
      payload: { count: imported.length },
    });
    return imported;
  }

  const supabase = getAdminSupabaseClient();
  const rawPayload = records.map((record) => ({
    ...record,
    telegram_username: normalizeTelegramUsername(record.telegram_username),
    workspace_id: active.workspaceId,
    created_by: active.profileId,
  }));

  // De-duplicate within the batch itself by telegram_username.
  // PostgreSQL's ON CONFLICT DO UPDATE throws "command cannot affect row a
  // second time" if the same conflict key appears more than once in the
  // VALUES list — the DB can't resolve which version wins. We keep the last
  // occurrence so that the most-recently-listed row takes precedence.
  const seen = new Map<string, typeof rawPayload[number]>();
  for (const row of rawPayload) seen.set(row.telegram_username, row);
  const payload = Array.from(seen.values());

  const { data, error } = await supabase!
    .from('leads')
    .upsert(payload, { onConflict: 'workspace_id,telegram_username' })
    .select('*');

  if (error) throw error;
  await logActivity({
    workspaceId: active.workspaceId,
    profileId: active.profileId,
    event_type: 'leads.imported',
    event_label: `${data.length} leads imported`,
    payload: { count: data.length },
  });
  return data as LeadRecord[];
}

export async function listLeadsByTag(tag: string, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return demoState.leads.filter((l) => l.tags?.includes(tag));
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('leads')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .contains('tags', [tag]);
  if (error) throw error;
  return (data ?? []) as LeadRecord[];
}

export async function addLeadsToCampaign(
  campaignId: string,
  leadIds: string[],
  context?: WorkspaceContext,
): Promise<{ added: number; skipped: number }> {
  const active = resolveWorkspaceContext(context);
  if (!leadIds.length) return { added: 0, skipped: 0 };

  if (!isSupabaseConfigured()) {
    const existingIds = new Set(
      demoState.campaignLeads
        .filter((cl) => cl.campaign_id === campaignId)
        .map((cl) => cl.lead_id),
    );
    let added = 0;
    let skipped = 0;
    for (const leadId of leadIds) {
      if (existingIds.has(leadId)) { skipped++; continue; }
      await attachLeadToCampaign(campaignId, leadId, context);
      added++;
    }
    return { added, skipped };
  }

  const supabase = getAdminSupabaseClient();
  const { data: existing } = await supabase!
    .from('campaign_leads')
    .select('lead_id')
    .eq('campaign_id', campaignId)
    .eq('workspace_id', active.workspaceId);

  const existingIds = new Set((existing ?? []).map((cl: { lead_id: string }) => cl.lead_id));
  const newLeadIds = leadIds.filter((id) => !existingIds.has(id));
  const skipped = leadIds.length - newLeadIds.length;

  if (!newLeadIds.length) return { added: 0, skipped };

  const payload = newLeadIds.map((leadId) => ({
    workspace_id: active.workspaceId,
    campaign_id: campaignId,
    lead_id: leadId,
    status: 'queued',
    next_step_order: 1,
  }));

  const { error } = await supabase!
    .from('campaign_leads')
    .upsert(payload, { onConflict: 'campaign_id,lead_id' });

  if (error) throw error;
  return { added: newLeadIds.length, skipped };
}

export async function listAccounts(context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return [...demoState.accounts];
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_accounts')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as TelegramAccountRecord[];
}

export async function createAccount(input: unknown, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const parsed = telegramAccountInputSchema.parse(input);
  const payload = {
    ...parsed,
    telegram_username: normalizeTelegramUsername(parsed.telegram_username),
    owner_id: parsed.owner_id ?? null,
    workspace_id: active.workspaceId,
  };

  if (!isSupabaseConfigured()) {
    const record: TelegramAccountRecord = {
      id: demoId('account'),
      created_at: nowIso(),
      telegram_user_id: null,
      profile_picture_url: null,
      restricted_until: null,
      cooldown_until: null,
      restriction_reported_at: null,
      restriction_source_text: null,
      ...payload,
    };
    demoState.accounts.unshift(record);
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: 'account.created',
      event_label: `Account ${record.label} added`,
      payload: { account_id: record.id },
    });
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_accounts')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as TelegramAccountRecord;
}

export async function deleteAccount(accountId: string, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    demoState.accounts = demoState.accounts.filter(a => a.id !== accountId);
    demoState.assignments = demoState.assignments.filter(a => a.telegram_account_id !== accountId);
    return;
  }

  const supabase = getAdminSupabaseClient();
  const { error } = await supabase!
    .from('telegram_accounts')
    .delete()
    .eq('workspace_id', active.workspaceId)
    .eq('id', accountId);

  if (error) throw error;
}

export async function listCampaigns(context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return [...demoState.campaigns];
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaigns')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as CampaignRecord[];
}

export async function createCampaign(input: unknown, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const parsed = campaignInputSchema.parse(input);
  const payload = {
    ...parsed,
    description: parsed.description || null,
    start_date: parsed.start_date || null,
    end_date: parsed.end_date || null,
    workspace_id: active.workspaceId,
    created_by: active.profileId,
  };

  if (!isSupabaseConfigured()) {
    const record: CampaignRecord = {
      id: demoId('campaign'),
      status: 'draft',
      created_at: nowIso(),
      ...payload,
    };
    demoState.campaigns.unshift(record);
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaigns')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as CampaignRecord;
}

export async function updateCampaign(campaignId: string, input: unknown, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const parsed = campaignInputSchema.parse(input);
  const payload = {
    name: parsed.name,
    description: parsed.description || null,
    timezone: parsed.timezone,
    send_window_start: parsed.send_window_start,
    send_window_end: parsed.send_window_end,
    start_date: parsed.start_date || null,
    end_date: parsed.end_date || null,
  };

  if (!isSupabaseConfigured()) {
    const campaign = demoState.campaigns.find((item) => item.id === campaignId);
    if (!campaign) return null;
    Object.assign(campaign, payload);
    return campaign;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaigns')
    .update(payload)
    .eq('workspace_id', active.workspaceId)
    .eq('id', campaignId)
    .select('*')
    .single();
  if (error) throw error;
  return data as CampaignRecord;
}

export async function deleteCampaign(campaignId: string, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    demoState.campaigns = demoState.campaigns.filter((item) => item.id !== campaignId);
    return;
  }

  const supabase = getAdminSupabaseClient();
  const { error } = await supabase!
    .from('campaigns')
    .delete()
    .eq('workspace_id', active.workspaceId)
    .eq('id', campaignId);
  if (error) throw error;
}

export async function getCampaignDetail(campaignId: string, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    const campaign = demoState.campaigns.find((item) => item.id === campaignId) ?? null;
    const campaignAssignments = demoState.assignments.filter((item) => item.campaign_id === campaignId);
    return {
      campaign,
      steps: demoState.steps.filter((item) => item.campaign_id === campaignId).sort((a, b) => a.step_order - b.step_order),
      attachedLeads: demoState.campaignLeads.filter((item) => item.campaign_id === campaignId),
      accounts: demoState.accounts,
      assignedAccountIds: campaignAssignments.map((item) => item.telegram_account_id),
      accountAssignments: campaignAssignments.map((item) => ({
        telegram_account_id: item.telegram_account_id,
        message_limit: item.message_limit,
      })),
      leads: demoState.leads,
    };
  }

  const supabase = getAdminSupabaseClient();
  const [{ data: campaign }, { data: steps }, { data: attachedLeads }, { data: accounts }, { data: assignments }, { data: leads }] = await Promise.all([
    supabase!.from('campaigns').select('*').eq('workspace_id', active.workspaceId).eq('id', campaignId).maybeSingle(),
    supabase!.from('campaign_sequence_steps').select('*').eq('workspace_id', active.workspaceId).eq('campaign_id', campaignId).order('step_order'),
    supabase!.from('campaign_leads').select('*').eq('workspace_id', active.workspaceId).eq('campaign_id', campaignId).order('created_at'),
    supabase!.from('telegram_accounts').select('*').eq('workspace_id', active.workspaceId).order('created_at'),
    supabase!.from('campaign_account_assignments').select('*').eq('workspace_id', active.workspaceId).eq('campaign_id', campaignId),
    supabase!.from('leads').select('*').eq('workspace_id', active.workspaceId).order('company_name'),
  ]);

  return {
    campaign: (campaign as CampaignRecord | null) ?? null,
    steps: (steps as SequenceStepRecord[]) ?? [],
    attachedLeads: (attachedLeads as CampaignLeadRecord[]) ?? [],
    accounts: (accounts as TelegramAccountRecord[]) ?? [],
    assignedAccountIds: assignments?.map((item) => item.telegram_account_id) ?? [],
    accountAssignments: assignments?.map((item) => ({
      telegram_account_id: item.telegram_account_id,
      message_limit: (item.message_limit as number | null) ?? null,
    })) ?? [],
    leads: (leads as LeadRecord[]) ?? [],
  };
}

export async function addSequenceStep(campaignId: string, input: unknown, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const parsed = sequenceStepInputSchema.parse(input);
  const messagePayload = resolveStepMessagePayload(parsed);
  const payload = {
    ...parsed,
    step_name: parsed.step_name ?? null,
    ...messagePayload,
    workspace_id: active.workspaceId,
    campaign_id: campaignId,
  };

  if (!isSupabaseConfigured()) {
    const record: SequenceStepRecord = {
      id: demoId('step'),
      ...payload,
    };
    demoState.steps.push(record);
    demoState.steps.sort((a, b) => a.step_order - b.step_order);
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaign_sequence_steps')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as SequenceStepRecord;
}

export async function attachLeadToCampaign(campaignId: string, leadId: string, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const payload = {
    workspace_id: active.workspaceId,
    campaign_id: campaignId,
    lead_id: leadId,
  };

  if (!isSupabaseConfigured()) {
    const existing = demoState.campaignLeads.find((item) => item.campaign_id === campaignId && item.lead_id === leadId);
    if (existing) return existing;
    const record: CampaignLeadRecord = {
      id: demoId('campaign-lead'),
      ...payload,
      status: 'queued',
      assigned_account_id: null,
      current_step_order: 0,
      next_step_order: 1,
      next_due_at: null,
      last_sent_at: null,
      last_reply_at: null,
      stop_reason: null,
      notes: null,
      step_events: [],
    };
    demoState.campaignLeads.push(record);
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaign_leads')
    .upsert(
      {
        ...payload,
        status: 'queued',
        next_step_order: 1,
      },
      { onConflict: 'campaign_id,lead_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as CampaignLeadRecord;
}

export async function setCampaignAccounts(
  campaignId: string,
  accountIds: string[],
  messageLimits?: Array<{ accountId: string; limit: number }> | null,
  context?: WorkspaceContext,
) {
  const active = resolveWorkspaceContext(context);
  const limitMap = new Map((messageLimits ?? []).map((m) => [m.accountId, m.limit]));

  if (!isSupabaseConfigured()) {
    demoState.assignments = demoState.assignments.filter((item) => item.campaign_id !== campaignId);
    accountIds.forEach((accountId) => {
      demoState.assignments.push({
        id: demoId('assignment'),
        workspace_id: active.workspaceId,
        campaign_id: campaignId,
        telegram_account_id: accountId,
        message_limit: limitMap.get(accountId) ?? null,
        created_at: nowIso(),
      });
    });
    await assignUnassignedCampaignLeads(campaignId, active);
    return accountIds;
  }

  const supabase = getAdminSupabaseClient();
  await supabase!.from('campaign_account_assignments').delete().eq('workspace_id', active.workspaceId).eq('campaign_id', campaignId);
  if (!accountIds.length) return [];

  const payload = accountIds.map((accountId) => ({
    workspace_id: active.workspaceId,
    campaign_id: campaignId,
    telegram_account_id: accountId,
    message_limit: limitMap.get(accountId) ?? null,
  }));
  const { error } = await supabase!.from('campaign_account_assignments').insert(payload);
  if (error) throw error;
  await assignUnassignedCampaignLeads(campaignId, active);
  return accountIds;
}

export async function updateCampaignAccountLimit(
  campaignId: string,
  accountId: string,
  messageLimit: number | null,
  context?: WorkspaceContext,
) {
  const active = resolveWorkspaceContext(context);
  if (messageLimit !== null && (!Number.isInteger(messageLimit) || messageLimit < 1)) {
    throw new Error('Campaign cap must be 1 or higher, or cleared to use the global cap.');
  }

  if (!isSupabaseConfigured()) {
    const assignment = demoState.assignments.find(
      (item) =>
        item.workspace_id === active.workspaceId &&
        item.campaign_id === campaignId &&
        item.telegram_account_id === accountId,
    );
    if (!assignment) {
      throw new Error('This account is not assigned to the campaign.');
    }
    assignment.message_limit = messageLimit;
    return {
      telegram_account_id: assignment.telegram_account_id,
      message_limit: assignment.message_limit,
    };
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaign_account_assignments')
    .update({ message_limit: messageLimit })
    .eq('workspace_id', active.workspaceId)
    .eq('campaign_id', campaignId)
    .eq('telegram_account_id', accountId)
    .select('telegram_account_id, message_limit')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('This account is not assigned to the campaign.');
  }
  return {
    telegram_account_id: data.telegram_account_id as string,
    message_limit: (data.message_limit as number | null) ?? null,
  };
}

// Distribute accounts round-robin across ALL leads with no daily-limit cap.
// The scheduler enforces daily limits each time it runs — capping here would
// wrongly block overflow leads instead of queuing them for the next day.
function distributeAccounts(accounts: TelegramAccountRecord[], total: number) {
  const slots: string[] = [];
  if (!accounts.length) return slots;
  for (let i = 0; i < total; i++) {
    slots.push(accounts[i % accounts.length].id);
  }
  return slots;
}

export async function assignUnassignedCampaignLeads(
  campaignId: string,
  context?: WorkspaceContext,
): Promise<{ assigned: number; availableAccounts: number }> {
  const active = resolveWorkspaceContext(context);

  if (!isSupabaseConfigured()) {
    const assignmentIds = demoState.assignments
      .filter((item) => item.campaign_id === campaignId)
      .map((item) => item.telegram_account_id);
    const activeAccounts = demoState.accounts
      .filter((account) => assignmentIds.includes(account.id) && isAccountSendable(account))
      .sort((a, b) => a.id.localeCompare(b.id));

    if (!activeAccounts.length) {
      return { assigned: 0, availableAccounts: 0 };
    }

    const loads = new Map<string, number>();
    activeAccounts.forEach((account) => loads.set(account.id, 0));

    demoState.campaignLeads
      .filter((lead) =>
        lead.campaign_id === campaignId &&
        lead.assigned_account_id &&
        openCampaignLeadStatuses.includes((lead.status ?? 'queued') as (typeof openCampaignLeadStatuses)[number]) &&
        loads.has(lead.assigned_account_id),
      )
      .forEach((lead) => {
        const accountId = lead.assigned_account_id!;
        loads.set(accountId, (loads.get(accountId) ?? 0) + 1);
      });

    const unassigned = demoState.campaignLeads
      .filter((lead) => lead.campaign_id === campaignId && !lead.assigned_account_id)
      .sort((a, b) => compareCampaignLeadOrder(a as { id: string; created_at?: string | null }, b as { id: string; created_at?: string | null }));

    for (const campaignLead of unassigned) {
      const account = [...activeAccounts].sort((a, b) => {
        const loadDiff = (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0);
        if (loadDiff !== 0) return loadDiff;
        return a.id.localeCompare(b.id);
      })[0];
      if (!account) break;
      campaignLead.assigned_account_id = account.id;
      loads.set(account.id, (loads.get(account.id) ?? 0) + 1);
    }

    return { assigned: unassigned.length, availableAccounts: activeAccounts.length };
  }

  const supabase = getAdminSupabaseClient();
  const { data: assignmentRows } = await supabase!
    .from('campaign_account_assignments')
    .select('telegram_account_id')
    .eq('workspace_id', active.workspaceId)
    .eq('campaign_id', campaignId);

  const assignedAccountIds = [...new Set((assignmentRows ?? []).map((row) => row.telegram_account_id).filter(Boolean))];
  if (!assignedAccountIds.length) {
    return { assigned: 0, availableAccounts: 0 };
  }

  const { data: activeAccountsData } = await supabase!
    .from('telegram_accounts')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .eq('is_active', true)
    .in('id', assignedAccountIds);

  const activeAccounts = ((activeAccountsData ?? []) as TelegramAccountRecord[]).sort((a, b) => a.id.localeCompare(b.id));
  const sendableAccounts = activeAccounts.filter((account) => isAccountSendable(account));
  if (!sendableAccounts.length) {
    return { assigned: 0, availableAccounts: 0 };
  }

  const { data: campaignLeads } = await supabase!
    .from('campaign_leads')
    .select('id, assigned_account_id, status, created_at')
    .eq('workspace_id', active.workspaceId)
    .eq('campaign_id', campaignId);

  const loads = new Map<string, number>();
  sendableAccounts.forEach((account) => loads.set(account.id, 0));

  (campaignLeads ?? []).forEach((lead) => {
    if (
      lead.assigned_account_id &&
      loads.has(lead.assigned_account_id) &&
      openCampaignLeadStatuses.includes((lead.status ?? 'queued') as (typeof openCampaignLeadStatuses)[number])
    ) {
      loads.set(lead.assigned_account_id, (loads.get(lead.assigned_account_id) ?? 0) + 1);
    }
  });

  const unassigned = (campaignLeads ?? [])
    .filter((lead) => !lead.assigned_account_id)
    .sort((a, b) => compareCampaignLeadOrder(a, b));

  for (const campaignLead of unassigned) {
    const account = [...sendableAccounts].sort((a, b) => {
      const loadDiff = (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0);
      if (loadDiff !== 0) return loadDiff;
      return a.id.localeCompare(b.id);
    })[0];
    if (!account) break;
    await supabase!
      .from('campaign_leads')
      .update({ assigned_account_id: account.id })
      .eq('workspace_id', active.workspaceId)
      .eq('id', campaignLead.id);
    loads.set(account.id, (loads.get(account.id) ?? 0) + 1);
  }

  return { assigned: unassigned.length, availableAccounts: sendableAccounts.length };
}

export async function launchCampaign(campaignId: string, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const detail = await getCampaignDetail(campaignId, active);
  if (!detail.campaign) throw new Error('Campaign not found');
  if (!detail.steps.length) throw new Error('Add at least one sequence step before launch');
  if (!detail.attachedLeads.length) throw new Error('Attach at least one lead before launch');

  const assignedAccounts = detail.accounts.filter((account) => detail.assignedAccountIds.includes(account.id) && isAccountSendable(account));
  if (!assignedAccounts.length) throw new Error('Assign at least one active account before launch');
  const assignmentResult = await assignUnassignedCampaignLeads(campaignId, active);
  const queuedCount = detail.attachedLeads.filter((lead) => lead.status === 'queued').length;

  if (!isSupabaseConfigured()) {
    const campaign = demoState.campaigns.find((item) => item.id === campaignId)!;
    campaign.status = 'active';
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: 'campaign.launched',
      event_label: `${campaign.name} launched`,
      payload: { campaign_id: campaignId, queued_leads: queuedCount, assigned: assignmentResult.assigned },
    });
    return queuedCount;
  }

  const supabase = getAdminSupabaseClient();
  await supabase!
    .from('campaigns')
    .update({ status: 'active', launched_at: nowIso() })
    .eq('workspace_id', active.workspaceId)
    .eq('id', campaignId);

  await logActivity({
    workspaceId: active.workspaceId,
    profileId: active.profileId,
    event_type: 'campaign.launched',
    event_label: `${detail.campaign.name} launched`,
    payload: { campaign_id: campaignId, queued_leads: queuedCount, assigned: assignmentResult.assigned },
  });

  return queuedCount;
}

export async function pauseCampaign(campaignId: string, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    const campaign = demoState.campaigns.find((item) => item.id === campaignId);
    if (campaign) {
      campaign.status = 'paused';
    }
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: 'campaign.paused',
      event_label: `${campaign?.name ?? 'Campaign'} paused`,
      payload: { campaign_id: campaignId },
    });
    return campaign;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaigns')
    .update({ status: 'paused', paused_at: nowIso() })
    .eq('workspace_id', active.workspaceId)
    .eq('id', campaignId)
    .select('*')
    .single();
  if (error) throw error;
  return data as CampaignRecord;
}

export async function updateCampaignLead(id: string, patch: Partial<CampaignLeadRecord>, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    const record = demoState.campaignLeads.find((item) => item.id === id);
    if (record) Object.assign(record, patch);
    return record ?? null;
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaign_leads')
    .update(patch)
    .eq('workspace_id', active.workspaceId)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as CampaignLeadRecord;
}

async function createSendTask(payload: Omit<SendTaskRecord, 'id' | 'claimed_by_profile_id' | 'status'> & { lead_snapshot?: Record<string, unknown> }, context: WorkspaceContext) {
  if (!isSupabaseConfigured()) {
    const task: SendTaskRecord = {
      id: demoId('task'),
      claimed_by_profile_id: null,
      status: 'pending',
      ...payload,
    };
    demoState.sendTasks.push(task);
    return task;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('send_tasks')
    .insert({
      ...payload,
      status: 'pending',
      claimed_by_profile_id: null,
      lead_snapshot: payload.lead_snapshot ?? {},
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as SendTaskRecord;
}

export async function listActivity(context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return [...demoState.activity].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('activity_log')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data as ActivityLogRecord[];
}


export async function createAccountLinkCode(
  input: { label: string; dailyLimit: number },
  context?: WorkspaceContext,
) {
  const active = resolveWorkspaceContext(context);
  const code = createOneTimeCode();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 15).toISOString();

  if (!isSupabaseConfigured()) {
    const record = {
      id: demoId('code'),
      workspace_id: active.workspaceId,
      profile_id: active.profileId ?? demoProfile.id,
      code,
      expires_at: expiresAt,
      consumed_at: null,
      created_at: nowIso(),
      metadata: { label: input.label, daily_limit: input.dailyLimit },
    };
    demoState.botCodes.unshift(record);
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('bot_link_codes')
    .insert({
      workspace_id: active.workspaceId,
      profile_id: active.profileId,
      code,
      expires_at: expiresAt,
      metadata: { label: input.label, daily_limit: input.dailyLimit },
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function consumeAccountLinkCode(input: {
  code: string;
  telegramUserId: number;
  telegramUsername: string;
}) {
  if (!isSupabaseConfigured()) {
    const match = demoState.botCodes.find(
      (item) => item.code === input.code && !item.consumed_at,
    );
    if (!match) return null;
    match.consumed_at = nowIso();
    const meta = (match as any).metadata ?? {};
    const record: TelegramAccountRecord = {
      id: demoId('account'),
      workspace_id: match.workspace_id,
      label: meta.label || input.telegramUsername,
      telegram_username: normalizeTelegramUsername(input.telegramUsername),
      daily_limit: meta.daily_limit ?? 20,
      is_active: true,
      owner_id: match.profile_id,
      telegram_user_id: input.telegramUserId,
      profile_picture_url: null,
      created_at: nowIso(),
      restricted_until: null,
      cooldown_until: null,
      restriction_reported_at: null,
      restriction_source_text: null,
    };
    demoState.accounts.unshift(record);
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data: codeRow } = await supabase!
    .from('bot_link_codes')
    .select('*')
    .eq('code', input.code)
    .is('consumed_at', null)
    .gt('expires_at', nowIso())
    .maybeSingle();

  if (!codeRow) return null;

  await supabase!
    .from('bot_link_codes')
    .update({ consumed_at: nowIso() })
    .eq('id', codeRow.id);

  const meta = codeRow.metadata ?? {};
  const { data: account, error } = await supabase!
    .from('telegram_accounts')
    .insert({
      workspace_id: codeRow.workspace_id,
      label: (meta as any).label || input.telegramUsername,
      telegram_username: normalizeTelegramUsername(input.telegramUsername),
      daily_limit: (meta as any).daily_limit ?? 20,
      is_active: true,
      owner_id: codeRow.profile_id,
      telegram_user_id: input.telegramUserId,
    })
    .select('*')
    .single();

  if (error) throw error;

  await logActivity({
    workspaceId: codeRow.workspace_id,
    profileId: codeRow.profile_id,
    event_type: 'account.connected',
    event_label: `Account @${input.telegramUsername} connected via bot`,
    payload: { account_id: account.id, telegram_username: input.telegramUsername },
  });

  return account;
}

export async function getNextBotTask(telegramUserId: number) {
  if (!isSupabaseConfigured()) {
    const account = demoState.accounts.find((a) => a.telegram_user_id === telegramUserId);
    if (!account) throw new Error('NOT_LINKED');
    if (!isAccountSendable(account)) return null;
    let workspaceId = account.workspace_id;
    let userAccountIds = [account.id];
    let fallbackProfileId = account.owner_id ?? demoProfile.id;

    const claimed = demoState.sendTasks.find(
      (item) =>
        item.workspace_id === workspaceId &&
        userAccountIds.includes(item.assigned_account_id) &&
        item.status === 'claimed' &&
        isDue(item.due_at),
    );
    if (claimed) {
      return buildBotTaskPayload(claimed);
    }

    const task = demoState.sendTasks.find(
      (item) =>
        item.workspace_id === workspaceId &&
        userAccountIds.includes(item.assigned_account_id) &&
        item.status === 'pending' &&
        isDue(item.due_at),
    );

    if (!task) return null;
    const step = demoState.steps.find((item) => item.id === task.sequence_step_id);
    const lead = demoState.leads.find((item) => item.id === task.lead_id);
    if (step && lead) {
      task.rendered_message = pickRenderedMessageForStep(step, lead, { excludeRendered: task.rendered_message });
    }
    task.status = 'claimed';
    task.claimed_by_profile_id = fallbackProfileId;
    return buildBotTaskPayload(task);
  }

  const supabase = getAdminSupabaseClient();
  const { data: telegramAccount } = await supabase!
    .from('telegram_accounts')
    .select('id, workspace_id, owner_id, is_active, daily_limit, restricted_until, cooldown_until')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();

  if (!telegramAccount) {
    throw new Error('NOT_LINKED');
  }
  if (!isAccountSendable(telegramAccount as TelegramAccountRecord)) {
    return null;
  }

  const workspaceId = telegramAccount.workspace_id;
  const userAccountIds = [telegramAccount.id];
  const simulatedProfileId = telegramAccount.owner_id ?? '';

  if (userAccountIds.length === 0) return null;

  // Find already-claimed task for this specific account (don't filter by profile_id —
  // accounts connected without /link have no owner_id so profile_id would be null)
  const dueNow = nowIso();
  const { data: claimedTask } = await supabase!
    .from('send_tasks')
    .select('*, leads(*), campaigns(name), telegram_accounts(label, telegram_username)')
    .eq('workspace_id', workspaceId)
    .in('assigned_account_id', userAccountIds)
    .eq('status', 'claimed')
    .lte('due_at', dueNow)
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (claimedTask) {
    return buildBotTaskPayload(claimedTask);
  }

  const { data: pendingTask } = await supabase!
    .from('send_tasks')
    .select('*, leads(*), campaigns(name), telegram_accounts(label, telegram_username)')
    .eq('workspace_id', workspaceId)
    .in('assigned_account_id', userAccountIds)
    .eq('status', 'pending')
    .lte('due_at', dueNow)
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pendingTask) return null;

  const [{ data: step }, { data: lead }] = await Promise.all([
    supabase!.from('campaign_sequence_steps').select('*').eq('id', pendingTask.sequence_step_id).maybeSingle(),
    supabase!.from('leads').select('*').eq('id', pendingTask.lead_id).maybeSingle(),
  ]);

  const rerolledMessage = step && lead
    ? pickRenderedMessageForStep(step as SequenceStepRecord, lead as LeadRecord, { excludeRendered: pendingTask.rendered_message })
    : pendingTask.rendered_message;

  const { data: claimed } = await supabase!
    .from('send_tasks')
    .update({
      status: 'claimed',
      claimed_by_profile_id: simulatedProfileId || null,
      claimed_at: dueNow,
      rendered_message: rerolledMessage,
    })
    .eq('id', pendingTask.id)
    .eq('status', 'pending') // optimistic lock
    .select('*')
    .maybeSingle();

  if (!claimed) return null;

  const { data: hydratedTask } = await supabase!
    .from('send_tasks')
    .select('*, leads(*), campaigns(name), telegram_accounts(label, telegram_username)')
    .eq('id', claimed.id)
    .maybeSingle();

  if (!hydratedTask) return null;
  return buildBotTaskPayload(hydratedTask);
}

function buildBotTaskPayload(task: any) {
  const leadSnapshot = task.lead_snapshot ?? {};
  return {
    taskId: task.id,
    campaignId: task.campaign_id,
    campaignLeadId: task.campaign_lead_id,
    assignedAccountId: task.assigned_account_id,
    dueAt: task.due_at,
    renderedMessage: task.rendered_message,
    campaignName: task.campaigns?.name ?? 'Campaign',
    accountLabel: task.telegram_accounts?.label ?? task.assigned_account_id,
    accountUsername: task.telegram_accounts?.telegram_username ?? '',
    leadName: [leadSnapshot.first_name, leadSnapshot.last_name].filter(Boolean).join(' ') || task.leads?.first_name || 'Lead',
    companyName: leadSnapshot.company_name ?? task.leads?.company_name ?? 'Company',
    telegramUsername: leadSnapshot.telegram_username ?? task.leads?.telegram_username ?? '',
    profileUrl: leadSnapshot.profile_url ?? buildTelegramProfileUrl(leadSnapshot.telegram_username ?? task.leads?.telegram_username ?? ''),
  };
}

function getWaitingStatusForFollowup(lead: Pick<CampaignLeadRecord, 'current_step_order'>) {
  return (lead.current_step_order ?? 0) <= 1 ? 'sent_waiting_followup' : 'first_followup_done';
}

function pushOutDueAt(current: string | null | undefined, pauseUntil: string) {
  if (!current) return pauseUntil;
  return new Date(current).getTime() > new Date(pauseUntil).getTime() ? current : pauseUntil;
}

function estimateTransferableUntouchedLeadCount(input: {
  dailyLimit: number;
  dueCount: number;
  cooldownUntil: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const cooldownUntil = new Date(input.cooldownUntil);
  if (Number.isNaN(cooldownUntil.getTime()) || cooldownUntil.getTime() <= now.getTime()) {
    return 0;
  }

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const remainingToday = Math.max(0, input.dailyLimit - input.dueCount);
  if (cooldownUntil.getTime() <= endOfToday.getTime()) {
    return remainingToday;
  }

  const additionalDays = Math.ceil((cooldownUntil.getTime() - endOfToday.getTime()) / 86400000);
  return remainingToday + additionalDays * input.dailyLimit;
}

export async function rerollBotTaskMessage(taskId: string, telegramUserId: number) {
  if (!isSupabaseConfigured()) {
    const account = demoState.accounts.find((item) => item.telegram_user_id === telegramUserId);
    if (!account) return null;
    const task = demoState.sendTasks.find((item) => item.id === taskId && item.assigned_account_id === account.id);
    if (!task) return null;
    const step = demoState.steps.find((item) => item.id === task.sequence_step_id);
    const lead = demoState.leads.find((item) => item.id === task.lead_id);
    if (!step || !lead) return buildBotTaskPayload(task);
    task.rendered_message = pickRenderedMessageForStep(step, lead, { excludeRendered: task.rendered_message });
    return buildBotTaskPayload(task);
  }

  const supabase = getAdminSupabaseClient();
  const { data: telegramAccount } = await supabase!
    .from('telegram_accounts')
    .select('id, workspace_id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();
  if (!telegramAccount) return null;

  const { data: task } = await supabase!
    .from('send_tasks')
    .select('*')
    .eq('workspace_id', telegramAccount.workspace_id)
    .eq('assigned_account_id', telegramAccount.id)
    .eq('id', taskId)
    .in('status', ['pending', 'claimed'])
    .maybeSingle();
  if (!task) return null;

  const [{ data: step }, { data: lead }] = await Promise.all([
    supabase!.from('campaign_sequence_steps').select('*').eq('id', task.sequence_step_id).maybeSingle(),
    supabase!.from('leads').select('*').eq('id', task.lead_id).maybeSingle(),
  ]);
  if (!step || !lead) return null;

  const renderedMessage = pickRenderedMessageForStep(step as SequenceStepRecord, lead as LeadRecord, {
    excludeRendered: task.rendered_message,
  });

  await supabase!
    .from('send_tasks')
    .update({ rendered_message: renderedMessage })
    .eq('id', task.id);

  const { data: hydratedTask } = await supabase!
    .from('send_tasks')
    .select('*, leads(*), campaigns(name), telegram_accounts(label, telegram_username)')
    .eq('id', task.id)
    .maybeSingle();
  return hydratedTask ? buildBotTaskPayload(hydratedTask) : null;
}

export async function reportAccountRestriction(telegramUserId: number, messageText: string) {
  const restrictedUntil = parseSpamBotRestrictionUntil(messageText);
  if (!restrictedUntil) {
    throw new Error('Could not find the Telegram restriction end time in that message.');
  }
  const cooldownUntil = addHours(restrictedUntil, 6);

  if (!isSupabaseConfigured()) {
    const account = demoState.accounts.find((item) => item.telegram_user_id === telegramUserId);
    if (!account) throw new Error('NOT_LINKED');

    account.restricted_until = restrictedUntil;
    account.cooldown_until = cooldownUntil;
    account.restriction_reported_at = nowIso();
    account.restriction_source_text = messageText.trim();

    const dueCount = demoState.campaignLeads.filter((item) => item.assigned_account_id === account.id && item.status === 'due').length;
    const transferableQuota = estimateTransferableUntouchedLeadCount({
      dailyLimit: account.daily_limit,
      dueCount,
      cooldownUntil,
    });

    const untouchedLeads = demoState.campaignLeads
      .filter((item) => item.assigned_account_id === account.id && !item.last_sent_at && item.current_step_order === 0 && item.next_step_order === 1 && ['queued', 'due'].includes(item.status))
      .sort((a, b) => compareCampaignLeadOrder(a, b));
    const dueUntouchedIds = new Set(
      untouchedLeads.filter((item) => item.status === 'due').map((item) => item.id),
    );
    const transferIds = new Set<string>();
    untouchedLeads.forEach((lead) => {
      if (dueUntouchedIds.has(lead.id)) transferIds.add(lead.id);
    });
    const remainingQuota = Math.max(0, transferableQuota - transferIds.size);
    untouchedLeads
      .filter((item) => item.status === 'queued')
      .slice(0, remainingQuota)
      .forEach((item) => transferIds.add(item.id));

    const tasksToExpire = demoState.sendTasks.filter(
      (task) => task.assigned_account_id === account.id && transferIds.has(task.campaign_lead_id) && ['pending', 'claimed'].includes(task.status),
    );
    tasksToExpire.forEach((task) => { task.status = 'expired'; });

    const byCampaign = new Map<string, CampaignLeadRecord[]>();
    demoState.campaignLeads
      .filter((item) => transferIds.has(item.id))
      .forEach((lead) => {
        const list = byCampaign.get(lead.campaign_id) ?? [];
        list.push(lead);
        byCampaign.set(lead.campaign_id, list);
      });

    let transferredCount = 0;
    for (const [campaignId, leads] of byCampaign) {
      const candidateIds = demoState.assignments
        .filter((item) => item.campaign_id === campaignId && item.telegram_account_id !== account.id)
        .map((item) => item.telegram_account_id);
      const candidates = demoState.accounts.filter((item) => candidateIds.includes(item.id) && isAccountSendable(item));
      const loads = new Map<string, number>();
      candidates.forEach((candidate) => {
        loads.set(candidate.id, demoState.campaignLeads.filter((item) =>
          item.assigned_account_id === candidate.id &&
          openCampaignLeadStatuses.includes((item.status ?? 'queued') as (typeof openCampaignLeadStatuses)[number])
        ).length);
      });

      for (const lead of leads.sort(compareCampaignLeadOrder)) {
        const replacement = [...candidates].sort((a, b) => {
          const aDue = demoState.campaignLeads.filter((item) => item.assigned_account_id === a.id && item.status === 'due').length;
          const bDue = demoState.campaignLeads.filter((item) => item.assigned_account_id === b.id && item.status === 'due').length;
          const aSlots = getEffectiveAccountLimit(a) - aDue;
          const bSlots = getEffectiveAccountLimit(b) - bDue;
          if ((aSlots > 0) !== (bSlots > 0)) return aSlots > 0 ? -1 : 1;
          const loadDiff = (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0);
          if (loadDiff !== 0) return loadDiff;
          return a.id.localeCompare(b.id);
        })[0];

        lead.status = 'queued';
        lead.next_due_at = null;
        lead.stop_reason = null;
        lead.assigned_account_id = replacement?.id ?? null;
        if (replacement) {
          loads.set(replacement.id, (loads.get(replacement.id) ?? 0) + 1);
          transferredCount += 1;
        }
      }
    }

    demoState.sendTasks
      .filter((task) => task.assigned_account_id === account.id && ['pending', 'claimed'].includes(task.status))
      .forEach((task) => {
        const lead = demoState.campaignLeads.find((item) => item.id === task.campaign_lead_id);
        if (!lead || !lead.last_sent_at || (lead.current_step_order ?? 0) === 0) return;
        task.status = 'expired';
        lead.status = getWaitingStatusForFollowup(lead);
        lead.next_due_at = pushOutDueAt(lead.next_due_at, cooldownUntil);
      });

    demoState.campaignLeads
      .filter((item) => item.assigned_account_id === account.id && item.last_sent_at && ['sent_waiting_followup', 'first_followup_done'].includes(item.status))
      .forEach((lead) => {
        lead.next_due_at = pushOutDueAt(lead.next_due_at, cooldownUntil);
      });

    return {
      account,
      restrictedUntil,
      cooldownUntil,
      transferredCount,
      transferWindowCount: transferIds.size,
    };
  }

  const supabase = getAdminSupabaseClient();
  const { data: account } = await supabase!
    .from('telegram_accounts')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();
  if (!account) {
    throw new Error('NOT_LINKED');
  }

  await supabase!
    .from('telegram_accounts')
    .update({
      restricted_until: restrictedUntil,
      cooldown_until: cooldownUntil,
      restriction_reported_at: nowIso(),
      restriction_source_text: messageText.trim(),
    })
    .eq('id', account.id);

  const { count: dueCount } = await supabase!
    .from('campaign_leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_account_id', account.id)
    .eq('status', 'due');

  const transferableQuota = estimateTransferableUntouchedLeadCount({
    dailyLimit: account.daily_limit,
    dueCount: dueCount ?? 0,
    cooldownUntil,
  });

  const { data: untouchedLeads } = await supabase!
    .from('campaign_leads')
    .select('*')
    .eq('assigned_account_id', account.id)
    .is('last_sent_at', null)
    .eq('current_step_order', 0)
    .eq('next_step_order', 1)
    .in('status', ['queued', 'due'])
    .order('created_at', { ascending: true });

  const transferIds = new Set<string>();
  const dueUntouched = (untouchedLeads ?? []).filter((item) => item.status === 'due');
  dueUntouched.forEach((item) => transferIds.add(item.id));
  const remainingQuota = Math.max(0, transferableQuota - transferIds.size);
  (untouchedLeads ?? [])
    .filter((item) => item.status === 'queued')
    .slice(0, remainingQuota)
    .forEach((item) => transferIds.add(item.id));

  const transferLeadIds = [...transferIds];
  if (transferLeadIds.length) {
    await supabase!
      .from('send_tasks')
      .update({ status: 'expired' })
      .eq('assigned_account_id', account.id)
      .in('campaign_lead_id', transferLeadIds)
      .in('status', ['pending', 'claimed']);

    const { data: leadsToTransfer } = await supabase!
      .from('campaign_leads')
      .select('*')
      .in('id', transferLeadIds);

    const byCampaign = new Map<string, CampaignLeadRecord[]>();
    (leadsToTransfer as CampaignLeadRecord[] | null ?? []).forEach((lead) => {
      const list = byCampaign.get(lead.campaign_id) ?? [];
      list.push(lead);
      byCampaign.set(lead.campaign_id, list);
    });

    for (const [campaignId, leads] of byCampaign) {
      const { data: assignmentRows } = await supabase!
        .from('campaign_account_assignments')
        .select('telegram_account_id')
        .eq('campaign_id', campaignId);
      const candidateIds = [...new Set((assignmentRows ?? []).map((item) => item.telegram_account_id).filter((id) => id && id !== account.id))];
      const { data: candidateAccounts } = candidateIds.length
        ? await supabase!
            .from('telegram_accounts')
            .select('*')
            .in('id', candidateIds)
        : { data: [] as TelegramAccountRecord[] };
      const candidates = ((candidateAccounts ?? []) as TelegramAccountRecord[]).filter((item) => isAccountSendable(item));

      const loads = new Map<string, number>();
      const dueLoads = new Map<string, number>();
      for (const candidate of candidates) {
        const [{ count: loadCount }, { count: candidateDueCount }] = await Promise.all([
          supabase!
            .from('campaign_leads')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_account_id', candidate.id)
            .in('status', [...openCampaignLeadStatuses]),
          supabase!
            .from('campaign_leads')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_account_id', candidate.id)
            .eq('status', 'due'),
        ]);
        loads.set(candidate.id, loadCount ?? 0);
        dueLoads.set(candidate.id, candidateDueCount ?? 0);
      }

      for (const lead of leads.sort(compareCampaignLeadOrder)) {
        const replacement = [...candidates].sort((a, b) => {
          const aSlots = getEffectiveAccountLimit(a) - (dueLoads.get(a.id) ?? 0);
          const bSlots = getEffectiveAccountLimit(b) - (dueLoads.get(b.id) ?? 0);
          if ((aSlots > 0) !== (bSlots > 0)) return aSlots > 0 ? -1 : 1;
          const loadDiff = (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0);
          if (loadDiff !== 0) return loadDiff;
          return a.id.localeCompare(b.id);
        })[0];

        await supabase!
          .from('campaign_leads')
          .update({
            status: 'queued',
            next_due_at: null,
            stop_reason: null,
            assigned_account_id: replacement?.id ?? null,
          })
          .eq('id', lead.id);

        if (replacement) {
          loads.set(replacement.id, (loads.get(replacement.id) ?? 0) + 1);
        }
      }
    }
  }

  const { data: followupTasks } = await supabase!
    .from('send_tasks')
    .select('id, campaign_lead_id')
    .eq('assigned_account_id', account.id)
    .in('status', ['pending', 'claimed']);

  const { data: followupLeads } = await supabase!
    .from('campaign_leads')
    .select('*')
    .eq('assigned_account_id', account.id)
    .not('last_sent_at', 'is', null)
    .in('status', ['due', 'sent_waiting_followup', 'first_followup_done']);

  const followupLeadIds = new Set((followupLeads ?? []).map((item) => item.id));
  const followupTaskIds = (followupTasks ?? [])
    .filter((task) => followupLeadIds.has(task.campaign_lead_id))
    .map((task) => task.id);

  if (followupTaskIds.length) {
    await supabase!
      .from('send_tasks')
      .update({ status: 'expired' })
      .in('id', followupTaskIds);
  }

  for (const lead of (followupLeads as CampaignLeadRecord[] | null ?? [])) {
    await supabase!
      .from('campaign_leads')
      .update({
        status: lead.status === 'due' ? getWaitingStatusForFollowup(lead) : lead.status,
        next_due_at: pushOutDueAt(lead.next_due_at, cooldownUntil),
      })
      .eq('id', lead.id);
  }

  await logActivity({
    workspaceId: account.workspace_id,
    profileId: account.owner_id ?? null,
    event_type: 'account.restricted_reported',
    event_label: `Restriction reported for ${account.label}`,
    payload: {
      account_id: account.id,
      restricted_until: restrictedUntil,
      cooldown_until: cooldownUntil,
      transferred_window_leads: transferLeadIds.length,
    },
  });

  return {
    account: {
      ...account,
      restricted_until: restrictedUntil,
      cooldown_until: cooldownUntil,
      restriction_reported_at: nowIso(),
      restriction_source_text: messageText.trim(),
    },
    restrictedUntil,
    cooldownUntil,
    transferredCount: transferLeadIds.length,
    transferWindowCount: transferLeadIds.length,
  };
}

export async function markTaskSent(taskId: string, telegramUserId: number) {
  return completeBotTask(taskId, telegramUserId, { taskStatus: 'sent', replyStatus: null });
}

export async function markTaskSkipped(taskId: string, telegramUserId: number, skipNote?: string) {
  return completeBotTask(taskId, telegramUserId, { taskStatus: 'skipped', replyStatus: null, skipNote });
}

export async function markTaskReply(taskId: string, telegramUserId: number, replyStatus: 'interested' | 'not_interested' | 'replied') {
  return completeBotTask(taskId, telegramUserId, { taskStatus: 'sent', replyStatus });
}

async function completeBotTask(
  taskId: string,
  telegramUserId: number,
  options: { taskStatus: 'sent' | 'skipped'; replyStatus: 'interested' | 'not_interested' | 'replied' | null; skipNote?: string },
) {
  const active = getDemoContext();

  if (!isSupabaseConfigured()) {
    const task = demoState.sendTasks.find((item) => item.id === taskId);
    if (!task) return null;
    task.status = options.taskStatus;
    const campaignLead = demoState.campaignLeads.find((item) => item.id === task.campaign_lead_id);
    const campaign = demoState.campaigns.find((item) => item.id === task.campaign_id);
    const steps = demoState.steps.filter((item) => item.campaign_id === task.campaign_id).sort((a, b) => a.step_order - b.step_order);
    const nextStep = steps.find((item) => item.step_order > task.step_order);
    if (campaignLead) {
      if (options.replyStatus) {
        campaignLead.status = 'replied';
        campaignLead.stop_reason = options.replyStatus;
        campaignLead.last_reply_at = nowIso();
        // Record reply event
        const events = campaignLead.step_events || [];
        events.push({ step_order: task.step_order, event: 'replied', at: nowIso(), account_id: task.assigned_account_id });
        campaignLead.step_events = events;
      } else if (options.taskStatus === 'skipped') {
        campaignLead.status = 'skipped';
        campaignLead.stop_reason = options.skipNote ? `Skipped: ${options.skipNote}` : 'Skipped manually';
        if (options.skipNote) {
          const existing = campaignLead.notes ? `${campaignLead.notes}\n` : '';
          campaignLead.notes = `${existing}[Skip note] ${options.skipNote}`;
        }
      } else {
        // Record sent event
        const events = campaignLead.step_events || [];
        const eventType: 'sent' | 'followup_sent' = task.step_order === 1 ? 'sent' : 'followup_sent';
        events.push({ step_order: task.step_order, event: eventType, at: nowIso(), account_id: task.assigned_account_id });
        campaignLead.step_events = events;

        campaignLead.current_step_order = task.step_order;
        campaignLead.last_sent_at = nowIso();
        if (nextStep) {
          campaignLead.status = task.step_order === 1 ? 'sent_waiting_followup' : 'first_followup_done';
          campaignLead.next_step_order = nextStep.step_order;
          campaignLead.next_due_at = new Date(Date.now() + nextStep.delay_days * 86400000).toISOString();
        } else {
          // No more steps — sequence complete
          campaignLead.status = 'completed';
          campaignLead.next_step_order = null;
          campaignLead.next_due_at = null;
        }
      }
    }

    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: `task.${options.taskStatus}`,
      event_label: `${campaign?.name ?? 'Campaign'} task ${options.taskStatus}`,
      payload: { task_id: taskId, reply_status: options.replyStatus },
    });

    return task;
  }

  const supabase = getAdminSupabaseClient();

  const { data: telegramAccount } = await supabase!
    .from('telegram_accounts')
    .select('id, workspace_id, owner_id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();

  if (!telegramAccount) return null;
  const workspaceId = telegramAccount.workspace_id;
  const simulatedProfileId = telegramAccount.owner_id ?? '';

  const { data: task } = await supabase!
    .from('send_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return null;

  await supabase!
    .from('send_tasks')
    .update({
      status: options.taskStatus,
      completed_at: nowIso(),
    })
    .eq('id', task.id);

  const { data: campaignLead } = await supabase!
    .from('campaign_leads')
    .select('*')
    .eq('id', task.campaign_lead_id)
    .single();

  if (!campaignLead) return task;

  if (options.replyStatus) {
    await supabase!
      .from('campaign_leads')
      .update({
        status: 'replied',
        stop_reason: options.replyStatus,
        last_reply_at: nowIso(),
        step_events: [...(campaignLead.step_events || []), { step_order: task.step_order, event: 'replied', at: nowIso(), account_id: task.assigned_account_id }],
      })
      .eq('id', campaignLead.id);
  } else if (options.taskStatus === 'skipped') {
    const skipReason = options.skipNote ? `Skipped: ${options.skipNote}` : 'Skipped manually';
    const existingNotes = campaignLead.notes ? `${campaignLead.notes}\n` : '';
    const updatedNotes = options.skipNote ? `${existingNotes}[Skip note] ${options.skipNote}` : campaignLead.notes;
    await supabase!
      .from('campaign_leads')
      .update({
        status: 'skipped',
        stop_reason: skipReason,
        ...(options.skipNote ? { notes: updatedNotes } : {}),
      })
      .eq('id', campaignLead.id);
  } else {
    const { data: nextStep } = await supabase!
      .from('campaign_sequence_steps')
      .select('*')
      .eq('campaign_id', task.campaign_id)
      .gt('step_order', task.step_order)
      .order('step_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    const eventType = task.step_order === 1 ? 'sent' : 'followup_sent';
    const sentAt = Date.now();
    const newEvents = [...(campaignLead.step_events || []), { step_order: task.step_order, event: eventType, at: new Date(sentAt).toISOString(), account_id: task.assigned_account_id }];

    if (nextStep) {
      const newStatus = task.step_order === 1 ? 'sent_waiting_followup' : 'first_followup_done';
      // Delay-based date: when this lead's next step is due by message settings
      const delayBasedDate = sentAt + nextStep.delay_days * 86400000;

      // Batch-based date: estimate when all remaining queued/due leads for this account
      // in this campaign will have been sent (so follow-ups don't overlap active outreach)
      let batchBasedDate = delayBasedDate;
      if (task.assigned_account_id) {
        const [{ count: remainingQueued }, { data: accountRow }] = await Promise.all([
          supabase!
            .from('campaign_leads')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_account_id', task.assigned_account_id)
            .eq('campaign_id', task.campaign_id)
            .in('status', ['queued', 'due']),
          supabase!
            .from('telegram_accounts')
            .select('daily_limit, restricted_until, cooldown_until')
            .eq('id', task.assigned_account_id)
            .maybeSingle(),
        ]);
        const remaining = remainingQueued ?? 0;
        const dailyLimit = accountRow ? getEffectiveAccountLimit(accountRow as TelegramAccountRecord) : 20;
        const daysUntilBatchDone = Math.ceil(remaining / dailyLimit);
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        batchBasedDate = todayMidnight.getTime() + daysUntilBatchDone * 86400000;
      }

      const nextDueAt = new Date(Math.max(delayBasedDate, batchBasedDate)).toISOString();

      await supabase!
        .from('campaign_leads')
        .update({
          status: newStatus,
          current_step_order: task.step_order,
          next_step_order: nextStep.step_order,
          next_due_at: nextDueAt,
          last_sent_at: new Date(sentAt).toISOString(),
          step_events: newEvents,
        })
        .eq('id', campaignLead.id);
    } else {
      // No more steps — sequence complete
      await supabase!
        .from('campaign_leads')
        .update({
          status: 'completed',
          current_step_order: task.step_order,
          next_step_order: null,
          next_due_at: null,
          last_sent_at: new Date(sentAt).toISOString(),
          step_events: newEvents,
        })
        .eq('id', campaignLead.id);
    }
  }

  await logActivity({
    workspaceId: task.workspace_id,
    profileId: simulatedProfileId || null,
    event_type: `task.${options.taskStatus}`,
    event_label: `Task ${options.taskStatus}`,
    payload: { task_id: taskId, reply_status: options.replyStatus },
  });

  return task;
}

export async function runBotScheduler() {
  if (!isSupabaseConfigured()) {
    const active = getDemoContext();
    let created = 0;
    let blocked = 0;

    const unassignedCampaignIds = [...new Set(
      demoState.campaignLeads
        .filter((lead) => lead.status === 'queued' && lead.next_step_order === 1 && !lead.assigned_account_id)
        .map((lead) => lead.campaign_id),
    )];
    for (const campaignId of unassignedCampaignIds) {
      await assignUnassignedCampaignLeads(campaignId, active);
    }

    // Phase 0: Recover leads that were blocked at launch due to no account capacity.
    // Re-assign them round-robin to active accounts and reset to queued so Phase 1
    // can promote them in this same scheduler run — no manual pause/relaunch needed.
    {
      const blockedAtLaunch = demoState.campaignLeads.filter(
        cl => cl.status === 'blocked' && cl.stop_reason === 'No account capacity at launch',
      );
      const activeAccts = demoState.accounts.filter(a => isAccountSendable(a));
      if (blockedAtLaunch.length > 0 && activeAccts.length > 0) {
        blockedAtLaunch.forEach((cl, idx) => {
          cl.assigned_account_id = activeAccts[idx % activeAccts.length].id;
          cl.status = 'queued';
          cl.stop_reason = null;
        });
      }
    }

    // Phase 1: promote queued step-1 leads to due, respecting daily limits
    for (const account of demoState.accounts.filter(a => isAccountSendable(a))) {
      const dueCount = demoState.campaignLeads.filter(
        cl => cl.assigned_account_id === account.id && cl.status === 'due'
      ).length;
      let available = Math.max(0, getEffectiveAccountLimit(account) - dueCount);
      if (available <= 0) continue;

      // Build per-campaign due counts for campaigns that have a message_limit on this account
      const campaignDueCount = new Map<string, number>();
      const campaignLimitMap = new Map<string, number>();
      for (const asgn of demoState.assignments.filter(a => a.telegram_account_id === account.id && a.message_limit !== null)) {
        const effectiveCampaignLimit = getEffectiveCampaignLimit(asgn.message_limit, account);
        if (effectiveCampaignLimit === null) continue;
        campaignLimitMap.set(asgn.campaign_id, effectiveCampaignLimit);
        const due = demoState.campaignLeads.filter(
          cl => cl.campaign_id === asgn.campaign_id && cl.assigned_account_id === account.id && cl.status === 'due'
        ).length;
        campaignDueCount.set(asgn.campaign_id, due);
      }

      const queued = demoState.campaignLeads
        .filter(cl => cl.assigned_account_id === account.id && cl.status === 'queued' && cl.next_step_order === 1)
        .sort((a, b) => a.id.localeCompare(b.id));

      for (const campaignLead of queued) {
        if (available <= 0) break;

        // Enforce campaign-level message limit
        const campaignLimit = campaignLimitMap.get(campaignLead.campaign_id);
        if (campaignLimit !== undefined) {
          const alreadyDue = campaignDueCount.get(campaignLead.campaign_id) ?? 0;
          if (alreadyDue >= campaignLimit) continue; // campaign cap reached — skip, try next lead
        }

        const lead = demoState.leads.find(l => l.id === campaignLead.lead_id);
        const step = demoState.steps.find(s => s.campaign_id === campaignLead.campaign_id && s.step_order === 1);
        if (!lead || !step) continue;
        const taskDueAt = nowIso();
        await createSendTask({
          workspace_id: campaignLead.workspace_id,
          campaign_id: campaignLead.campaign_id,
          campaign_lead_id: campaignLead.id,
          lead_id: campaignLead.lead_id,
          sequence_step_id: step.id,
          assigned_account_id: account.id,
          step_order: step.step_order,
          due_at: taskDueAt,
          rendered_message: pickRenderedMessageForStep(step, lead),
          lead_snapshot: { first_name: lead.first_name, last_name: lead.last_name, company_name: lead.company_name, telegram_username: lead.telegram_username, profile_url: buildTelegramProfileUrl(lead.telegram_username) },
        }, active);
        campaignLead.status = 'due';
        campaignLead.next_due_at = taskDueAt;

        // Update campaign due count so we don't exceed the limit within this run
        if (campaignLimit !== undefined) {
          campaignDueCount.set(campaignLead.campaign_id, (campaignDueCount.get(campaignLead.campaign_id) ?? 0) + 1);
        }

        created += 1;
        available -= 1;
      }
    }

    // Phase 2: promote follow-up leads whose next_due_at has arrived
    for (const campaignLead of demoState.campaignLeads) {
      if (!['sent_waiting_followup', 'first_followup_done'].includes(campaignLead.status ?? '')) continue;
      if (!campaignLead.next_step_order || !isDue(campaignLead.next_due_at)) continue;

      const hasExistingTask = demoState.sendTasks.some(
        (task) =>
          task.campaign_lead_id === campaignLead.id &&
          task.step_order === campaignLead.next_step_order &&
          (task.status === 'pending' || task.status === 'claimed'),
      );
      if (hasExistingTask) continue;

      const assignedAccount = demoState.accounts.find((account) => account.id === campaignLead.assigned_account_id);
      if (!assignedAccount?.is_active) {
        campaignLead.status = 'blocked';
        campaignLead.stop_reason = 'Assigned account unavailable at follow-up time';
        blocked += 1;
        continue;
      }
      if (!assignedAccount || !isAccountSendable(assignedAccount)) {
        const pauseUntil = getRestrictionPauseUntil(assignedAccount ?? { restricted_until: null, cooldown_until: null });
        if (pauseUntil) {
          campaignLead.next_due_at = pushOutDueAt(campaignLead.next_due_at, pauseUntil);
        }
        continue;
      }

      const dueCount = demoState.campaignLeads.filter(
        item => item.assigned_account_id === assignedAccount.id && item.status === 'due'
      ).length;
      if (dueCount >= getEffectiveAccountLimit(assignedAccount)) {
        continue;
      }

      const lead = demoState.leads.find((item) => item.id === campaignLead.lead_id);
      const step = demoState.steps.find(
        (item) => item.campaign_id === campaignLead.campaign_id && item.step_order === campaignLead.next_step_order,
      );

      if (!lead || !step || !campaignLead.assigned_account_id || !campaignLead.next_due_at) continue;

      const assignment = demoState.assignments.find(
        (item) => item.campaign_id === campaignLead.campaign_id && item.telegram_account_id === assignedAccount.id,
      );
      const campaignLimit = getEffectiveCampaignLimit(assignment?.message_limit ?? null, assignedAccount);
      if (campaignLimit !== null) {
        const campaignDueCount = demoState.campaignLeads.filter(
          item => item.campaign_id === campaignLead.campaign_id && item.assigned_account_id === assignedAccount.id && item.status === 'due'
        ).length;
        if (campaignDueCount >= campaignLimit) {
          continue;
        }
      }

      await createSendTask({
        workspace_id: campaignLead.workspace_id,
        campaign_id: campaignLead.campaign_id,
        campaign_lead_id: campaignLead.id,
        lead_id: campaignLead.lead_id,
        sequence_step_id: step.id,
        assigned_account_id: campaignLead.assigned_account_id,
        step_order: step.step_order,
        due_at: campaignLead.next_due_at,
        rendered_message: pickRenderedMessageForStep(step, lead),
        lead_snapshot: { first_name: lead.first_name, last_name: lead.last_name, company_name: lead.company_name, telegram_username: lead.telegram_username, profile_url: buildTelegramProfileUrl(lead.telegram_username) },
      }, active);
      campaignLead.status = 'due';
      created += 1;
    }

    for (const task of demoState.sendTasks) {
      if (!isDue(task.due_at) || (task.status !== 'pending' && task.status !== 'claimed')) {
        continue;
      }
      const account = demoState.accounts.find((item) => item.id === task.assigned_account_id);
      if (account && isAccountSendable(account)) {
        continue;
      }
      task.status = 'expired';
      const campaignLead = demoState.campaignLeads.find((item) => item.id === task.campaign_lead_id);
      if (campaignLead) {
        if (campaignLead.last_sent_at) {
          campaignLead.status = getWaitingStatusForFollowup(campaignLead);
          const pauseUntil = getRestrictionPauseUntil(account ?? { restricted_until: null, cooldown_until: null });
          if (pauseUntil) {
            campaignLead.next_due_at = pushOutDueAt(campaignLead.next_due_at, pauseUntil);
          }
        } else {
          campaignLead.status = 'queued';
          campaignLead.next_due_at = null;
        }
        campaignLead.stop_reason = account?.is_active ? null : 'Assigned account unavailable at follow-up time';
      }
      blocked += 1;
    }

    return {
      created,
      blocked,
      dueTasks: demoState.sendTasks.filter((task) => isDue(task.due_at) && (task.status === 'pending' || task.status === 'claimed')).length,
    };
  }

  const supabase = getAdminSupabaseClient();
  const dueNow = nowIso();
  let created = 0;
  let blocked = 0;

  const { data: unassignedQueuedLeads } = await supabase!
    .from('campaign_leads')
    .select('campaign_id, workspace_id')
    .is('assigned_account_id', null)
    .eq('status', 'queued')
    .eq('next_step_order', 1);

  const repairTargets = new Map<string, string>();
  for (const lead of unassignedQueuedLeads ?? []) {
    repairTargets.set(`${lead.workspace_id}:${lead.campaign_id}`, lead.workspace_id);
  }
  for (const key of repairTargets.keys()) {
    const [workspaceId, campaignId] = key.split(':');
    await assignUnassignedCampaignLeads(campaignId, { workspaceId, profileId: null });
  }

  // ── Phase 0: Recover blocked-at-launch leads ──────────────────────────────────────────────
  // Leads blocked solely because there was no account capacity at launch time get
  // reassigned round-robin to active accounts and reset to queued so Phase 1 can
  // pick them up immediately in this same scheduler run — no manual pause/relaunch needed.
  {
    const { data: blockedLeads } = await supabase!
      .from('campaign_leads')
      .select('id, workspace_id')
      .eq('status', 'blocked')
      .eq('stop_reason', 'No account capacity at launch');

    if (blockedLeads && blockedLeads.length > 0) {
      // Group lead IDs by workspace so we only fetch accounts once per workspace
      const byWorkspace = new Map<string, string[]>();
      for (const cl of blockedLeads) {
        const list = byWorkspace.get(cl.workspace_id) ?? [];
        list.push(cl.id);
        byWorkspace.set(cl.workspace_id, list);
      }

      for (const [workspaceId, leadIds] of byWorkspace) {
        const { data: wsAccounts } = await supabase!
          .from('telegram_accounts')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('is_active', true);

        const sendableAccounts = ((wsAccounts ?? []) as TelegramAccountRecord[]).filter((account) => isAccountSendable(account));
        if (!sendableAccounts.length) continue;

        // Assign accounts round-robin and reset each lead to queued
        for (let i = 0; i < leadIds.length; i++) {
          const accountId = sendableAccounts[i % sendableAccounts.length].id;
          await supabase!
            .from('campaign_leads')
            .update({
              status: 'queued',
              assigned_account_id: accountId,
              stop_reason: null,
            })
            .eq('id', leadIds[i]);
        }
      }
    }
  }

  // ── Phase 1: Daily promotion — move queued step-1 leads to due, respecting daily + campaign limits ──
  const { data: activeAccounts } = await supabase!
    .from('telegram_accounts')
    .select('*')
    .eq('is_active', true);

  for (const account of ((activeAccounts ?? []) as TelegramAccountRecord[]).filter((item) => isAccountSendable(item))) {
    // Count leads that are already due (tasks exist, not yet sent) — they occupy account capacity
    const { count: dueCount } = await supabase!
      .from('campaign_leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_account_id', account.id)
      .eq('status', 'due');

    let available = Math.max(0, getEffectiveAccountLimit(account) - (dueCount ?? 0));
    if (available <= 0) continue;

    // Fetch campaign-level message limits for this account (only rows with a limit set)
    const { data: accountAssignments } = await supabase!
      .from('campaign_account_assignments')
      .select('campaign_id, message_limit')
      .eq('telegram_account_id', account.id)
      .not('message_limit', 'is', null);

    const campaignLimitMap = new Map<string, number>();
    for (const assignment of accountAssignments ?? []) {
      const effectiveLimit = getEffectiveCampaignLimit(assignment.message_limit as number, account);
      if (effectiveLimit !== null) {
        campaignLimitMap.set(assignment.campaign_id, effectiveLimit);
      }
    }

    // Pre-compute per-campaign due count for campaigns that have a limit
    const campaignDueCount = new Map<string, number>();
    for (const [campaignId] of campaignLimitMap) {
      const { count } = await supabase!
        .from('campaign_leads')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('assigned_account_id', account.id)
        .eq('status', 'due');
      campaignDueCount.set(campaignId, count ?? 0);
    }

    // Get oldest queued step-1 leads for this account (no hard limit — campaign filtering may skip some)
    const { data: queuedLeads } = await supabase!
      .from('campaign_leads')
      .select('*, leads(*)')
      .eq('assigned_account_id', account.id)
      .eq('status', 'queued')
      .eq('next_step_order', 1)
      .order('created_at', { ascending: true });

    for (const campaignLead of queuedLeads ?? []) {
      if (available <= 0) break;

      // Enforce campaign-level message limit
      const campaignLimit = campaignLimitMap.get(campaignLead.campaign_id);
      if (campaignLimit !== undefined) {
        const alreadyDue = campaignDueCount.get(campaignLead.campaign_id) ?? 0;
        if (alreadyDue >= campaignLimit) continue; // campaign cap reached — skip, try next lead
      }

      const lead = Array.isArray(campaignLead.leads) ? campaignLead.leads[0] : campaignLead.leads;

      // Fetch step separately — no direct FK from campaign_leads to campaign_sequence_steps
      const { data: step } = await supabase!
        .from('campaign_sequence_steps')
        .select('*')
        .eq('campaign_id', campaignLead.campaign_id)
        .eq('step_order', 1)
        .maybeSingle();

      if (!lead || !step) continue;

      const taskDueAt = nowIso();
      await createSendTask({
        workspace_id: campaignLead.workspace_id,
        campaign_id: campaignLead.campaign_id,
        campaign_lead_id: campaignLead.id,
        lead_id: campaignLead.lead_id,
        sequence_step_id: step.id,
        assigned_account_id: account.id,
        step_order: step.step_order,
        due_at: taskDueAt,
        rendered_message: pickRenderedMessageForStep(step, lead),
        lead_snapshot: {
          first_name: lead.first_name,
          last_name: lead.last_name,
          company_name: lead.company_name,
          telegram_username: lead.telegram_username,
          profile_url: buildTelegramProfileUrl(lead.telegram_username),
        },
      }, { workspaceId: account.workspace_id, profileId: null });

      await supabase!
        .from('campaign_leads')
        .update({ status: 'due', next_due_at: taskDueAt })
        .eq('id', campaignLead.id);

      // Update campaign due count so we don't exceed the limit within this run
      if (campaignLimit !== undefined) {
        campaignDueCount.set(campaignLead.campaign_id, (campaignDueCount.get(campaignLead.campaign_id) ?? 0) + 1);
      }

      available -= 1;
      created += 1;
    }
  }

  // ── Phase 2: Follow-up promotion — create tasks for leads whose next_due_at has arrived ──
  const { data: dueCampaignLeads } = await supabase!
    .from('campaign_leads')
    .select('*')
    .in('status', ['sent_waiting_followup', 'first_followup_done'])
    .not('next_step_order', 'is', null)
    .not('next_due_at', 'is', null)
    .lte('next_due_at', dueNow);

  for (const campaignLead of dueCampaignLeads ?? []) {
    const { data: existingTask } = await supabase!
      .from('send_tasks')
      .select('id')
      .eq('campaign_lead_id', campaignLead.id)
      .eq('step_order', campaignLead.next_step_order)
      .in('status', ['pending', 'claimed'])
      .limit(1)
      .maybeSingle();

    if (existingTask) {
      continue;
    }

    // Protect against race conditions if completeBotTask shifted the lead forward.
    const { data: freshLead } = await supabase!
      .from('campaign_leads')
      .select('status, next_step_order')
      .eq('id', campaignLead.id)
      .single();

    if (!freshLead || freshLead.status !== campaignLead.status || freshLead.next_step_order !== campaignLead.next_step_order) {
      continue;
    }

    const [{ data: account }, { data: lead }, { data: step }] = await Promise.all([
      supabase!.from('telegram_accounts').select('*').eq('id', campaignLead.assigned_account_id).maybeSingle(),
      supabase!.from('leads').select('*').eq('id', campaignLead.lead_id).maybeSingle(),
      supabase!
        .from('campaign_sequence_steps')
        .select('*')
        .eq('campaign_id', campaignLead.campaign_id)
        .eq('step_order', campaignLead.next_step_order)
        .maybeSingle(),
    ]);

    if (!account?.is_active) {
      await supabase!
        .from('campaign_leads')
        .update({
          status: 'blocked',
          stop_reason: 'Assigned account unavailable at follow-up time',
        })
        .eq('id', campaignLead.id);
      blocked += 1;
      continue;
    }
    if (!isAccountSendable(account as TelegramAccountRecord)) {
      const pauseUntil = getRestrictionPauseUntil(account as TelegramAccountRecord);
      if (pauseUntil) {
        await supabase!
          .from('campaign_leads')
          .update({ next_due_at: pushOutDueAt(campaignLead.next_due_at, pauseUntil) })
          .eq('id', campaignLead.id);
      }
      continue;
    }

    if (!lead || !step || !campaignLead.assigned_account_id || !campaignLead.next_due_at) {
      continue;
    }

    const [{ count: dueCount }, { data: accountAssignments }] = await Promise.all([
      supabase!
        .from('campaign_leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_account_id', account.id)
        .eq('status', 'due'),
      supabase!
        .from('campaign_account_assignments')
        .select('message_limit')
        .eq('campaign_id', campaignLead.campaign_id)
        .eq('telegram_account_id', account.id)
        .maybeSingle(),
    ]);

    if ((dueCount ?? 0) >= getEffectiveAccountLimit(account as TelegramAccountRecord)) {
      continue;
    }

    const effectiveCampaignLimit = getEffectiveCampaignLimit((accountAssignments?.message_limit as number | null) ?? null, account as TelegramAccountRecord);
    if (effectiveCampaignLimit !== null) {
      const { count: campaignDueCount } = await supabase!
        .from('campaign_leads')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignLead.campaign_id)
        .eq('assigned_account_id', account.id)
        .eq('status', 'due');
      if ((campaignDueCount ?? 0) >= effectiveCampaignLimit) {
        continue;
      }
    }

    await createSendTask({
      workspace_id: campaignLead.workspace_id,
      campaign_id: campaignLead.campaign_id,
      campaign_lead_id: campaignLead.id,
      lead_id: campaignLead.lead_id,
      sequence_step_id: step.id,
      assigned_account_id: campaignLead.assigned_account_id,
      step_order: step.step_order,
      due_at: campaignLead.next_due_at,
      rendered_message: pickRenderedMessageForStep(step, lead),
      lead_snapshot: {
        first_name: lead.first_name,
        last_name: lead.last_name,
        company_name: lead.company_name,
        telegram_username: lead.telegram_username,
        profile_url: buildTelegramProfileUrl(lead.telegram_username),
      },
    }, {
      workspaceId: campaignLead.workspace_id,
      profileId: null,
    });

    await supabase!
      .from('campaign_leads')
      .update({ status: 'due' })
      .eq('id', campaignLead.id);
    created += 1;
  }

  const { data: dueTasks } = await supabase!
    .from('send_tasks')
    .select('*')
    .in('status', ['pending', 'claimed'])
    .lte('due_at', dueNow);

  for (const task of dueTasks ?? []) {
    const { data: account } = await supabase!
      .from('telegram_accounts')
      .select('*')
      .eq('id', task.assigned_account_id)
      .maybeSingle();

    if (account && isAccountSendable(account as TelegramAccountRecord)) {
      continue;
    }

    await supabase!
      .from('send_tasks')
      .update({
        status: 'expired',
        completed_at: dueNow,
      })
      .eq('id', task.id);

    const { data: campaignLead } = await supabase!
      .from('campaign_leads')
      .select('*')
      .eq('id', task.campaign_lead_id)
      .maybeSingle();

    if (campaignLead) {
      if (campaignLead.last_sent_at) {
        const pauseUntil = getRestrictionPauseUntil(
          (account as TelegramAccountRecord | null) ?? { restricted_until: null, cooldown_until: null },
        ) ?? dueNow;
        await supabase!
          .from('campaign_leads')
          .update({
            status: getWaitingStatusForFollowup(campaignLead as CampaignLeadRecord),
            next_due_at: pushOutDueAt(campaignLead.next_due_at, pauseUntil),
            stop_reason: null,
          })
          .eq('id', task.campaign_lead_id);
      } else {
        await supabase!
          .from('campaign_leads')
          .update({
            status: 'queued',
            next_due_at: null,
            stop_reason: account?.is_active ? null : 'Assigned account unavailable at follow-up time',
          })
          .eq('id', task.campaign_lead_id);
      }
    }

    blocked += 1;
  }

  return {
    created,
    blocked,
    dueTasks: (dueTasks ?? []).filter((task) => task.status === 'pending' || task.status === 'claimed').length,
  };
}

export async function markLeadReplied(telegramUsername: string): Promise<{ ok: boolean }> {
  const clean = normalizeTelegramUsername(telegramUsername);

  if (!isSupabaseConfigured()) {
    const lead = demoState.leads.find((l) => l.telegram_username === clean);
    if (!lead) return { ok: false };
    const cl = demoState.campaignLeads.find(
      (c) => c.lead_id === lead.id && ['due', 'queued', 'sent_waiting_followup', 'first_followup_done'].includes(c.status ?? ''),
    );
    if (!cl) return { ok: false };
    cl.status = 'replied';
    cl.last_reply_at = nowIso();
    return { ok: true };
  }

  const supabase = getAdminSupabaseClient();
  const { data: lead } = await supabase!
    .from('leads')
    .select('id')
    .eq('telegram_username', clean)
    .limit(1)
    .maybeSingle();
  if (!lead) return { ok: false };

  const { data: cl } = await supabase!
    .from('campaign_leads')
    .select('id')
    .eq('lead_id', lead.id)
    .in('status', ['due', 'queued', 'sent_waiting_followup', 'first_followup_done'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cl) return { ok: false };

  await supabase!
    .from('campaign_leads')
    .update({ status: 'replied', last_reply_at: nowIso() })
    .eq('id', cl.id);

  return { ok: true };
}

export async function logActivity(input: {
  workspaceId: string;
  profileId: string | null;
  event_type: string;
  event_label: string;
  payload: Record<string, unknown>;
}) {
  if (!isSupabaseConfigured()) {
    const record: ActivityLogRecord = {
      id: demoId('activity'),
      workspace_id: input.workspaceId,
      event_type: input.event_type,
      event_label: input.event_label,
      payload: input.payload,
      created_at: nowIso(),
    };
    demoState.activity.unshift(record);
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('activity_log')
    .insert({
      workspace_id: input.workspaceId,
      actor_profile_id: input.profileId,
      event_type: input.event_type,
      event_label: input.event_label,
      payload: input.payload,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ActivityLogRecord;
}

export async function updateSequenceStep(stepId: string, input: unknown, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const parsed = sequenceStepUpdateSchema.parse(input);
  const payload = {
    ...parsed,
    ...((parsed.message_template !== undefined || parsed.message_variants !== undefined)
      ? resolveStepMessagePayload(parsed)
      : {}),
  };
  if (!isSupabaseConfigured()) {
    const record = demoState.steps.find((s) => s.id === stepId);
    if (record) {
      Object.assign(record, payload);
    }
    return record;
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaign_sequence_steps')
    .update(payload)
    .eq('workspace_id', active.workspaceId)
    .eq('id', stepId)
    .select('*')
    .single();
  if (error) throw error;
  return data as SequenceStepRecord;
}

// ─── Experimental: Telegram API Credentials ──────────────────────────────────

export type TelegramCredentialRow = {
  id: string;
  workspace_id: string;
  profile_id: string;
  api_id: string;
  api_hash: string;
  phone: string;
  session_string: string | null;
  phone_code_hash: string | null;
  is_authenticated: boolean;
  created_at: string;
  updated_at: string;
};

export async function getTelegramCredential(context: WorkspaceContext): Promise<TelegramCredentialRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getAdminSupabaseClient();
  const { data } = await supabase!
    .from('telegram_api_credentials')
    .select('*')
    .eq('workspace_id', context.workspaceId)
    .eq('profile_id', context.profileId)
    .maybeSingle();
  return data as TelegramCredentialRow | null;
}

export async function upsertTelegramCredential(
  context: WorkspaceContext,
  input: { api_id: string; api_hash: string; phone: string },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getAdminSupabaseClient();
  await supabase!.from('telegram_api_credentials').upsert(
    {
      workspace_id: context.workspaceId,
      profile_id: context.profileId,
      api_id: input.api_id,
      api_hash: input.api_hash,
      phone: input.phone,
      is_authenticated: false,
      session_string: null,
      phone_code_hash: null,
      updated_at: nowIso(),
    },
    { onConflict: 'profile_id,workspace_id' },
  );
}

export async function saveTelegramPhoneCodeHash(context: WorkspaceContext, phoneCodeHash: string, sessionString: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getAdminSupabaseClient();
  await supabase!
    .from('telegram_api_credentials')
    .update({ phone_code_hash: phoneCodeHash, session_string: sessionString, updated_at: nowIso() })
    .eq('workspace_id', context.workspaceId)
    .eq('profile_id', context.profileId);
}

export async function saveTelegramSession(context: WorkspaceContext, sessionString: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getAdminSupabaseClient();
  await supabase!
    .from('telegram_api_credentials')
    .update({ session_string: sessionString, phone_code_hash: null, is_authenticated: true, updated_at: nowIso() })
    .eq('workspace_id', context.workspaceId)
    .eq('profile_id', context.profileId);
}

export async function deleteTelegramCredential(context: WorkspaceContext): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getAdminSupabaseClient();
  await supabase!
    .from('telegram_api_credentials')
    .delete()
    .eq('workspace_id', context.workspaceId)
    .eq('profile_id', context.profileId);
}

// ─── Experimental: Telegram Account Console ─────────────────────────────────

export type TgConsoleAccountPrivateRow = TgConsoleAccountRecord & {
  session_ciphertext: string | null;
  pending_session_ciphertext: string | null;
  phone_code_hash: string | null;
  proxy_config_ciphertext: string | null;
};

function toTgConsoleAccountRecord(row: any): TgConsoleAccountRecord {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    profile_id: row.profile_id ?? null,
    phone: row.phone,
    telegram_user_id: row.telegram_user_id === null || row.telegram_user_id === undefined ? null : String(row.telegram_user_id),
    telegram_username: row.telegram_username ?? null,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    is_authenticated: Boolean(row.is_authenticated),
    status: row.status,
    proxy_redacted: row.proxy_redacted ?? null,
    proxy_status: row.proxy_status ?? null,
    proxy_checked_at: row.proxy_checked_at ?? null,
    last_sync_at: row.last_sync_at ?? null,
    last_inbox_update_at: row.last_inbox_update_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toTgConsoleAccountPrivate(row: any): TgConsoleAccountPrivateRow {
  return {
    ...toTgConsoleAccountRecord(row),
    session_ciphertext: row.session_ciphertext ?? null,
    pending_session_ciphertext: row.pending_session_ciphertext ?? null,
    phone_code_hash: row.phone_code_hash ?? null,
    proxy_config_ciphertext: row.proxy_config_ciphertext ?? null,
  };
}

function normalizeTgConsoleUsername(input: string) {
  return normalizeTelegramUsername(input).toLowerCase();
}

export async function listTgConsoleAccounts(context?: WorkspaceContext): Promise<TgConsoleAccountRecord[]> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return demoState.tgConsoleAccounts.filter((account) => account.workspace_id === active.workspaceId);
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_connected_accounts')
    .select('id, workspace_id, profile_id, phone, telegram_user_id, telegram_username, display_name, avatar_url, is_authenticated, status, proxy_redacted, proxy_status, proxy_checked_at, last_sync_at, last_inbox_update_at, created_at, updated_at')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTgConsoleAccountRecord);
}

export async function getTgConsoleAccountPrivate(context: WorkspaceContext, accountId: string): Promise<TgConsoleAccountPrivateRow | null> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    const account = demoState.tgConsoleAccounts.find((item) => item.id === accountId && item.workspace_id === active.workspaceId);
    if (!account) return null;
    return { ...account, session_ciphertext: null, pending_session_ciphertext: null, phone_code_hash: null, proxy_config_ciphertext: null };
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_connected_accounts')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw error;
  return data ? toTgConsoleAccountPrivate(data) : null;
}

export async function upsertTgConsolePendingAccount(
  context: WorkspaceContext,
  input: {
    phone: string;
    pendingSessionCiphertext: string;
    phoneCodeHash: string;
    proxyConfigCiphertext?: string | null;
    proxyRedacted?: string | null;
  },
): Promise<TgConsoleAccountRecord> {
  const active = resolveWorkspaceContext(context);
  const parsed = tgConsolePhoneSchema.parse({ phone: input.phone });
  const payload = {
    workspace_id: active.workspaceId,
    profile_id: active.profileId,
    phone: parsed.phone,
    pending_session_ciphertext: input.pendingSessionCiphertext,
    phone_code_hash: input.phoneCodeHash,
    is_authenticated: false,
    status: 'pending_code',
    updated_at: nowIso(),
    ...(input.proxyConfigCiphertext !== undefined ? { proxy_config_ciphertext: input.proxyConfigCiphertext } : {}),
    ...(input.proxyRedacted !== undefined ? { proxy_redacted: input.proxyRedacted } : {}),
  };

  if (!isSupabaseConfigured()) {
    const existing = demoState.tgConsoleAccounts.find((item) => item.workspace_id === active.workspaceId && item.phone === parsed.phone);
    if (existing) {
      Object.assign(existing, {
        is_authenticated: false,
        status: 'pending_code',
        updated_at: nowIso(),
        ...(input.proxyRedacted !== undefined ? { proxy_redacted: input.proxyRedacted } : {}),
      });
      return existing;
    }
    const record: TgConsoleAccountRecord = {
      id: demoId('tg-console-account'),
      workspace_id: active.workspaceId,
      profile_id: active.profileId,
      phone: parsed.phone,
      telegram_user_id: null,
      telegram_username: null,
      display_name: null,
      avatar_url: null,
      is_authenticated: false,
      status: 'pending_code',
      proxy_redacted: input.proxyRedacted ?? null,
      proxy_status: null,
      proxy_checked_at: null,
      last_sync_at: null,
      last_inbox_update_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    demoState.tgConsoleAccounts.unshift(record);
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_connected_accounts')
    .upsert(payload, { onConflict: 'workspace_id,phone' })
    .select('id, workspace_id, profile_id, phone, telegram_user_id, telegram_username, display_name, is_authenticated, status, proxy_redacted, proxy_status, proxy_checked_at, last_sync_at, last_inbox_update_at, created_at, updated_at')
    .single();
  if (error) throw error;

  await logActivity({
    workspaceId: active.workspaceId,
    profileId: active.profileId,
    event_type: 'telegram.login.code_sent',
    event_label: `Telegram code sent to ${parsed.phone}`,
    payload: { account_id: data.id, phone: parsed.phone },
  });

  return toTgConsoleAccountRecord(data);
}

export async function saveTgConsoleAuthenticatedSession(
  context: WorkspaceContext,
  accountId: string,
  input: {
    sessionCiphertext: string;
    telegramUserId?: string | number | null;
    telegramUsername?: string | null;
    displayName?: string | null;
  },
): Promise<TgConsoleAccountRecord> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    const account = demoState.tgConsoleAccounts.find((item) => item.id === accountId && item.workspace_id === active.workspaceId);
    if (!account) throw new Error('Telegram account not found.');
    Object.assign(account, {
      telegram_user_id: input.telegramUserId === null || input.telegramUserId === undefined ? account.telegram_user_id : String(input.telegramUserId),
      telegram_username: input.telegramUsername ?? account.telegram_username,
      display_name: input.displayName ?? account.display_name,
      is_authenticated: true,
      status: 'authenticated',
      updated_at: nowIso(),
    });
    return account;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_connected_accounts')
    .update({
      session_ciphertext: input.sessionCiphertext,
      pending_session_ciphertext: null,
      phone_code_hash: null,
      telegram_user_id: input.telegramUserId === null || input.telegramUserId === undefined ? null : String(input.telegramUserId),
      telegram_username: input.telegramUsername,
      display_name: input.displayName,
      is_authenticated: true,
      status: 'authenticated',
      updated_at: nowIso(),
    })
    .eq('workspace_id', active.workspaceId)
    .eq('id', accountId)
    .select('id, workspace_id, profile_id, phone, telegram_user_id, telegram_username, display_name, is_authenticated, status, proxy_redacted, proxy_status, proxy_checked_at, last_sync_at, last_inbox_update_at, created_at, updated_at')
    .single();
  if (error) throw error;

  await logActivity({
    workspaceId: active.workspaceId,
    profileId: active.profileId,
    event_type: 'telegram.login.verified',
    event_label: `Telegram account connected: ${data.phone}`,
    payload: { account_id: accountId, telegram_user_id: data.telegram_user_id, telegram_username: data.telegram_username },
  });

  return toTgConsoleAccountRecord(data);
}

export async function saveTgConsoleProxy(
  context: WorkspaceContext,
  accountId: string,
  input: { proxy: TgConsoleProxyConfig; proxyConfigCiphertext: string; proxyStatus: string },
): Promise<TgConsoleAccountRecord> {
  const active = resolveWorkspaceContext(context);
  const proxy = tgConsoleProxySchema.parse(input.proxy);
  const proxyRedacted = redactTgProxyConfig(proxy);

  if (!isSupabaseConfigured()) {
    const account = demoState.tgConsoleAccounts.find((item) => item.id === accountId && item.workspace_id === active.workspaceId);
    if (!account) throw new Error('Telegram account not found.');
    Object.assign(account, {
      proxy_redacted: proxyRedacted,
      proxy_status: input.proxyStatus,
      proxy_checked_at: nowIso(),
      updated_at: nowIso(),
    });
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: 'telegram.proxy.changed',
      event_label: `Proxy changed for ${account.phone}`,
      payload: { account_id: accountId, proxy: proxyRedacted, proxy_status: input.proxyStatus },
    });
    return account;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_connected_accounts')
    .update({
      proxy_config_ciphertext: input.proxyConfigCiphertext,
      proxy_redacted: proxyRedacted,
      proxy_status: input.proxyStatus,
      proxy_checked_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('workspace_id', active.workspaceId)
    .eq('id', accountId)
    .select('id, workspace_id, profile_id, phone, telegram_user_id, telegram_username, display_name, is_authenticated, status, proxy_redacted, proxy_status, proxy_checked_at, last_sync_at, last_inbox_update_at, created_at, updated_at')
    .single();
  if (error) throw error;

  await logActivity({
    workspaceId: active.workspaceId,
    profileId: active.profileId,
    event_type: 'telegram.proxy.changed',
    event_label: `Proxy changed for ${data.phone}`,
    payload: { account_id: accountId, proxy: proxyRedacted, proxy_status: input.proxyStatus },
  });

  return toTgConsoleAccountRecord(data);
}

/** Normalize a raw DB/demo row into a safe TgConsoleDialogRecord */
function normalizeDialogRow(row: any): TgConsoleDialogRecord {
  return {
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : [],
    avatar_url: row.avatar_url ?? null,
  } as TgConsoleDialogRecord;
}

export async function listTgConsoleDialogs(context: WorkspaceContext, accountId?: string | null): Promise<TgConsoleDialogRecord[]> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return demoState.tgConsoleDialogs
      .filter((dialog) => dialog.workspace_id === active.workspaceId && (!accountId || dialog.account_id === accountId))
      .sort((a, b) => (a.last_message_at ?? '').localeCompare(b.last_message_at ?? '') * -1);
  }

  const supabase = getAdminSupabaseClient();
  let query = supabase!
    .from('telegram_dialogs')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (accountId) query = query.eq('account_id', accountId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(normalizeDialogRow);
}

export async function listTgConsoleMessages(context: WorkspaceContext, dialogId?: string | null): Promise<TgConsoleMessageRecord[]> {
  const active = resolveWorkspaceContext(context);
  if (!dialogId) return [];
  if (!isSupabaseConfigured()) {
    return demoState.tgConsoleMessages
      .filter((message) => message.workspace_id === active.workspaceId && message.dialog_id === dialogId)
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_messages')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .eq('dialog_id', dialogId)
    .order('sent_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as TgConsoleMessageRecord[];
}

export async function getTgConsoleMessage(context: WorkspaceContext, messageId: string): Promise<TgConsoleMessageRecord | null> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return demoState.tgConsoleMessages.find((message) => message.workspace_id === active.workspaceId && message.id === messageId) ?? null;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_messages')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .eq('id', messageId)
    .maybeSingle();
  if (error) throw error;
  return data as TgConsoleMessageRecord | null;
}

export async function getTgConsoleDialog(
  context: WorkspaceContext,
  dialogId: string,
): Promise<TgConsoleDialogRecord | null> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return demoState.tgConsoleDialogs.find((dialog) => dialog.workspace_id === active.workspaceId && dialog.id === dialogId) ?? null;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_dialogs')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .eq('id', dialogId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeDialogRow(data) : null;
}

export async function updateTgConsoleDialog(
  context: WorkspaceContext,
  dialogId: string,
  input: unknown,
): Promise<TgConsoleDialogRecord> {
  const active = resolveWorkspaceContext(context);
  const parsed = tgConsoleDialogUpdateSchema.parse(input);

  if (!isSupabaseConfigured()) {
    const dialog = demoState.tgConsoleDialogs.find((item) => item.id === dialogId && item.workspace_id === active.workspaceId);
    if (!dialog) throw new Error('Dialog not found.');
    Object.assign(dialog, { ...parsed, updated_at: nowIso() });
    return dialog;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_dialogs')
    .update({ ...parsed, updated_at: nowIso() })
    .eq('workspace_id', active.workspaceId)
    .eq('id', dialogId)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeDialogRow(data);
}

export async function upsertTgConsoleDialog(
  context: WorkspaceContext,
  input: Omit<TgConsoleDialogRecord, 'id' | 'workspace_id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<TgConsoleDialogRecord> {
  const active = resolveWorkspaceContext(context);
  const payload = {
    ...input,
    workspace_id: active.workspaceId,
    updated_at: nowIso(),
  };

  if (!isSupabaseConfigured()) {
    const existing = demoState.tgConsoleDialogs.find((dialog) => dialog.account_id === input.account_id && dialog.telegram_dialog_id === input.telegram_dialog_id);
    if (existing) {
      Object.assign(existing, payload);
      return existing;
    }
    const record: TgConsoleDialogRecord = {
      id: input.id ?? demoId('tg-dialog'),
      created_at: nowIso(),
      ...payload,
    };
    demoState.tgConsoleDialogs.unshift(record);
    return record;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_dialogs')
    .upsert(payload, { onConflict: 'account_id,telegram_dialog_id' })
    .select('*')
    .single();
  if (error) throw error;
  return normalizeDialogRow(data);
}

export async function upsertTgConsoleMessages(
  context: WorkspaceContext,
  messages: Array<Omit<TgConsoleMessageRecord, 'id' | 'workspace_id' | 'created_at'> & { id?: string }>,
): Promise<void> {
  const active = resolveWorkspaceContext(context);
  if (!messages.length) return;

  const mergeMetadata = (
    existingMetadata: Record<string, unknown> | null | undefined,
    nextMetadata: Record<string, unknown> | null | undefined,
  ) => ({
    ...(existingMetadata ?? {}),
    ...(nextMetadata ?? {}),
  });

  if (!isSupabaseConfigured()) {
    for (const message of messages) {
      const existing = demoState.tgConsoleMessages.find((item) => item.dialog_id === message.dialog_id && item.telegram_message_id === message.telegram_message_id);
      if (existing) Object.assign(existing, { ...message, metadata: mergeMetadata(existing.metadata, message.metadata) });
      else demoState.tgConsoleMessages.push({
        id: message.id ?? demoId('tg-message'),
        workspace_id: active.workspaceId,
        created_at: nowIso(),
        ...message,
      });
    }
    return;
  }

  const supabase = getAdminSupabaseClient();
  const dialogIds = [...new Set(messages.map((message) => message.dialog_id))];
  const telegramMessageIds = [...new Set(messages.map((message) => message.telegram_message_id))];
  const { data: existingRows, error: existingError } = await supabase!
    .from('telegram_messages')
    .select('dialog_id, telegram_message_id, metadata')
    .eq('workspace_id', active.workspaceId)
    .in('dialog_id', dialogIds)
    .in('telegram_message_id', telegramMessageIds);
  if (existingError) throw existingError;
  const existingByKey = new Map(
    (existingRows ?? []).map((row) => [`${row.dialog_id}:${row.telegram_message_id}`, row.metadata as Record<string, unknown> | null]),
  );

  const { error } = await supabase!
    .from('telegram_messages')
    .upsert(messages.map((message) => ({
      ...message,
      workspace_id: active.workspaceId,
      metadata: mergeMetadata(existingByKey.get(`${message.dialog_id}:${message.telegram_message_id}`), message.metadata),
    })), { onConflict: 'dialog_id,telegram_message_id' });
  if (error) throw error;
}

export async function markTgConsoleAccountSynced(context: WorkspaceContext, accountId: string): Promise<void> {
  const active = resolveWorkspaceContext(context);
  const timestamp = nowIso();
  if (!isSupabaseConfigured()) {
    const account = demoState.tgConsoleAccounts.find((item) => item.id === accountId && item.workspace_id === active.workspaceId);
    if (account) {
      account.last_sync_at = timestamp;
      account.last_inbox_update_at = timestamp;
      account.updated_at = timestamp;
    }
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: 'telegram.sync.completed',
      event_label: 'Telegram inbox sync completed',
      payload: { account_id: accountId },
    });
    return;
  }

  const supabase = getAdminSupabaseClient();
  const { error } = await supabase!
    .from('telegram_connected_accounts')
    .update({ last_sync_at: timestamp, last_inbox_update_at: timestamp, updated_at: timestamp })
    .eq('workspace_id', active.workspaceId)
    .eq('id', accountId);
  if (error) throw error;

  await logActivity({
    workspaceId: active.workspaceId,
    profileId: active.profileId,
    event_type: 'telegram.sync.completed',
    event_label: 'Telegram inbox sync completed',
    payload: { account_id: accountId },
  });
}

export async function updateTgConsoleAccountAvatar(context: WorkspaceContext, accountId: string, avatarUrl: string): Promise<void> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    const account = demoState.tgConsoleAccounts.find((item) => item.id === accountId && item.workspace_id === active.workspaceId);
    if (account) (account as any).avatar_url = avatarUrl;
    return;
  }
  const supabase = getAdminSupabaseClient();
  await supabase!
    .from('telegram_connected_accounts')
    .update({ avatar_url: avatarUrl, updated_at: nowIso() })
    .eq('workspace_id', active.workspaceId)
    .eq('id', accountId);
}

export async function listTgWarmedUsernames(context: WorkspaceContext): Promise<TgWarmedUsernameRecord[]> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return demoState.tgWarmedUsernames.filter((item) => item.workspace_id === active.workspaceId);
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_warmed_usernames')
    .select('*')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TgWarmedUsernameRecord[];
}

export async function addTgWarmedUsername(context: WorkspaceContext, input: unknown): Promise<TgWarmedUsernameRecord> {
  const active = resolveWorkspaceContext(context);
  const parsed = tgWarmedUsernameInputSchema.parse(input);
  const username = normalizeTgConsoleUsername(parsed.username);
  if (!username) throw new Error('Username is required.');
  const payload = {
    workspace_id: active.workspaceId,
    username,
    label: parsed.label ?? null,
    notes: parsed.notes ?? null,
    tags: parsed.tags,
  };

  if (!isSupabaseConfigured()) {
    const existing = demoState.tgWarmedUsernames.find((item) => item.workspace_id === active.workspaceId && item.username === username);
    if (existing) Object.assign(existing, payload);
    else demoState.tgWarmedUsernames.unshift({ id: demoId('tg-warmed'), created_at: nowIso(), ...payload });
    return demoState.tgWarmedUsernames.find((item) => item.workspace_id === active.workspaceId && item.username === username)!;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_warmed_usernames')
    .upsert(payload, { onConflict: 'workspace_id,username' })
    .select('*')
    .single();
  if (error) throw error;
  return data as TgWarmedUsernameRecord;
}

export async function deleteTgWarmedUsername(context: WorkspaceContext, id: string): Promise<void> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    demoState.tgWarmedUsernames = demoState.tgWarmedUsernames.filter((item) => !(item.workspace_id === active.workspaceId && item.id === id));
    return;
  }
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase!
    .from('telegram_warmed_usernames')
    .delete()
    .eq('workspace_id', active.workspaceId)
    .eq('id', id);
  if (error) throw error;
}

export async function listTgSendApprovals(context: WorkspaceContext): Promise<TgSendApprovalRecord[]> {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    return demoState.tgSendApprovals.filter((item) => item.workspace_id === active.workspaceId);
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_send_approvals')
    .select('id, workspace_id, account_id, dialog_id, target_username, message_text, status, scheduled_for, media_name, media_mime_type, media_size, approved_by_profile_id, approved_at, delivery_result, created_at, updated_at')
    .eq('workspace_id', active.workspaceId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as TgSendApprovalRecord[];
}

export async function createTgSendApprovals(context: WorkspaceContext, input: unknown): Promise<TgSendApprovalRecord[]> {
  const active = resolveWorkspaceContext(context);
  const parsed = tgSendApprovalInputSchema.parse(input);
  const timestamp = nowIso();
  const scheduledFor = parsed.scheduled_for ? new Date(parsed.scheduled_for) : null;
  if (scheduledFor && scheduledFor.getTime() <= Date.now() - 30_000) {
    throw new Error('Choose a future time for scheduled sends.');
  }
  const isScheduled = Boolean(scheduledFor);
  const status = isScheduled ? 'scheduled' : parsed.approve_now ? 'sending' : 'pending_approval';
  const approvedBy = parsed.approve_now || isScheduled ? active.profileId : null;
  const approvedAt = parsed.approve_now || isScheduled ? timestamp : null;
  const targetUsernames = parsed.target_usernames.map(normalizeTgConsoleUsername);
  const mediaColumns = parsed.media
    ? {
      media_name: parsed.media.name,
      media_mime_type: parsed.media.type || null,
      media_size: parsed.media.size,
      media_base64: parsed.media.data_base64,
    }
    : {
      media_name: null,
      media_mime_type: null,
      media_size: null,
      media_base64: null,
    };
  const rows = [
    ...parsed.dialog_ids.map((dialogId) => ({
      workspace_id: active.workspaceId,
      account_id: parsed.account_id,
      dialog_id: dialogId,
      target_username: null,
      message_text: parsed.message_text,
      status,
      scheduled_for: scheduledFor?.toISOString() ?? null,
      ...mediaColumns,
      approved_by_profile_id: approvedBy,
      approved_at: approvedAt,
      delivery_result: null,
      created_at: timestamp,
      updated_at: timestamp,
    })),
    ...targetUsernames.map((username) => ({
      workspace_id: active.workspaceId,
      account_id: parsed.account_id,
      dialog_id: null,
      target_username: username,
      message_text: parsed.message_text,
      status,
      scheduled_for: scheduledFor?.toISOString() ?? null,
      ...mediaColumns,
      approved_by_profile_id: approvedBy,
      approved_at: approvedAt,
      delivery_result: null,
      created_at: timestamp,
      updated_at: timestamp,
    })),
  ];

  if (!isSupabaseConfigured()) {
    const records = rows.map((row) => ({ id: demoId('tg-send'), ...row })) as TgSendApprovalRecord[];
    demoState.tgSendApprovals.unshift(...records);
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: isScheduled ? 'telegram.send.scheduled' : parsed.approve_now ? 'telegram.send.dispatch_requested' : 'telegram.send.pending_approval',
      event_label: isScheduled ? 'Telegram send scheduled' : parsed.approve_now ? 'Telegram send dispatch requested' : 'Telegram send queued for approval',
      payload: { account_id: parsed.account_id, count: records.length, scheduled_for: scheduledFor?.toISOString() ?? null },
    });
    return records;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_send_approvals')
    .insert(rows)
    .select('*');
  if (error) throw error;

  await logActivity({
    workspaceId: active.workspaceId,
    profileId: active.profileId,
    event_type: isScheduled ? 'telegram.send.scheduled' : parsed.approve_now ? 'telegram.send.dispatch_requested' : 'telegram.send.pending_approval',
    event_label: isScheduled ? 'Telegram send scheduled' : parsed.approve_now ? 'Telegram send dispatch requested' : 'Telegram send queued for approval',
    payload: { account_id: parsed.account_id, count: data?.length ?? rows.length, scheduled_for: scheduledFor?.toISOString() ?? null },
  });

  return (data ?? []) as TgSendApprovalRecord[];
}

export async function approveTgSendApproval(context: WorkspaceContext, approvalId: string): Promise<TgSendApprovalRecord> {
  const active = resolveWorkspaceContext(context);
  const timestamp = nowIso();
  if (!isSupabaseConfigured()) {
    const approval = demoState.tgSendApprovals.find((item) => item.id === approvalId && item.workspace_id === active.workspaceId);
    if (!approval) throw new Error('Send approval not found.');
    Object.assign(approval, {
      status: 'sending',
      approved_by_profile_id: active.profileId,
      approved_at: timestamp,
      updated_at: timestamp,
    });
    return approval;
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_send_approvals')
    .update({
      status: 'sending',
      approved_by_profile_id: active.profileId,
      approved_at: timestamp,
      updated_at: timestamp,
    })
    .eq('workspace_id', active.workspaceId)
    .eq('id', approvalId)
    .eq('status', 'pending_approval')
    .select('*')
    .single();
  if (error) throw error;

  await logActivity({
    workspaceId: active.workspaceId,
    profileId: active.profileId,
    event_type: 'telegram.send.dispatch_requested',
    event_label: 'Telegram send dispatch requested',
    payload: { approval_id: approvalId, account_id: data.account_id },
  });

  return data as TgSendApprovalRecord;
}

export async function retryTgSendApprovalNow(context: WorkspaceContext, approvalId: string): Promise<TgSendApprovalRecord> {
  const active = resolveWorkspaceContext(context);
  const timestamp = nowIso();
  if (!isSupabaseConfigured()) {
    const approval = demoState.tgSendApprovals.find((item) => item.id === approvalId && item.workspace_id === active.workspaceId);
    if (!approval) throw new Error('Send approval not found.');
    Object.assign(approval, {
      status: 'sending',
      scheduled_for: null,
      approved_by_profile_id: active.profileId,
      approved_at: timestamp,
      delivery_result: null,
      updated_at: timestamp,
    });
    return approval;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_send_approvals')
    .update({
      status: 'sending',
      scheduled_for: null,
      approved_by_profile_id: active.profileId,
      approved_at: timestamp,
      delivery_result: null,
      updated_at: timestamp,
    })
    .eq('workspace_id', active.workspaceId)
    .eq('id', approvalId)
    .in('status', ['failed', 'cancelled', 'scheduled'])
    .select('*')
    .single();
  if (error) throw error;

  await logActivity({
    workspaceId: active.workspaceId,
    profileId: active.profileId,
    event_type: 'telegram.send.retry_requested',
    event_label: 'Telegram send retry requested',
    payload: { approval_id: approvalId, account_id: data.account_id },
  });

  return data as TgSendApprovalRecord;
}

export type DashboardAnalytics = {
  activeAccounts: number;
  totalAccounts: number;
  liveCampaigns: number;
  totalCampaigns: number;
  openLeads: number;
  blockedLeads: number;
  repliedLeads: number;
  totalCampaignLeads: number;
  totalCrmLeads: number;
  totalSends: number;
  totalReplies: number;
  avgReplyRate: number;
  sendsToday: number;
  sendsYesterday: number;
  heatmap: Array<{ iso: string; count: number }>;
  campaignPulse: Array<{
    campaign_id: string;
    name: string;
    status: string;
    totalLeads: number;
    sentToday: number;
    totalSent: number;
    replies: number;
    replyRate: number;
    accountCount: number;
  }>;
  accountUtilization: Array<{
    account_id: string;
    label: string;
    telegram_username: string | null;
    profile_picture_url: string | null;
    daily_limit: number;
    sentToday: number;
    sentYesterday: number;
    campaignCount: number;
  }>;
};

function dayKeyFromIso(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return dayKeyFromIso(new Date().toISOString())!;
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKeyFromIso(d.toISOString())!;
}

export async function getDashboardAnalytics(
  context?: WorkspaceContext,
  options: { heatmapDays?: number } = {},
): Promise<DashboardAnalytics> {
  const active = resolveWorkspaceContext(context);
  const heatmapDays = Math.max(1, options.heatmapDays ?? 120);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - heatmapDays + 1);
  const sinceIso = since.toISOString();

  const today = todayKey();
  const yesterday = yesterdayKey();

  type StepEvent = { step_order?: number; event?: string; at?: string; account_id?: string | null };
  type LeadAggRow = {
    id: string;
    campaign_id: string;
    assigned_account_id: string | null;
    status: string;
    last_sent_at: string | null;
    last_reply_at: string | null;
    step_events: StepEvent[] | null;
  };

  let accounts: Array<{ id: string; label: string; telegram_username: string | null; profile_picture_url: string | null; daily_limit: number; is_active: boolean }> = [];
  let campaigns: Array<{ id: string; name: string; status: string }> = [];
  let leadRows: LeadAggRow[] = [];
  let crmLeadCount = 0;
  let assignments: Array<{ campaign_id: string; telegram_account_id: string }> = [];

  if (!isSupabaseConfigured()) {
    accounts = demoState.accounts.map((a) => ({
      id: a.id,
      label: a.label,
      telegram_username: a.telegram_username ?? null,
      profile_picture_url: (a as any).profile_picture_url ?? null,
      daily_limit: a.daily_limit,
      is_active: a.is_active,
    }));
    campaigns = demoState.campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status }));
    leadRows = demoState.campaignLeads.map((l) => ({
      id: l.id,
      campaign_id: l.campaign_id,
      assigned_account_id: l.assigned_account_id,
      status: l.status,
      last_sent_at: l.last_sent_at ?? null,
      last_reply_at: l.last_reply_at ?? null,
      step_events: (l as any).step_events ?? [],
    }));
    crmLeadCount = demoState.leads.length;
    assignments = demoState.assignments.map((a) => ({
      campaign_id: a.campaign_id,
      telegram_account_id: a.telegram_account_id,
    }));
  } else {
    const supabase = getAdminSupabaseClient();
    const [accountsRes, campaignsRes, leadsRes, crmRes, assignmentsRes] = await Promise.all([
      supabase!
        .from('telegram_accounts')
        .select('id, label, telegram_username, profile_picture_url, daily_limit, is_active')
        .eq('workspace_id', active.workspaceId),
      supabase!
        .from('campaigns')
        .select('id, name, status')
        .eq('workspace_id', active.workspaceId),
      supabase!
        .from('campaign_leads')
        .select('id, campaign_id, assigned_account_id, status, last_sent_at, last_reply_at, step_events')
        .eq('workspace_id', active.workspaceId),
      supabase!
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', active.workspaceId),
      supabase!
        .from('campaign_account_assignments')
        .select('campaign_id, telegram_account_id')
        .eq('workspace_id', active.workspaceId),
    ]);
    if (accountsRes.error) throw accountsRes.error;
    if (campaignsRes.error) throw campaignsRes.error;
    if (leadsRes.error) throw leadsRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;
    accounts = (accountsRes.data ?? []) as typeof accounts;
    campaigns = (campaignsRes.data ?? []) as typeof campaigns;
    leadRows = (leadsRes.data ?? []) as LeadAggRow[];
    crmLeadCount = crmRes.count ?? 0;
    assignments = (assignmentsRes.data ?? []) as typeof assignments;
  }

  const activeAccounts = accounts.filter((a) => a.is_active).length;
  const liveCampaigns = campaigns.filter((c) => c.status === 'active').length;

  const openStatuses = new Set(['due', 'queued', 'sent_waiting_followup', 'first_followup_done']);
  let openLeads = 0;
  let blockedLeads = 0;
  let repliedLeads = 0;
  for (const lead of leadRows) {
    if (lead.status === 'blocked') blockedLeads++;
    else if (lead.status === 'replied') repliedLeads++;
    if (openStatuses.has(lead.status)) openLeads++;
  }

  // Heatmap + totals built from step_events (truest source of per-send timestamps).
  // Fall back to last_sent_at when step_events is missing.
  const sendCountByDay = new Map<string, number>();
  let totalSends = 0;
  let totalReplies = 0;
  let sendsToday = 0;
  let sendsYesterday = 0;

  const perCampaignSendsToday = new Map<string, number>();
  const perCampaignTotalSends = new Map<string, number>();
  const perAccountSendsToday = new Map<string, number>();
  const perAccountSendsYesterday = new Map<string, number>();

  const addSend = (iso: string, campaignId: string, accountId: string | null) => {
    const key = dayKeyFromIso(iso);
    if (!key) return;
    totalSends++;
    if (key >= sinceIso.slice(0, 10)) {
      sendCountByDay.set(key, (sendCountByDay.get(key) ?? 0) + 1);
    }
    if (key === today) {
      sendsToday++;
      perCampaignSendsToday.set(campaignId, (perCampaignSendsToday.get(campaignId) ?? 0) + 1);
      if (accountId) perAccountSendsToday.set(accountId, (perAccountSendsToday.get(accountId) ?? 0) + 1);
    } else if (key === yesterday) {
      sendsYesterday++;
      if (accountId) perAccountSendsYesterday.set(accountId, (perAccountSendsYesterday.get(accountId) ?? 0) + 1);
    }
    perCampaignTotalSends.set(campaignId, (perCampaignTotalSends.get(campaignId) ?? 0) + 1);
  };

  for (const lead of leadRows) {
    const events = Array.isArray(lead.step_events) ? lead.step_events : [];
    const sendEvents = events.filter((ev) => ev?.at && (ev.event === 'sent' || ev.event === 'followup_sent'));
    if (sendEvents.length) {
      for (const ev of sendEvents) {
        if (ev.at) addSend(ev.at, lead.campaign_id, ev.account_id ?? lead.assigned_account_id ?? null);
      }
    } else if (lead.last_sent_at) {
      addSend(lead.last_sent_at, lead.campaign_id, lead.assigned_account_id);
    }
    if (lead.status === 'replied' || lead.last_reply_at) totalReplies++;
  }

  const avgReplyRate = totalSends ? Math.round((totalReplies / totalSends) * 100) : 0;

  // Build heatmap array of last N days (oldest first).
  const heatmap: DashboardAnalytics['heatmap'] = [];
  const cursor = new Date(since);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = dayKeyFromIso(cursor.toISOString())!;
    heatmap.push({ iso: key, count: sendCountByDay.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const assignmentsByCampaign = new Map<string, Set<string>>();
  for (const row of assignments) {
    if (!assignmentsByCampaign.has(row.campaign_id)) assignmentsByCampaign.set(row.campaign_id, new Set());
    assignmentsByCampaign.get(row.campaign_id)!.add(row.telegram_account_id);
  }

  const campaignLeadCountByCampaign = new Map<string, number>();
  const campaignRepliesByCampaign = new Map<string, number>();
  for (const lead of leadRows) {
    campaignLeadCountByCampaign.set(lead.campaign_id, (campaignLeadCountByCampaign.get(lead.campaign_id) ?? 0) + 1);
    if (lead.status === 'replied') {
      campaignRepliesByCampaign.set(lead.campaign_id, (campaignRepliesByCampaign.get(lead.campaign_id) ?? 0) + 1);
    }
  }

  const campaignPulse = campaigns
    .map((c) => {
      const total = campaignLeadCountByCampaign.get(c.id) ?? 0;
      const sent = perCampaignTotalSends.get(c.id) ?? 0;
      const replies = campaignRepliesByCampaign.get(c.id) ?? 0;
      return {
        campaign_id: c.id,
        name: c.name,
        status: c.status,
        totalLeads: total,
        sentToday: perCampaignSendsToday.get(c.id) ?? 0,
        totalSent: sent,
        replies,
        replyRate: sent ? Math.round((replies / sent) * 100) : 0,
        accountCount: assignmentsByCampaign.get(c.id)?.size ?? 0,
      };
    })
    .sort((a, b) => b.sentToday - a.sentToday || b.totalSent - a.totalSent);

  const accountUtilization = accounts
    .map((a) => {
      const campaignCount = [...assignmentsByCampaign.entries()].filter(([, ids]) => ids.has(a.id)).length;
      return {
        account_id: a.id,
        label: a.label,
        telegram_username: a.telegram_username,
        profile_picture_url: a.profile_picture_url,
        daily_limit: a.daily_limit,
        sentToday: perAccountSendsToday.get(a.id) ?? 0,
        sentYesterday: perAccountSendsYesterday.get(a.id) ?? 0,
        campaignCount,
      };
    })
    .sort((a, b) => b.sentToday - a.sentToday || b.campaignCount - a.campaignCount);

  return {
    activeAccounts,
    totalAccounts: accounts.length,
    liveCampaigns,
    totalCampaigns: campaigns.length,
    openLeads,
    blockedLeads,
    repliedLeads,
    totalCampaignLeads: leadRows.length,
    totalCrmLeads: crmLeadCount,
    totalSends,
    totalReplies,
    avgReplyRate,
    sendsToday,
    sendsYesterday,
    heatmap,
    campaignPulse,
    accountUtilization,
  };
}
