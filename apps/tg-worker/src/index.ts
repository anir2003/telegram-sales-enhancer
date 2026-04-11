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
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
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
  await supabase.from('activity_log').insert({
    workspace_id: input.workspaceId,
    event_type: input.eventType,
    event_label: input.eventLabel,
    payload: input.payload,
  });
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
  const { data, error } = await supabase
    .from('telegram_send_approvals')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw error;

  const claimed: SendApprovalRow[] = [];
  for (const approval of (data ?? []) as SendApprovalRow[]) {
    const { data: updated } = await supabase
      .from('telegram_send_approvals')
      .update({ status: 'sending', updated_at: nowIso() })
      .eq('id', approval.id)
      .eq('status', 'approved')
      .select('*')
      .maybeSingle();
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
  try {
    await client.connect();
    const entity = dialog
      ? await resolveDialogEntity(client, dialog)
      : await client.getEntity(target!.replace(/^@/, ''));
    const sent = await client.sendMessage(entity, { message: approval.message_text });
    const sentAt = toIsoFromTelegramDate((sent as any)?.date);
    await supabase
      .from('telegram_send_approvals')
      .update({
        status: 'sent',
        delivery_result: { telegram_message_id: String((sent as any)?.id ?? ''), delivered_at: sentAt },
        updated_at: nowIso(),
      })
      .eq('id', approval.id);
    if (dialog) {
      await supabase
        .from('telegram_dialogs')
        .update({
          last_message_at: sentAt,
          last_message_preview: getPreview({ message: approval.message_text }),
          unread_count: 0,
          is_unread: false,
          is_replied: true,
          updated_at: nowIso(),
        })
        .eq('id', dialog.id);
      await supabase
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
          metadata: { delivery: 'worker' },
        }, { onConflict: 'dialog_id,telegram_message_id' });
    }
    await logActivity({
      workspaceId: approval.workspace_id,
      eventType: 'telegram.send.delivered',
      eventLabel: 'Telegram approved send delivered',
      payload: { approval_id: approval.id, account_id: approval.account_id, target },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from('telegram_send_approvals')
      .update({
        status: 'failed',
        delivery_result: { error: message, failed_at: nowIso() },
        updated_at: nowIso(),
      })
      .eq('id', approval.id);
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
  const accounts = await listAuthenticatedAccounts();
  for (const account of accounts) {
    try {
      await syncAccount(account);
    } catch (error) {
      console.error(`[tg-worker] sync failed for ${account.id}`, error);
    }
  }

  const approvedSends = await claimApprovedSends();
  for (const approval of approvedSends) {
    await deliverApprovedSend(approval);
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
