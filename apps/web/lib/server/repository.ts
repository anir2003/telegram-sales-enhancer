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
  const payload = records.map((record) => ({
    ...record,
    telegram_username: normalizeTelegramUsername(record.telegram_username),
    workspace_id: active.workspaceId,
    created_by: active.profileId,
  }));

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
    return {
      campaign,
      steps: demoState.steps.filter((item) => item.campaign_id === campaignId).sort((a, b) => a.step_order - b.step_order),
      attachedLeads: demoState.campaignLeads.filter((item) => item.campaign_id === campaignId),
      accounts: demoState.accounts,
      assignedAccountIds: demoState.assignments
        .filter((item) => item.campaign_id === campaignId)
        .map((item) => item.telegram_account_id),
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
    leads: (leads as LeadRecord[]) ?? [],
  };
}

export async function addSequenceStep(campaignId: string, input: unknown, context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  const parsed = sequenceStepInputSchema.parse(input);
  const payload = {
    ...parsed,
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

export async function setCampaignAccounts(campaignId: string, accountIds: string[], context?: WorkspaceContext) {
  const active = resolveWorkspaceContext(context);
  if (!isSupabaseConfigured()) {
    demoState.assignments = demoState.assignments.filter((item) => item.campaign_id !== campaignId);
    accountIds.forEach((accountId) => {
      demoState.assignments.push({
        id: demoId('assignment'),
        workspace_id: active.workspaceId,
        campaign_id: campaignId,
        telegram_account_id: accountId,
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
  }));
  const { error } = await supabase!.from('campaign_account_assignments').insert(payload);
  if (error) throw error;
  return accountIds;
}

function distributeAccounts(accounts: TelegramAccountRecord[], total: number) {
  const slots: string[] = [];
  const caps = new Map(accounts.map((a) => [a.id, a.daily_limit]));
  const activeAccounts = [...accounts];

  while (slots.length < total && activeAccounts.length > 0) {
    for (let i = 0; i < activeAccounts.length; i++) {
      const account = activeAccounts[i];
      const remaining = caps.get(account.id)!;
      if (remaining > 0) {
        slots.push(account.id);
        caps.set(account.id, remaining - 1);
        if (slots.length >= total) break;
      } else {
        activeAccounts.splice(i, 1);
        i--; // Adjust index because we removed an element
      }
    }
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
  const firstStep = detail.steps[0];
  const createdTasks: SendTaskRecord[] = [];

  for (const [index, campaignLead] of detail.attachedLeads.entries()) {
    const lead = leadById.get(campaignLead.lead_id);
    if (!lead) continue;
    const assignedAccountId = slots[index] ?? null;

    if (!assignedAccountId) {
      await updateCampaignLead(campaignLead.id, {
        status: 'blocked',
        stop_reason: 'Daily cap reached before launch',
      }, active);
      continue;
    }

    const dueAt = nowIso();
    await updateCampaignLead(campaignLead.id, {
      assigned_account_id: assignedAccountId,
      status: 'due',
      next_due_at: dueAt,
      next_step_order: 1,
    }, active);

    const task = await createSendTask({
      workspace_id: active.workspaceId,
      campaign_id: campaignId,
      campaign_lead_id: campaignLead.id,
      lead_id: campaignLead.lead_id,
      sequence_step_id: firstStep.id,
      assigned_account_id: assignedAccountId,
      step_order: firstStep.step_order,
      due_at: dueAt,
      rendered_message: renderMessageTemplate(firstStep.message_template, lead),
      lead_snapshot: {
        first_name: lead.first_name,
        company_name: lead.company_name,
        telegram_username: lead.telegram_username,
        profile_url: buildTelegramProfileUrl(lead.telegram_username),
      },
    }, active);
    createdTasks.push(task);
  }

  if (!isSupabaseConfigured()) {
    const campaign = demoState.campaigns.find((item) => item.id === campaignId)!;
    campaign.status = 'active';
    await logActivity({
      workspaceId: active.workspaceId,
      profileId: active.profileId,
      event_type: 'campaign.launched',
      event_label: `${campaign.name} launched`,
      payload: { campaign_id: campaignId, created_tasks: createdTasks.length },
    });
    return createdTasks;
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
    payload: { campaign_id: campaignId, created_tasks: createdTasks.length },
  });

  return createdTasks;
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

export async function createBotLinkCode(context?: WorkspaceContext) {
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
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function consumeBotLinkCode(input: { code: string; telegramUserId: number; telegramUsername?: string | null }) {
  if (!isSupabaseConfigured()) {
    const match = demoState.botCodes.find((item) => item.code === input.code && !item.consumed_at);
    if (!match) return null;
    match.consumed_at = nowIso();
    demoProfile.telegram_user_id = input.telegramUserId;
    demoProfile.telegram_username = input.telegramUsername ?? null;
    return demoProfile;
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

  const { data: profile } = await supabase!
    .from('profiles')
    .update({
      telegram_user_id: input.telegramUserId,
      telegram_username: input.telegramUsername ?? null,
    })
    .eq('id', codeRow.profile_id)
    .select('*')
    .single();

  return profile;
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
      purpose: 'account',
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
      purpose: 'account',
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
      (item) => item.code === input.code && !item.consumed_at && (item as any).purpose === 'account',
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
    .eq('purpose', 'account')
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
    let profile = demoProfile.telegram_user_id === telegramUserId ? demoProfile : null;
    let userAccountIds: string[] = [];
    let workspaceId: string;
    let fallbackProfileId: string;

    if (profile) {
      workspaceId = profile.workspace_id;
      fallbackProfileId = profile.id;
      userAccountIds = demoState.accounts.filter((a) => a.owner_id === profile.id).map((a) => a.id);
    } else {
      const account = demoState.accounts.find((a) => a.telegram_user_id === telegramUserId);
      if (!account) throw new Error('NOT_LINKED');
      workspaceId = account.workspace_id;
      userAccountIds = [account.id];
      fallbackProfileId = account.owner_id ?? demoProfile.id;
    }

    const claimed = demoState.sendTasks.find(
      (item) =>
        item.workspace_id === workspaceId &&
        item.status === 'claimed' &&
        item.claimed_by_profile_id === fallbackProfileId &&
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
  const { data: profile } = await supabase!
    .from('profiles')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();

  let userAccountIds: string[] = [];
  let workspaceId: string;
  let simulatedProfileId: string;

  if (profile) {
    workspaceId = profile.workspace_id;
    simulatedProfileId = profile.id;
    const { data: userAccounts } = await supabase!
      .from('telegram_accounts')
      .select('id')
      .eq('owner_id', profile.id);

    if (userAccounts && userAccounts.length > 0) {
      userAccountIds = userAccounts.map(a => a.id);
    }
  } else {
    // Fallback: check if the telegram user is a standalone sender account
    const { data: telegramAccount } = await supabase!
      .from('telegram_accounts')
      .select('id, workspace_id, owner_id')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    if (!telegramAccount) {
      throw new Error('NOT_LINKED');
    }

    workspaceId = telegramAccount.workspace_id;
    userAccountIds = [telegramAccount.id];
    simulatedProfileId = telegramAccount.owner_id ?? '';
  }

  if (userAccountIds.length === 0) return null;

  const dueNow = nowIso();

  const { data: claimedTask } = await supabase!
    .from('send_tasks')
    .select('*, leads(*), campaigns(name), telegram_accounts(label, telegram_username)')
    .eq('workspace_id', workspaceId)
    .in('assigned_account_id', userAccountIds)
    .eq('status', 'claimed')
    .eq('claimed_by_profile_id', simulatedProfileId)
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
      claimed_by_profile_id: profile.id,
      claimed_at: dueNow,
    })
    .eq('id', pendingTask.id)
    .eq('status', 'pending')
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
    const nextStep = steps.find((item) => item.step_order === task.step_order + 1);
    if (campaignLead) {
      if (options.replyStatus) {
        campaignLead.status = 'replied';
        campaignLead.stop_reason = options.replyStatus;
        campaignLead.last_reply_at = nowIso();
      } else if (options.taskStatus === 'skipped') {
        campaignLead.status = 'skipped';
        campaignLead.stop_reason = 'Skipped manually';
      } else if (nextStep) {
        campaignLead.status = 'sent_waiting_followup';
        campaignLead.current_step_order = task.step_order;
        campaignLead.next_step_order = nextStep.step_order;
        campaignLead.next_due_at = new Date(Date.now() + nextStep.delay_days * 86400000).toISOString();
        campaignLead.last_sent_at = nowIso();
      } else {
        campaignLead.status = 'completed';
        campaignLead.current_step_order = task.step_order;
        campaignLead.next_step_order = null;
        campaignLead.next_due_at = null;
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
  const { data: profile } = await supabase!
    .from('profiles')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();

  let workspaceId: string;
  let simulatedProfileId: string;

  if (profile) {
    workspaceId = profile.workspace_id;
    simulatedProfileId = profile.id;
  } else {
    // Fallback: check if the telegram user is a standalone sender account
    const { data: telegramAccount } = await supabase!
      .from('telegram_accounts')
      .select('id, workspace_id, owner_id')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    if (!telegramAccount) return null;
    workspaceId = telegramAccount.workspace_id;
    simulatedProfileId = telegramAccount.owner_id ?? '';
  }

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
      claimed_by_profile_id: simulatedProfileId || null,
      claimed_at: nowIso(),
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
      .eq('step_order', task.step_order + 1)
      .maybeSingle();

    if (nextStep) {
      const nextDueAt = new Date(Date.now() + nextStep.delay_days * 86400000).toISOString();
      await supabase!
        .from('campaign_leads')
        .update({
          status: 'sent_waiting_followup',
          current_step_order: task.step_order,
          next_step_order: nextStep.step_order,
          next_due_at: nextDueAt,
          last_sent_at: nowIso(),
        })
        .eq('id', campaignLead.id);
    } else {
      await supabase!
        .from('campaign_leads')
        .update({
          status: 'completed',
          current_step_order: task.step_order,
          next_step_order: null,
          next_due_at: null,
          last_sent_at: nowIso(),
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

    for (const campaignLead of demoState.campaignLeads) {
      if (!campaignLead.next_step_order || !isDue(campaignLead.next_due_at)) {
        continue;
      }

      const hasExistingTask = demoState.sendTasks.some(
        (task) =>
          task.campaign_lead_id === campaignLead.id &&
          task.step_order === campaignLead.next_step_order &&
          (task.status === 'pending' || task.status === 'claimed'),
      );

      if (hasExistingTask) {
        continue;
      }

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

  const { data: dueCampaignLeads } = await supabase!
    .from('campaign_leads')
    .select('*')
    .in('status', ['queued', 'sent_waiting_followup', 'due'])
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
