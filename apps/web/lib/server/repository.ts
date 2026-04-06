import {
  buildTelegramProfileUrl,
  campaignInputSchema,
  createOneTimeCode,
  leadInputSchema,
  normalizeTelegramUsername,
  renderMessageTemplate,
  sequenceStepInputSchema,
  sequenceStepUpdateSchema,
  telegramAccountInputSchema,
  type ActivityLogRecord,
  type CampaignLeadRecord,
  type CampaignRecord,
  type LeadRecord,
  type SendTaskRecord,
  type SequenceStepRecord,
  type TelegramAccountRecord,
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
  if (input.first_name !== undefined) payload.first_name = String(input.first_name).trim();
  if (input.last_name !== undefined) payload.last_name = String(input.last_name).trim();
  if (input.company_name !== undefined) payload.company_name = String(input.company_name).trim();
  if (input.telegram_username !== undefined) payload.telegram_username = normalizeTelegramUsername(String(input.telegram_username));
  if (input.tags !== undefined) payload.tags = Array.isArray(input.tags) ? input.tags : [];
  if (input.source !== undefined) payload.source = String(input.source).trim() || null;

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
  const payload = {
    ...parsed,
    step_name: parsed.step_name ?? null,
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
  return accountIds;
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

export async function launchCampaign(campaignId: string, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const detail = await getCampaignDetail(campaignId, active);
  if (!detail.campaign) throw new Error('Campaign not found');
  if (!detail.steps.length) throw new Error('Add at least one sequence step before launch');
  if (!detail.attachedLeads.length) throw new Error('Attach at least one lead before launch');

  const assignedAccounts = detail.accounts.filter((account) => detail.assignedAccountIds.includes(account.id) && account.is_active);
  if (!assignedAccounts.length) throw new Error('Assign at least one active account before launch');

  const slots = distributeAccounts(assignedAccounts, detail.attachedLeads.length);
  const leadById = new Map(detail.leads.map((lead) => [lead.id, lead]));
  let queuedCount = 0;

  for (const [index, campaignLead] of detail.attachedLeads.entries()) {
    const lead = leadById.get(campaignLead.lead_id);
    if (!lead) continue;
    const assignedAccountId = slots[index]; // always defined — distributeAccounts covers all leads

    // Queue every lead regardless of daily limits. If this lead was previously
    // blocked only because of "No account capacity at launch" (the old buggy
    // behaviour), re-launching will recover it here. The scheduler promotes
    // leads from queued → due each day up to each account's daily_limit.
    await updateCampaignLead(campaignLead.id, {
      assigned_account_id: assignedAccountId,
      status: 'queued',
      next_due_at: null,
      next_step_order: 1,
    }, active);
    queuedCount++;
  }

  if (!isSupabaseConfigured()) {
    const campaign = demoState.campaigns.find((item) => item.id === campaignId)!;
    campaign.status = 'active';
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: 'campaign.launched',
      event_label: `${campaign.name} launched`,
      payload: { campaign_id: campaignId, queued_leads: queuedCount },
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
    payload: { campaign_id: campaignId, queued_leads: queuedCount },
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
    .limit(100);
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
      created_at: nowIso(),
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
    task.status = 'claimed';
    task.claimed_by_profile_id = fallbackProfileId;
    return buildBotTaskPayload(task);
  }

  const supabase = getAdminSupabaseClient();
  const { data: telegramAccount } = await supabase!
    .from('telegram_accounts')
    .select('id, workspace_id, owner_id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();

  if (!telegramAccount) {
    throw new Error('NOT_LINKED');
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

  const { data: claimed } = await supabase!
    .from('send_tasks')
    .update({
      status: 'claimed',
      claimed_by_profile_id: simulatedProfileId || null,
      claimed_at: dueNow,
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

export async function markTaskSent(taskId: string, telegramUserId: number) {
  return completeBotTask(taskId, telegramUserId, { taskStatus: 'sent', replyStatus: null });
}

export async function markTaskSkipped(taskId: string, telegramUserId: number) {
  return completeBotTask(taskId, telegramUserId, { taskStatus: 'skipped', replyStatus: null });
}

export async function markTaskReply(taskId: string, telegramUserId: number, replyStatus: 'interested' | 'not_interested' | 'replied') {
  return completeBotTask(taskId, telegramUserId, { taskStatus: 'sent', replyStatus });
}

async function completeBotTask(
  taskId: string,
  telegramUserId: number,
  options: { taskStatus: 'sent' | 'skipped'; replyStatus: 'interested' | 'not_interested' | 'replied' | null },
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
        campaignLead.stop_reason = 'Skipped manually';
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
    await supabase!
      .from('campaign_leads')
      .update({
        status: 'skipped',
        stop_reason: 'Skipped manually',
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
            .select('daily_limit')
            .eq('id', task.assigned_account_id)
            .maybeSingle(),
        ]);
        const remaining = remainingQueued ?? 0;
        const dailyLimit = accountRow?.daily_limit ?? 20;
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

    // Phase 0: Recover leads that were blocked at launch due to no account capacity.
    // Re-assign them round-robin to active accounts and reset to queued so Phase 1
    // can promote them in this same scheduler run — no manual pause/relaunch needed.
    {
      const blockedAtLaunch = demoState.campaignLeads.filter(
        cl => cl.status === 'blocked' && cl.stop_reason === 'No account capacity at launch',
      );
      const activeAccts = demoState.accounts.filter(a => a.is_active);
      if (blockedAtLaunch.length > 0 && activeAccts.length > 0) {
        blockedAtLaunch.forEach((cl, idx) => {
          cl.assigned_account_id = activeAccts[idx % activeAccts.length].id;
          cl.status = 'queued';
          cl.stop_reason = null;
        });
      }
    }

    // Phase 1: promote queued step-1 leads to due, respecting daily limits
    for (const account of demoState.accounts.filter(a => a.is_active)) {
      const dueCount = demoState.campaignLeads.filter(
        cl => cl.assigned_account_id === account.id && cl.status === 'due'
      ).length;
      let available = Math.max(0, account.daily_limit - dueCount);
      if (available <= 0) continue;

      // Build per-campaign due counts for campaigns that have a message_limit on this account
      const campaignDueCount = new Map<string, number>();
      const campaignLimitMap = new Map<string, number>();
      for (const asgn of demoState.assignments.filter(a => a.telegram_account_id === account.id && a.message_limit !== null)) {
        campaignLimitMap.set(asgn.campaign_id, asgn.message_limit!);
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
          rendered_message: renderMessageTemplate(step.message_template, lead),
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

      const lead = demoState.leads.find((item) => item.id === campaignLead.lead_id);
      const step = demoState.steps.find(
        (item) => item.campaign_id === campaignLead.campaign_id && item.step_order === campaignLead.next_step_order,
      );

      if (!lead || !step || !campaignLead.assigned_account_id || !campaignLead.next_due_at) continue;

      await createSendTask({
        workspace_id: campaignLead.workspace_id,
        campaign_id: campaignLead.campaign_id,
        campaign_lead_id: campaignLead.id,
        lead_id: campaignLead.lead_id,
        sequence_step_id: step.id,
        assigned_account_id: campaignLead.assigned_account_id,
        step_order: step.step_order,
        due_at: campaignLead.next_due_at,
        rendered_message: renderMessageTemplate(step.message_template, lead),
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
      if (account?.is_active) {
        continue;
      }
      task.status = 'expired';
      const campaignLead = demoState.campaignLeads.find((item) => item.id === task.campaign_lead_id);
      if (campaignLead) {
        campaignLead.status = 'blocked';
        campaignLead.stop_reason = 'Assigned account unavailable at follow-up time';
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
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('is_active', true);

        if (!wsAccounts || wsAccounts.length === 0) continue;

        // Assign accounts round-robin and reset each lead to queued
        for (let i = 0; i < leadIds.length; i++) {
          const accountId = wsAccounts[i % wsAccounts.length].id;
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
    .select('id, daily_limit, workspace_id')
    .eq('is_active', true);

  for (const account of activeAccounts ?? []) {
    // Count leads that are already due (tasks exist, not yet sent) — they occupy account capacity
    const { count: dueCount } = await supabase!
      .from('campaign_leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_account_id', account.id)
      .eq('status', 'due');

    let available = Math.max(0, account.daily_limit - (dueCount ?? 0));
    if (available <= 0) continue;

    // Fetch campaign-level message limits for this account (only rows with a limit set)
    const { data: accountAssignments } = await supabase!
      .from('campaign_account_assignments')
      .select('campaign_id, message_limit')
      .eq('telegram_account_id', account.id)
      .not('message_limit', 'is', null);

    const campaignLimitMap = new Map<string, number>(
      (accountAssignments ?? []).map((a) => [a.campaign_id, a.message_limit as number]),
    );

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
        rendered_message: renderMessageTemplate(step.message_template, lead),
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

    if (!lead || !step || !campaignLead.assigned_account_id || !campaignLead.next_due_at) {
      continue;
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
      rendered_message: renderMessageTemplate(step.message_template, lead),
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

    if (account?.is_active) {
      continue;
    }

    await supabase!
      .from('send_tasks')
      .update({
        status: 'expired',
        completed_at: dueNow,
      })
      .eq('id', task.id);

    await supabase!
      .from('campaign_leads')
      .update({
        status: 'blocked',
        stop_reason: 'Assigned account unavailable at follow-up time',
      })
      .eq('id', task.campaign_lead_id);

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
  if (!isSupabaseConfigured()) {
    const record = demoState.steps.find((s) => s.id === stepId);
    if (record) {
      Object.assign(record, parsed);
    }
    return record;
  }
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('campaign_sequence_steps')
    .update(parsed)
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
