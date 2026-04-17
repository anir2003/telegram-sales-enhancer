import { Api } from 'telegram';
import { isSupabaseConfigured } from '@/lib/env';
import { demoId } from '@/lib/server/demo-store';
import { getTgConsoleAccountPrivate, logActivity } from '@/lib/server/repository';
import { getWorkspaceSecret, resolveTelegramConnectorMode } from '@/lib/server/tg-console/credentials';
import { buildTelegramClient } from '@/lib/server/tg-console/client';
import { decryptJson, decryptSecret } from '@/lib/server/tg-console/crypto';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import {
  normalizeTelegramUsername,
  tgGroupLeadCleanInputSchema,
  tgGroupLeadScrapeInputSchema,
  tgGroupLeadSaveInputSchema,
  type LeadRecord,
  type TgConsoleProxyConfig,
  type TgGroupLeadResultRecord,
  type TgGroupLeadScrapeJobRecord,
  type TgGroupLeadScrapeMode,
} from '@telegram-enhancer/shared';

type WorkspaceContext = { workspaceId: string; profileId: string | null };
type ScrapeInput = ReturnType<typeof tgGroupLeadScrapeInputSchema.parse>;
type InsertableGroupLeadResult =
  Omit<TgGroupLeadResultRecord, 'id' | 'created_at' | 'company_name' | 'company_confidence' | 'company_reason' | 'ai_cleaned_at'>
  & Partial<Pick<TgGroupLeadResultRecord, 'company_name' | 'company_confidence' | 'company_reason' | 'ai_cleaned_at'>>;

type GroupOption = {
  id: string;
  title: string;
  username: string | null;
  ref: string;
};

const inMemoryJobs: TgGroupLeadScrapeJobRecord[] = [];
const inMemoryResults: TgGroupLeadResultRecord[] = [];
const runningJobs = new Set<string>();

function nowIso() {
  return new Date().toISOString();
}

function toJob(row: any): TgGroupLeadScrapeJobRecord {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    profile_id: row.profile_id ?? null,
    account_id: row.account_id ?? null,
    group_ref: row.group_ref,
    group_title: row.group_title ?? null,
    mode: row.mode,
    status: row.status,
    total_found: Number(row.total_found ?? 0),
    processed_count: Number(row.processed_count ?? 0),
    saved_count: Number(row.saved_count ?? 0),
    error: row.error ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toResult(row: any): TgGroupLeadResultRecord {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    job_id: row.job_id,
    telegram_user_id: String(row.telegram_user_id),
    name: row.name ?? '',
    username: row.username ?? null,
    bio: row.bio ?? null,
    premium: Boolean(row.premium),
    avatar_data_url: row.avatar_data_url ?? null,
    company_name: row.company_name ?? null,
    company_confidence: row.company_confidence === null || row.company_confidence === undefined ? null : Number(row.company_confidence),
    company_reason: row.company_reason ?? null,
    ai_cleaned_at: row.ai_cleaned_at ?? null,
    created_at: row.created_at,
  };
}

function normalizeGroupRef(value: string) {
  let clean = value.trim();
  clean = clean.replace(/^https?:\/\/t\.me\//i, '');
  clean = clean.replace(/^t\.me\//i, '');
  clean = clean.replace(/^@/, '');
  return clean.trim();
}

function idString(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function displayName(user: any) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    || user?.username
    || `Telegram ${idString(user?.id)}`;
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || 'Telegram',
    last_name: parts.slice(1).join(' '),
  };
}

function randomDelay(minMs: number, maxMs: number) {
  const min = Math.max(0, minMs);
  const max = Math.max(min, maxMs);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function floodWaitSeconds(error: unknown) {
  const anyError = error as any;
  const direct = Number(anyError?.seconds ?? anyError?.value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/FLOOD_WAIT_?(\d+)|wait of (\d+) seconds/i);
  const parsed = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function withFloodWait<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const seconds = floodWaitSeconds(error);
    if (!seconds) throw error;
    const maxSeconds = Number(process.env.TELEGRAM_GROUP_SCRAPE_MAX_FLOOD_WAIT_SECONDS ?? 1800);
    if (seconds > maxSeconds) {
      throw new Error(`Telegram requested a ${seconds}s flood wait. Stopped to protect the account.`);
    }
    await sleep((seconds + 2) * 1000);
    return work();
  }
}

async function updateJob(context: WorkspaceContext, jobId: string, patch: Partial<TgGroupLeadScrapeJobRecord>) {
  if (!isSupabaseConfigured()) {
    const job = inMemoryJobs.find((item) => item.id === jobId && item.workspace_id === context.workspaceId);
    if (job) Object.assign(job, patch, { updated_at: nowIso() });
    return;
  }

  const supabase = getAdminSupabaseClient()!;
  const payload: Record<string, unknown> = { ...patch, updated_at: nowIso() };
  const { error } = await supabase
    .from('telegram_group_lead_scrape_jobs')
    .update(payload)
    .eq('workspace_id', context.workspaceId)
    .eq('id', jobId);
  if (error) throw error;
}

async function insertResult(context: WorkspaceContext, result: InsertableGroupLeadResult) {
  const normalized: Omit<TgGroupLeadResultRecord, 'id' | 'created_at'> = {
    ...result,
    company_name: result.company_name ?? null,
    company_confidence: result.company_confidence ?? null,
    company_reason: result.company_reason ?? null,
    ai_cleaned_at: result.ai_cleaned_at ?? null,
  };

  if (!isSupabaseConfigured()) {
    const existing = inMemoryResults.find((item) => item.job_id === normalized.job_id && item.telegram_user_id === normalized.telegram_user_id);
    if (existing) {
      Object.assign(existing, normalized);
      return existing;
    }
    const record: TgGroupLeadResultRecord = {
      ...normalized,
      id: demoId('tg-group-lead-result'),
      created_at: nowIso(),
    };
    inMemoryResults.push(record);
    return record;
  }

  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('telegram_group_lead_scrape_results')
    .upsert(normalized, { onConflict: 'job_id,telegram_user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return toResult(data);
}

export async function listGroupLeadScrapeJobs(context: WorkspaceContext) {
  if (!isSupabaseConfigured()) {
    return inMemoryJobs
      .filter((job) => job.workspace_id === context.workspaceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20);
  }

  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('telegram_group_lead_scrape_jobs')
    .select('*')
    .eq('workspace_id', context.workspaceId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map(toJob);
}

export async function getGroupLeadScrapeJob(context: WorkspaceContext, jobId: string) {
  if (!isSupabaseConfigured()) {
    return inMemoryJobs.find((job) => job.workspace_id === context.workspaceId && job.id === jobId) ?? null;
  }

  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('telegram_group_lead_scrape_jobs')
    .select('*')
    .eq('workspace_id', context.workspaceId)
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  return data ? toJob(data) : null;
}

export async function listGroupLeadResults(context: WorkspaceContext, jobId: string, limit = 10000) {
  if (!isSupabaseConfigured()) {
    return inMemoryResults
      .filter((result) => result.workspace_id === context.workspaceId && result.job_id === jobId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit);
  }

  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('telegram_group_lead_scrape_results')
    .select('*')
    .eq('workspace_id', context.workspaceId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toResult);
}

function outputTextFromResponse(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((content: any) => content?.text)
    .filter((text: unknown): text is string => typeof text === 'string')
    .join('\n');
}

function clampConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

async function resolveOpenAiApiKey(context: WorkspaceContext) {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) return envKey;
  return getWorkspaceSecret(context.workspaceId, 'OPENAI_API_KEY');
}

async function updateCleanedResults(context: WorkspaceContext, rows: Array<Pick<TgGroupLeadResultRecord, 'id' | 'company_name' | 'company_confidence' | 'company_reason' | 'ai_cleaned_at'>>) {
  if (!rows.length) return;

  if (!isSupabaseConfigured()) {
    for (const row of rows) {
      const existing = inMemoryResults.find((item) => item.id === row.id && item.workspace_id === context.workspaceId);
      if (existing) Object.assign(existing, row);
    }
    return;
  }

  const supabase = getAdminSupabaseClient()!;
  for (const row of rows) {
    const { error } = await supabase
      .from('telegram_group_lead_scrape_results')
      .update({
        company_name: row.company_name,
        company_confidence: row.company_confidence,
        company_reason: row.company_reason,
        ai_cleaned_at: row.ai_cleaned_at,
      })
      .eq('workspace_id', context.workspaceId)
      .eq('id', row.id);
    if (error) throw error;
  }
}

async function cleanCompanyBatch(apiKey: string, leads: Array<Pick<TgGroupLeadResultRecord, 'id' | 'name' | 'bio'>>) {
  const model = process.env.OPENAI_GROUP_LEAD_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-nano';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'none' },
      max_output_tokens: 5000,
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: [
                'You clean Telegram group scrape rows for a CRM.',
                'Use only the provided name and bio.',
                'Return a company only when the company, project, studio, agency, fund, DAO, or product is explicitly named.',
                'Do not infer from an industry, job title, interest, location, or username-like handle.',
                'If no company is explicit, return an empty company_name, confidence 0, and a short reason.',
                'Use confidence between 0 and 1.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                leads: leads.map((lead) => ({
                  id: lead.id,
                  name: lead.name,
                  bio: lead.bio || '',
                })),
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'telegram_group_lead_company_cleaning',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              leads: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    company_name: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    reason: { type: 'string' },
                  },
                  required: ['id', 'company_name', 'confidence', 'reason'],
                },
              },
            },
            required: ['leads'],
          },
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'OpenAI could not clean the scraped leads.';
    throw new Error(message);
  }

  const text = outputTextFromResponse(payload);
  if (!text) throw new Error('OpenAI returned an empty cleaning result.');
  const parsed = JSON.parse(text) as { leads?: Array<{ id: string; company_name: string; confidence: number; reason: string }> };
  return Array.isArray(parsed.leads) ? parsed.leads : [];
}

export async function cleanGroupLeadResultsWithAi(context: WorkspaceContext, input: unknown) {
  const parsed = tgGroupLeadCleanInputSchema.parse(input);
  const job = await getGroupLeadScrapeJob(context, parsed.job_id);
  if (!job) throw new Error('Scrape job not found.');

  const apiKey = await resolveOpenAiApiKey(context);
  if (!apiKey) {
    throw new Error('Add an OpenAI API key for this organization before running Auto-clean.');
  }

  const results = await listGroupLeadResults(context, parsed.job_id);
  const pending = results.filter((result) => !result.ai_cleaned_at);
  if (!pending.length) {
    return {
      cleaned: 0,
      withCompany: results.filter((result) => result.company_name).length,
      total: results.length,
    };
  }

  let cleaned = 0;
  const updatedRows: Array<Pick<TgGroupLeadResultRecord, 'id' | 'company_name' | 'company_confidence' | 'company_reason' | 'ai_cleaned_at'>> = [];
  const batchSize = 40;

  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    const cleanedBatch = await cleanCompanyBatch(apiKey, batch);
    const byId = new Map(cleanedBatch.map((item) => [item.id, item]));
    const cleanedAt = nowIso();

    const rows = batch.map((result) => {
      const item = byId.get(result.id);
      const company = String(item?.company_name ?? '').trim();
      return {
        id: result.id,
        company_name: company || null,
        company_confidence: company ? clampConfidence(item?.confidence) : 0,
        company_reason: String(item?.reason ?? '').trim() || null,
        ai_cleaned_at: cleanedAt,
      };
    });

    await updateCleanedResults(context, rows);
    updatedRows.push(...rows);
    cleaned += rows.length;

    if (index + batchSize < pending.length) {
      await sleep(250);
    }
  }

  const previouslyCleanedWithCompany = results.filter((result) => result.ai_cleaned_at && result.company_name).length;
  const newlyCleanedWithCompany = updatedRows.filter((row) => row.company_name).length;
  return {
    cleaned,
    withCompany: previouslyCleanedWithCompany + newlyCleanedWithCompany,
    total: results.length,
  };
}

export async function createGroupLeadScrapeJob(context: WorkspaceContext, input: unknown) {
  const parsed = tgGroupLeadScrapeInputSchema.parse(input);
  const createdAt = nowIso();

  if (!isSupabaseConfigured()) {
    const job: TgGroupLeadScrapeJobRecord = {
      id: demoId('tg-group-lead-job'),
      workspace_id: context.workspaceId,
      profile_id: context.profileId,
      account_id: parsed.account_id,
      group_ref: parsed.group_ref,
      group_title: null,
      mode: parsed.mode,
      status: 'queued',
      total_found: 0,
      processed_count: 0,
      saved_count: 0,
      error: null,
      started_at: null,
      completed_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    };
    inMemoryJobs.unshift(job);
    return { job, input: parsed };
  }

  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('telegram_group_lead_scrape_jobs')
    .insert({
      workspace_id: context.workspaceId,
      profile_id: context.profileId,
      account_id: parsed.account_id,
      group_ref: parsed.group_ref,
      mode: parsed.mode,
      status: 'queued',
    })
    .select('*')
    .single();
  if (error) throw error;
  return { job: toJob(data), input: parsed };
}

async function resolveGroupEntity(client: any, groupRef: string) {
  const clean = normalizeGroupRef(groupRef);
  const lower = clean.toLowerCase();
  const dialogs = await withFloodWait(() => client.getDialogs({ limit: 500 }));

  for (const dialog of dialogs as any[]) {
    const entity = dialog.entity;
    if (!entity) continue;
    const title = String(dialog.title ?? entity.title ?? '').trim();
    const username = String(entity.username ?? '').trim();
    const id = idString(entity.id);
    const matches = [
      title.toLowerCase(),
      username.toLowerCase(),
      id,
      `-100${id}`,
    ];
    if (matches.includes(lower) || matches.includes(clean)) {
      return { entity, title: title || username || clean };
    }
  }

  const entity = await withFloodWait(() => client.getEntity(clean));
  return {
    entity,
    title: String((entity as any)?.title ?? (entity as any)?.username ?? clean),
  };
}

async function downloadAvatarDataUrl(client: any, user: any) {
  if (!user?.photo) return null;
  try {
    const data = await withFloodWait(() => client.downloadProfilePhoto(user, { isBig: false }));
    if (!data || !Buffer.isBuffer(data) || data.length === 0) return null;
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

async function buildLeadResult(client: any, user: any, includeProfilePictures: boolean) {
  const telegramUserId = idString(user?.id);
  if (!telegramUserId || user?.bot || user?.deleted) return null;

  const full = await withFloodWait(async () => {
    try {
      return await client.invoke(new Api.users.GetFullUser({ id: user }));
    } catch {
      return null;
    }
  });
  const bio = String((full as any)?.fullUser?.about ?? '').trim() || null;
  const avatarDataUrl = includeProfilePictures ? await downloadAvatarDataUrl(client, user) : null;

  return {
    telegram_user_id: telegramUserId,
    name: displayName(user),
    username: user?.username ? normalizeTelegramUsername(String(user.username)) : null,
    bio,
    premium: Boolean(user?.premium),
    avatar_data_url: avatarDataUrl,
  };
}

async function saveUserResult(
  context: WorkspaceContext,
  jobId: string,
  client: any,
  user: any,
  seen: Set<string>,
  input: ScrapeInput,
) {
  const telegramUserId = idString(user?.id);
  if (!telegramUserId || seen.has(telegramUserId)) return false;
  seen.add(telegramUserId);

  const result = await buildLeadResult(client, user, input.include_profile_pictures);
  if (!result) return false;

  await insertResult(context, {
    workspace_id: context.workspaceId,
    job_id: jobId,
    ...result,
  });

  const count = seen.size;
  await updateJob(context, jobId, {
    total_found: count,
    processed_count: count,
  });

  await sleep(randomDelay(input.min_delay_ms, input.max_delay_ms));
  if (count % 25 === 0) {
    await sleep(randomDelay(10_000, 25_000));
  }
  return true;
}

async function scrapeParticipants(context: WorkspaceContext, jobId: string, client: any, entity: any, seen: Set<string>, input: ScrapeInput) {
  let count = 0;
  for await (const user of client.iterParticipants(entity, { limit: input.limit })) {
    await saveUserResult(context, jobId, client, user, seen, input);
    count = seen.size;
    if (count >= input.limit) break;
  }
  return count;
}

function extractMentionUsername(message: any, entity: any) {
  const text = String(message?.message ?? message?.text ?? '');
  if (!text || typeof entity?.offset !== 'number' || typeof entity?.length !== 'number') return null;
  return text.slice(entity.offset, entity.offset + entity.length).replace(/^@/, '').trim() || null;
}

async function scrapeMessageUsers(context: WorkspaceContext, jobId: string, client: any, entity: any, seen: Set<string>, input: ScrapeInput) {
  const messageLimit = Math.min(Math.max(input.limit * 20, input.limit), 50_000);
  for await (const message of client.iterMessages(entity, { limit: messageLimit })) {
    const sender = (message as any)?.sender;
    if (sender) await saveUserResult(context, jobId, client, sender, seen, input);

    const entities = ((message as any)?.entities ?? []) as any[];
    for (const item of entities) {
      let user: any = null;
      if (item instanceof Api.MessageEntityMentionName && item.userId) {
        user = await withFloodWait(() => client.getEntity(item.userId));
      } else if (item instanceof Api.MessageEntityMention) {
        const username = extractMentionUsername(message, item);
        if (username) {
          try {
            user = await withFloodWait(() => client.getEntity(username));
          } catch {
            user = null;
          }
        }
      }
      if (user) await saveUserResult(context, jobId, client, user, seen, input);
      if (seen.size >= input.limit) break;
    }
    if (seen.size >= input.limit) break;
    if (seen.size > 0 && seen.size % 50 === 0) {
      await sleep(randomDelay(5_000, 12_000));
    }
  }
  return seen.size;
}

async function runMockScrape(context: WorkspaceContext, jobId: string, input: ScrapeInput) {
  await updateJob(context, jobId, {
    status: 'running',
    group_title: 'Mock Telegram Group',
    started_at: nowIso(),
    error: null,
  });

  const mock = [
    { telegram_user_id: '10001', name: 'Aarav Mehta', username: 'aarav_growth', bio: 'Building GTM systems for Web3 teams.', premium: true },
    { telegram_user_id: '10002', name: 'Nina Rao', username: 'nina_ops', bio: 'Community and partnerships.', premium: false },
    { telegram_user_id: '10003', name: 'Sam Carter', username: 'samcarter', bio: 'Founder. Interested in Telegram workflows.', premium: true },
  ].slice(0, input.limit);

  for (const item of mock) {
    await insertResult(context, {
      workspace_id: context.workspaceId,
      job_id: jobId,
      avatar_data_url: null,
      ...item,
    });
    await updateJob(context, jobId, {
      total_found: mock.indexOf(item) + 1,
      processed_count: mock.indexOf(item) + 1,
    });
    await sleep(350);
  }

  await updateJob(context, jobId, {
    status: 'completed',
    total_found: mock.length,
    processed_count: mock.length,
    completed_at: nowIso(),
  });
}

export async function runGroupLeadScrapeJob(context: WorkspaceContext, jobId: string, input: ScrapeInput) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    const connector = await resolveTelegramConnectorMode(context);
    if (connector.mode === 'mock') {
      await runMockScrape(context, jobId, input);
      return;
    }

    const account = await getTgConsoleAccountPrivate(context, input.account_id);
    if (!account?.session_ciphertext || !account.is_authenticated) {
      throw new Error('Connect a Telegram account before scraping a group.');
    }

    const session = decryptSecret(account.session_ciphertext);
    if (!session) throw new Error('Saved Telegram session could not be decrypted.');

    const tgCreds = connector.credentials;
    if (!tgCreds) throw new Error('Telegram API ID/hash are not configured for this organization.');

    const proxy = decryptJson<TgConsoleProxyConfig>(account.proxy_config_ciphertext);
    const { client } = await buildTelegramClient({
      apiId: Number(tgCreds.apiId),
      apiHash: tgCreds.apiHash,
      session,
      proxy,
    });

    try {
      await updateJob(context, jobId, { status: 'running', started_at: nowIso(), error: null });
      await client.connect();
      const { entity, title } = await resolveGroupEntity(client, input.group_ref);
      await updateJob(context, jobId, { group_title: title });

      const seen = new Set<string>();
      const mode: TgGroupLeadScrapeMode = input.mode;
      if (mode === 'members' || mode === 'auto') {
        try {
          await scrapeParticipants(context, jobId, client, entity, seen, input);
        } catch (error) {
          if (mode === 'members') throw error;
        }
      }

      if ((mode === 'messages' || (mode === 'auto' && seen.size === 0)) && seen.size < input.limit) {
        await scrapeMessageUsers(context, jobId, client, entity, seen, input);
      }

      await updateJob(context, jobId, {
        status: 'completed',
        total_found: seen.size,
        processed_count: seen.size,
        completed_at: nowIso(),
      });

      await logActivity({
        workspaceId: context.workspaceId,
        profileId: context.profileId,
        event_type: 'telegram.group_leads.scraped',
        event_label: `Telegram group scrape completed: ${title}`,
        payload: { job_id: jobId, group_ref: input.group_ref, count: seen.size },
      });
    } finally {
      await client.disconnect();
    }
  } catch (error) {
    await updateJob(context, jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      completed_at: nowIso(),
    });
  } finally {
    runningJobs.delete(jobId);
  }
}

export async function listTelegramGroupOptions(context: WorkspaceContext, accountId: string): Promise<GroupOption[]> {
  const connector = await resolveTelegramConnectorMode(context);
  if (connector.mode === 'mock') {
    return [
      { id: 'mock-group-1', title: 'Mock Telegram Group', username: 'mock_group', ref: 'mock_group' },
    ];
  }

  const account = await getTgConsoleAccountPrivate(context, accountId);
  if (!account?.session_ciphertext || !account.is_authenticated) {
    throw new Error('Connect a Telegram account first.');
  }
  const session = decryptSecret(account.session_ciphertext);
  if (!session) throw new Error('Saved Telegram session could not be decrypted.');
  const tgCreds = connector.credentials;
  if (!tgCreds) throw new Error('Telegram API ID/hash are not configured for this organization.');
  const proxy = decryptJson<TgConsoleProxyConfig>(account.proxy_config_ciphertext);
  const { client } = await buildTelegramClient({ apiId: Number(tgCreds.apiId), apiHash: tgCreds.apiHash, session, proxy });

  try {
    await client.connect();
    const dialogs = await withFloodWait(() => client.getDialogs({ limit: 500 }));
    const groups: GroupOption[] = [];
    for (const dialog of dialogs as any[]) {
      const entity = dialog.entity;
      if (!entity) continue;
      const isGroup = entity.className === 'Chat' || (entity.className === 'Channel' && !entity.broadcast);
      if (!isGroup) continue;
      const username = entity.username ? String(entity.username) : null;
      const id = idString(entity.id);
      groups.push({
        id,
        title: String(dialog.title ?? entity.title ?? username ?? id),
        username,
        ref: username || id,
      });
      if (groups.length % 50 === 0) await sleep(500);
    }
    return groups;
  } finally {
    await client.disconnect();
  }
}

export async function saveGroupLeadResultsAsLeads(context: WorkspaceContext, input: unknown) {
  const parsed = tgGroupLeadSaveInputSchema.parse(input);
  const job = await getGroupLeadScrapeJob(context, parsed.job_id);
  if (!job) throw new Error('Scrape job not found.');

  const results = (await listGroupLeadResults(context, parsed.job_id))
    .filter((result) => result.username && result.company_name)
    .map((result) => ({ ...result, username: normalizeTelegramUsername(result.username || '') }))
    .filter((result) => result.username && result.company_name);
  const skipped = job.total_found > 0 ? Math.max(0, job.total_found - results.length) : 0;

  if (!results.length) {
    await updateJob(context, parsed.job_id, { saved_count: 0 });
    return { inserted: 0, updated: 0, skipped };
  }

  const tag = parsed.tag.trim();
  const source = `Telegram group: ${job.group_title || job.group_ref}`;

  if (!isSupabaseConfigured()) {
    let inserted = 0;
    let updated = 0;
    const { demoState } = await import('@/lib/server/demo-store');
    for (const result of results) {
      const existing = demoState.leads.find((lead) => (
        lead.workspace_id === context.workspaceId
        && lead.telegram_username.toLowerCase() === result.username!.toLowerCase()
      ));
      if (existing) {
        existing.tags = [...new Set([...existing.tags, tag])];
        if (!existing.notes && result.bio) existing.notes = result.bio;
        if (!existing.company_name && result.company_name) existing.company_name = result.company_name;
        if (!existing.profile_picture_url && result.avatar_data_url) existing.profile_picture_url = result.avatar_data_url;
        existing.telegram_exists = true;
        existing.telegram_checked_at = nowIso();
        updated += 1;
      } else {
        const names = splitName(result.name);
        demoState.leads.unshift({
          id: demoId('lead'),
          workspace_id: context.workspaceId,
          ...names,
          company_name: result.company_name || '',
          telegram_username: result.username!,
          tags: [tag],
          notes: result.bio,
          source,
          owner_id: null,
          created_at: nowIso(),
          profile_picture_url: result.avatar_data_url,
          telegram_exists: true,
          telegram_checked_at: nowIso(),
        });
        inserted += 1;
      }
    }
    await updateJob(context, parsed.job_id, { saved_count: inserted + updated });
    return { inserted, updated, skipped: results.length - inserted - updated + skipped };
  }

  const supabase = getAdminSupabaseClient()!;
  const usernames = results.map((result) => result.username!);
  const { data: existingRows, error: existingError } = await supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', context.workspaceId)
    .in('telegram_username', usernames);
  if (existingError) throw existingError;

  const existingByUsername = new Map(
    ((existingRows ?? []) as LeadRecord[]).map((lead) => [lead.telegram_username.toLowerCase(), lead]),
  );

  let inserted = 0;
  let updated = 0;
  const toInsert: Record<string, unknown>[] = [];

  for (const result of results) {
    const existing = existingByUsername.get(result.username!.toLowerCase());
    if (existing) {
      const { error } = await supabase
        .from('leads')
        .update({
          tags: [...new Set([...(existing.tags ?? []), tag])],
          company_name: existing.company_name || result.company_name || '',
          notes: existing.notes || result.bio || null,
          source: existing.source || source,
          profile_picture_url: existing.profile_picture_url || result.avatar_data_url || null,
          telegram_exists: true,
          telegram_checked_at: nowIso(),
        })
        .eq('workspace_id', context.workspaceId)
        .eq('id', existing.id);
      if (error) throw error;
      updated += 1;
    } else {
      const names = splitName(result.name);
      toInsert.push({
        workspace_id: context.workspaceId,
        created_by: context.profileId,
        ...names,
        company_name: result.company_name || '',
        telegram_username: result.username,
        tags: [tag],
        notes: result.bio,
        source,
        profile_picture_url: result.avatar_data_url,
        telegram_exists: true,
        telegram_checked_at: nowIso(),
      });
    }
  }

  if (toInsert.length) {
    const { error } = await supabase.from('leads').insert(toInsert);
    if (error) throw error;
    inserted = toInsert.length;
  }

  await updateJob(context, parsed.job_id, { saved_count: inserted + updated });
  await logActivity({
    workspaceId: context.workspaceId,
    profileId: context.profileId,
    event_type: 'telegram.group_leads.saved',
    event_label: `${inserted + updated} Telegram group leads saved`,
    payload: { job_id: parsed.job_id, inserted, updated, tag },
  });

  return { inserted, updated, skipped: results.length - inserted - updated + skipped };
}
