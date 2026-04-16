import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bigInt from 'big-integer';
import { Api } from 'telegram';
import type { TgConsoleProxyConfig } from '@telegram-enhancer/shared';
import { decryptJson, decryptSecret } from './crypto.js';
import { resolveWorkspaceTgCredentials } from './credentials.js';
import { createTelegramClient } from './telegram.js';

const workerDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(workerDir, '../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'apps/web/.env') });
dotenv.config();

type ConnectedAccountRow = {
  id: string;
  workspace_id: string;
  phone: string;
  display_name: string | null;
  session_ciphertext: string | null;
  proxy_config_ciphertext: string | null;
  is_authenticated: boolean;
};

type DialogRow = {
  id: string;
  workspace_id: string;
  account_id: string;
  telegram_dialog_id: string;
  title: string;
  username: string | null;
  folder_id?: number | null;
  folder_name?: string | null;
  crm_folder?: string;
  tags?: string[];
  notes?: string | null;
  avatar_url?: string | null;
};

type SendApprovalRow = {
  id: string;
  workspace_id: string;
  account_id: string;
  dialog_id: string | null;
  target_username: string | null;
  message_text: string;
  status: string;
  scheduled_for: string | null;
  media_name: string | null;
  media_mime_type: string | null;
  media_size: number | null;
  media_base64: string | null;
  approved_at: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const transientHttpStatuses = new Set([408, 425, 429, 500, 502, 503, 504, 522, 523, 524]);
const transientErrorPatterns = [
  'terminated',
  'UND_ERR_SOCKET',
  'other side closed',
  'bad gateway',
  'cloudflare',
  '<!DOCTYPE html>',
  'fetch failed',
  'Supabase HTTP',
  'ECONNRESET',
  'ETIMEDOUT',
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error: unknown) {
  const text = [
    error instanceof Error ? error.message : String(error),
    (error as any)?.details,
    (error as any)?.hint,
    (error as any)?.code,
  ].filter(Boolean).join('\n');
  return transientErrorPatterns.some((pattern) => text.toLowerCase().includes(pattern.toLowerCase()));
}

function sanitizedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const details = String((error as any)?.details ?? '');
  const code = String((error as any)?.code ?? '');

  if (message.includes('<!DOCTYPE html>') || details.includes('<!DOCTYPE html>') || /bad gateway/i.test(message + details)) {
    return {
      message: 'Supabase returned a transient Cloudflare 502 Bad Gateway response.',
      code: code || 'TRANSIENT_SUPABASE_502',
    };
  }

  if (isTransientError(error)) {
    return {
      message,
      code: code || 'TRANSIENT_NETWORK',
    };
  }

  return {
    message,
    details: details || undefined,
    code: code || undefined,
  };
}

async function withTransientRetry<T>(operation: () => PromiseLike<T> | Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientError(error)) {
        throw error;
      }
      await wait(500 * attempt + Math.random() * 400);
    }
  }
  throw lastError;
}

async function resilientFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  return withTransientRetry(async () => {
    const response = await fetch(input, init);
    if (transientHttpStatuses.has(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Supabase HTTP ${response.status}`);
    }
    return response;
  }, 3);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: resilientFetch },
});

function nowIso() {
  return new Date().toISOString();
}

function toIsoFromTelegramDate(value: unknown) {
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return nowIso();
}

function getEntityId(entity: any) {
  return String(entity?.id ?? entity?.userId ?? entity?.channelId ?? entity?.chatId ?? 'unknown');
}

function getEntityKind(entity: any) {
  if (entity?.bot) return 'bot';
  if (entity?.className === 'User') return 'user';
  if (entity?.className === 'Chat') return 'group';
  if (entity?.className === 'Channel') return entity?.broadcast ? 'channel' : 'group';
  return 'unknown';
}

function getEntityTitle(entity: any) {
  const fullName = [entity?.firstName, entity?.lastName].filter(Boolean).join(' ').trim();
  return entity?.title || fullName || entity?.username || `Telegram ${getEntityId(entity)}`;
}

function getPreview(message: any) {
  const text = typeof message?.message === 'string' ? message.message : '';
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function parseDialogPeer(dialog: Pick<DialogRow, 'telegram_dialog_id'>) {
  const [kind, rawId] = dialog.telegram_dialog_id.split(':');
  if (!kind || !rawId) return null;

  try {
    const id = bigInt(rawId);
    if (kind === 'user' || kind === 'bot') {
      return new Api.PeerUser({ userId: id });
    }
    if (kind === 'group') {
      return new Api.PeerChat({ chatId: id });
    }
    if (kind === 'channel') {
      return new Api.PeerChannel({ channelId: id });
    }
  } catch {
    return null;
  }

  return null;
}

function naturalTypingDurationMs(text: string, hasMedia = false) {
  if (process.env.TELEGRAM_NATURAL_TYPING === 'false') return 0;
  const maxMs = Number(process.env.TELEGRAM_NATURAL_TYPING_MAX_MS || 8500);
  const minMs = hasMedia ? 1200 : 700;
  const perCharacterMs = 35 + Math.random() * 65;
  return Math.min(Math.max(minMs, Math.round(text.length * perCharacterMs)), Number.isFinite(maxMs) ? maxMs : 8500);
}

async function emitNaturalTyping(client: any, entity: any, text: string, hasMedia = false) {
  const durationMs = naturalTypingDurationMs(text, hasMedia);
  if (!durationMs) return;

  const startedAt = Date.now();
  while (Date.now() - startedAt < durationMs) {
    try {
      await client.invoke(new Api.messages.SetTyping({
        peer: entity,
        action: new Api.SendMessageTypingAction(),
      }));
    } catch {
      return;
    }
    await wait(900 + Math.random() * 1300);
  }
}

function buildApprovalMedia(approval: SendApprovalRow) {
  if (!approval.media_base64 || !approval.media_name || !approval.media_size) return null;
  return {
    name: approval.media_name,
    type: approval.media_mime_type,
    size: approval.media_size,
    buffer: Buffer.from(approval.media_base64, 'base64'),
  };
}

function buildMediaMetadata(media: ReturnType<typeof buildApprovalMedia>) {
  if (!media) return {};
  return {
    media: true,
    file_name: media.name,
    mime_type: media.type || null,
    file_size: media.size,
  };
}

async function resolveDialogEntity(client: any, dialog: DialogRow) {
  if (dialog.username) {
    return client.getEntity(dialog.username.replace(/^@/, ''));
  }

  const peer = parseDialogPeer(dialog);
  if (!peer) {
    throw new Error(`Approved send has no resolvable peer for dialog ${dialog.id}.`);
  }
  return client.getInputEntity(peer);
}

async function logActivity(input: {
  workspaceId: string;
  eventType: string;
  eventLabel: string;
  payload: Record<string, unknown>;
}) {
  await withTransientRetry(() => supabase.from('activity_log').insert({
    workspace_id: input.workspaceId,
    event_type: input.eventType,
    event_label: input.eventLabel,
    payload: input.payload,
  }).then(({ error }) => {
    if (error) throw error;
  }));
}

async function listAuthenticatedAccounts() {
  const { data, error } = await supabase
    .from('telegram_connected_accounts')
    .select('*')
    .eq('is_authenticated', true)
    .eq('status', 'authenticated')
    .not('session_ciphertext', 'is', null)
    .limit(100);
  if (error) throw error;
  return (data ?? []) as ConnectedAccountRow[];
}

async function syncAccount(account: ConnectedAccountRow) {
  const session = decryptSecret(account.session_ciphertext);
  if (!session) return;
  const proxy = decryptJson<TgConsoleProxyConfig>(account.proxy_config_ciphertext);
  const { apiId, apiHash } = await resolveWorkspaceTgCredentials(supabase, account.workspace_id);
  const client = createTelegramClient(session, Number(apiId), apiHash, proxy);

  try {
    await client.connect();
    const dialogs = await client.getDialogs({ limit: 50 });
    const { data: existingDialogs, error: existingDialogsError } = await supabase
      .from('telegram_dialogs')
      .select('telegram_dialog_id, crm_folder, tags, notes, avatar_url')
      .eq('workspace_id', account.workspace_id)
      .eq('account_id', account.id);
    if (existingDialogsError) throw existingDialogsError;
    const existingByTelegramId = new Map(
      ((existingDialogs ?? []) as DialogRow[]).map((dialog) => [dialog.telegram_dialog_id, dialog]),
    );

    for (const dialog of dialogs as any[]) {
      const entity = dialog.entity;
      if (!entity) continue;
      const lastMessage = dialog.message;
      const kind = getEntityKind(entity);
      const telegramDialogId = `${kind}:${getEntityId(entity)}`;
      const existing = existingByTelegramId.get(telegramDialogId);
      const { data: storedDialog, error: dialogError } = await supabase
        .from('telegram_dialogs')
        .upsert({
          workspace_id: account.workspace_id,
          account_id: account.id,
          telegram_dialog_id: telegramDialogId,
          kind,
          title: getEntityTitle(entity),
          username: entity.username ?? null,
          folder_id: typeof dialog.folderId === 'number' ? dialog.folderId : null,
          folder_name: typeof dialog.folderId === 'number' ? `Telegram Folder ${dialog.folderId}` : 'All Inboxes',
          crm_folder: existing?.crm_folder ?? (Number(dialog.unreadCount ?? 0) > 0 ? 'My Inbox' : 'All Inboxes'),
          unread_count: Number(dialog.unreadCount ?? 0),
          is_unread: Number(dialog.unreadCount ?? 0) > 0,
          is_replied: Boolean(lastMessage?.out),
          last_message_at: lastMessage?.date ? toIsoFromTelegramDate(lastMessage.date) : null,
          last_message_preview: lastMessage ? getPreview(lastMessage) : null,
          tags: existing?.tags ?? [],
          notes: existing?.notes ?? null,
          avatar_url: existing?.avatar_url ?? null,
          updated_at: nowIso(),
        }, { onConflict: 'account_id,telegram_dialog_id' })
        .select('*')
        .single();
      if (dialogError) throw dialogError;

      const { data: existingMessages, error: existingMessagesError } = await supabase
        .from('telegram_messages')
        .select('telegram_message_id, metadata')
        .eq('workspace_id', account.workspace_id)
        .eq('dialog_id', storedDialog.id);
      if (existingMessagesError) throw existingMessagesError;
      const existingMessageMetadata = new Map(
        ((existingMessages ?? []) as Array<{ telegram_message_id: string; metadata: Record<string, unknown> | null }>).map((message) => [message.telegram_message_id, message.metadata ?? {}]),
      );

      const messages = await client.getMessages(entity, { limit: 30 });
      const rows = (messages as any[]).reverse().map((message) => ({
        workspace_id: account.workspace_id,
        account_id: account.id,
        dialog_id: storedDialog.id,
        telegram_message_id: String(message.id),
        sender_name: message.out ? account.display_name : getEntityTitle(entity),
        is_outbound: Boolean(message.out),
        text: typeof message.message === 'string' ? message.message : '',
        sent_at: toIsoFromTelegramDate(message.date),
        metadata: {
          ...(existingMessageMetadata.get(String(message.id)) ?? {}),
          grouped_id: message.groupedId ? String(message.groupedId) : null,
          media: Boolean(message.media),
          unread: Boolean(message.unread),
          delivery_status: message.out ? 'sent' : null,
        },
      }));
      if (rows.length) {
        const { error: messageError } = await supabase
          .from('telegram_messages')
          .upsert(rows, { onConflict: 'dialog_id,telegram_message_id' });
        if (messageError) throw messageError;
      }
    }

    await supabase
      .from('telegram_connected_accounts')
      .update({ last_sync_at: nowIso(), last_inbox_update_at: nowIso(), updated_at: nowIso() })
      .eq('id', account.id);
    await logActivity({
      workspaceId: account.workspace_id,
      eventType: 'telegram.sync.completed',
      eventLabel: `Telegram worker synced ${account.phone}`,
      payload: { account_id: account.id, dialogs: (dialogs as unknown[]).length },
    });
  } finally {
    await client.disconnect();
  }
}

async function claimApprovedSends() {
  const dueAt = nowIso();
  const [approvedResult, scheduledResult] = await Promise.all([
    withTransientRetry<any>(() => supabase
      .from('telegram_send_approvals')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .limit(20)),
    withTransientRetry<any>(() => supabase
      .from('telegram_send_approvals')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', dueAt)
      .order('scheduled_for', { ascending: true })
      .limit(20)),
  ]);

  if (approvedResult.error) throw approvedResult.error;
  if (scheduledResult.error) throw scheduledResult.error;

  const claimed: SendApprovalRow[] = [];
  const dueApprovals = [
    ...((approvedResult.data ?? []) as SendApprovalRow[]),
    ...((scheduledResult.data ?? []) as SendApprovalRow[]),
  ].sort((a, b) => {
    const aDate = a.scheduled_for ?? '';
    const bDate = b.scheduled_for ?? '';
    if (aDate === bDate) return a.id.localeCompare(b.id);
    if (!aDate) return -1;
    if (!bDate) return 1;
    return aDate.localeCompare(bDate);
  }).slice(0, 20);

  for (const approval of dueApprovals) {
    const { data: updated, error } = await withTransientRetry<any>(() => supabase
      .from('telegram_send_approvals')
      .update({
        status: 'sending',
        approved_at: approval.approved_at ?? nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', approval.id)
      .eq('status', approval.status)
      .select('*')
      .maybeSingle());
    if (error) throw error;
    if (updated) claimed.push(updated as SendApprovalRow);
  }
  return claimed;
}

async function getDialog(dialogId: string) {
  const { data, error } = await supabase
    .from('telegram_dialogs')
    .select('*')
    .eq('id', dialogId)
    .maybeSingle();
  if (error) throw error;
  return data as DialogRow | null;
}

async function getAccount(accountId: string) {
  const { data, error } = await supabase
    .from('telegram_connected_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw error;
  return data as ConnectedAccountRow | null;
}

async function deliverApprovedSend(approval: SendApprovalRow) {
  const account = await getAccount(approval.account_id);
  if (!account?.session_ciphertext) throw new Error('Approved send account has no session.');
  const session = decryptSecret(account.session_ciphertext);
  if (!session) throw new Error('Approved send account has no decrypted session.');

  const dialog = approval.dialog_id ? await getDialog(approval.dialog_id) : null;
  const target = approval.target_username || dialog?.username;
  if (!target) {
    if (!dialog) {
      throw new Error('Approved send has no resolvable target.');
    }
  }

  const proxy = decryptJson<TgConsoleProxyConfig>(account.proxy_config_ciphertext);
  const { apiId, apiHash } = await resolveWorkspaceTgCredentials(supabase, account.workspace_id);
  const client = createTelegramClient(session, Number(apiId), apiHash, proxy);
  let deliveredToTelegram = false;
  let deliveredMessageId = '';
  let deliveredAt = '';
  let deliveredHadMedia = false;
  try {
    await client.connect();
    const entity = dialog
      ? await resolveDialogEntity(client, dialog)
      : await client.getEntity(target!.replace(/^@/, ''));
    const media = buildApprovalMedia(approval);
    deliveredHadMedia = Boolean(media);
    await emitNaturalTyping(client, entity, approval.message_text, Boolean(media));

    let sent: any;
    if (media) {
      const { CustomFile } = await import('telegram/client/uploads.js');
      const telegramFile = new CustomFile(media.name, media.size, '', media.buffer);
      sent = await client.sendFile(entity, {
        file: telegramFile,
        caption: approval.message_text || undefined,
        forceDocument: !(media.type?.startsWith('image/') || media.type?.startsWith('video/')),
        workers: 2,
      });
    } else {
      sent = await client.sendMessage(entity, { message: approval.message_text });
    }
    const sentAt = toIsoFromTelegramDate((sent as any)?.date);
    deliveredToTelegram = true;
    deliveredMessageId = String((sent as any)?.id ?? '');
    deliveredAt = sentAt;
    const updateResult = await withTransientRetry<any>(() => supabase
      .from('telegram_send_approvals')
      .update({
        status: 'sent',
        delivery_result: {
          telegram_message_id: String((sent as any)?.id ?? ''),
          delivered_at: sentAt,
          scheduled_for: approval.scheduled_for ?? null,
          media: Boolean(media),
          natural_typing: process.env.TELEGRAM_NATURAL_TYPING !== 'false',
        },
        updated_at: nowIso(),
      })
      .eq('id', approval.id));
    if (updateResult.error) throw updateResult.error;
    if (dialog) {
      const dialogUpdate = await withTransientRetry<any>(() => supabase
        .from('telegram_dialogs')
        .update({
          last_message_at: sentAt,
          last_message_preview: getPreview({ message: approval.message_text }),
          unread_count: 0,
          is_unread: false,
          is_replied: true,
          updated_at: nowIso(),
        })
        .eq('id', dialog.id));
      if (dialogUpdate.error) {
        console.error('[tg-worker] sent message but dialog mirror update failed', sanitizedError(dialogUpdate.error));
      }
      const messageUpsert = await withTransientRetry<any>(() => supabase
        .from('telegram_messages')
        .upsert({
          workspace_id: approval.workspace_id,
          account_id: approval.account_id,
          dialog_id: dialog.id,
          telegram_message_id: String((sent as any)?.id ?? ''),
          sender_name: account.display_name,
          is_outbound: true,
          text: approval.message_text,
          sent_at: sentAt,
          metadata: {
            delivery: 'worker',
            delivery_status: 'sent',
            unread: true,
            scheduled_for: approval.scheduled_for ?? null,
            ...buildMediaMetadata(media),
          },
        }, { onConflict: 'dialog_id,telegram_message_id' }));
      if (messageUpsert.error) {
        console.error('[tg-worker] sent message but message mirror upsert failed', sanitizedError(messageUpsert.error));
      }
    }
    await logActivity({
      workspaceId: approval.workspace_id,
      eventType: 'telegram.send.delivered',
      eventLabel: 'Telegram approved send delivered',
      payload: {
        approval_id: approval.id,
        account_id: approval.account_id,
        target,
        scheduled_for: approval.scheduled_for ?? null,
        media: Boolean(media),
      },
    }).catch((activityError) => {
      console.error('[tg-worker] sent message but activity log failed', sanitizedError(activityError));
    });
  } catch (error) {
    if (deliveredToTelegram) {
      console.error(`[tg-worker] send delivered but persistence failed for ${approval.id}`, sanitizedError(error));
      const sentRepair = await withTransientRetry<any>(() => supabase
        .from('telegram_send_approvals')
        .update({
          status: 'sent',
          delivery_result: {
            telegram_message_id: deliveredMessageId,
            delivered_at: deliveredAt || nowIso(),
            scheduled_for: approval.scheduled_for ?? null,
            media: deliveredHadMedia,
            persistence_warning: sanitizedError(error),
          },
          updated_at: nowIso(),
        })
        .eq('id', approval.id)).catch((repairError) => {
        console.error('[tg-worker] could not repair sent status after persistence failure', sanitizedError(repairError));
        return null;
      });
      if (sentRepair?.error) {
        console.error('[tg-worker] could not repair sent status after persistence failure', sanitizedError(sentRepair.error));
      }
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const failUpdate = await withTransientRetry<any>(() => supabase
      .from('telegram_send_approvals')
      .update({
        status: 'failed',
        delivery_result: { error: message, failed_at: nowIso() },
        updated_at: nowIso(),
      })
      .eq('id', approval.id));
    if (failUpdate.error) console.error('[tg-worker] failed to mark send as failed', sanitizedError(failUpdate.error));
    await logActivity({
      workspaceId: approval.workspace_id,
      eventType: 'telegram.send.failed',
      eventLabel: 'Telegram approved send failed',
      payload: { approval_id: approval.id, account_id: approval.account_id, error: message },
    });
  } finally {
    await client.disconnect();
  }
}

async function tick() {
  const accounts = await withTransientRetry(listAuthenticatedAccounts);
  for (const account of accounts) {
    try {
      await withTransientRetry(() => syncAccount(account), 2);
    } catch (error) {
      console.error(`[tg-worker] sync failed for ${account.id}`, sanitizedError(error));
    }
  }

  const approvedSends = await withTransientRetry(claimApprovedSends);
  for (const approval of approvedSends) {
    try {
      await deliverApprovedSend(approval);
    } catch (error) {
      console.error(`[tg-worker] send failed for ${approval.id}`, sanitizedError(error));
    }
  }
}

const configuredInterval = Number(process.env.TELEGRAM_WORKER_INTERVAL_MS ?? 15000);
const intervalMs = Number.isFinite(configuredInterval)
  ? Math.min(Math.max(configuredInterval, 5000), 15000)
  : 15000;

await tick();

if (process.env.TELEGRAM_WORKER_RUN_ONCE !== 'true') {
  setInterval(() => {
    void tick().catch((error) => console.error('[tg-worker] tick failed', error));
  }, intervalMs);
}
