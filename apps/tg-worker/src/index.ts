import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { TgConsoleProxyConfig } from '@telegram-enhancer/shared';
import { decryptJson, decryptSecret } from './crypto.js';
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
  const client = createTelegramClient(session, proxy);

  try {
    await client.connect();
    const dialogs = await client.getDialogs({ limit: 50 });

    for (const dialog of dialogs as any[]) {
      const entity = dialog.entity;
      if (!entity) continue;
      const lastMessage = dialog.message;
      const kind = getEntityKind(entity);
      const telegramDialogId = `${kind}:${getEntityId(entity)}`;
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
          crm_folder: Number(dialog.unreadCount ?? 0) > 0 ? 'My Inbox' : 'All Inboxes',
          unread_count: Number(dialog.unreadCount ?? 0),
          is_unread: Number(dialog.unreadCount ?? 0) > 0,
          is_replied: Boolean(lastMessage?.out),
          last_message_at: lastMessage?.date ? toIsoFromTelegramDate(lastMessage.date) : null,
          last_message_preview: lastMessage ? getPreview(lastMessage) : null,
          updated_at: nowIso(),
        }, { onConflict: 'account_id,telegram_dialog_id' })
        .select('*')
        .single();
      if (dialogError) throw dialogError;

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
          grouped_id: message.groupedId ? String(message.groupedId) : null,
          media: Boolean(message.media),
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
    throw new Error('Approved send has no resolvable username target.');
  }

  const proxy = decryptJson<TgConsoleProxyConfig>(account.proxy_config_ciphertext);
  const client = createTelegramClient(session, proxy);
  try {
    await client.connect();
    const entity = await client.getEntity(target.replace(/^@/, ''));
    const sent = await client.sendMessage(entity, { message: approval.message_text });
    await supabase
      .from('telegram_send_approvals')
      .update({
        status: 'sent',
        delivery_result: { telegram_message_id: String((sent as any)?.id ?? ''), delivered_at: nowIso() },
        updated_at: nowIso(),
      })
      .eq('id', approval.id);
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

const intervalMs = Number(process.env.TELEGRAM_WORKER_INTERVAL_MS ?? 60000);

await tick();

if (process.env.TELEGRAM_WORKER_RUN_ONCE !== 'true') {
  setInterval(() => {
    void tick().catch((error) => console.error('[tg-worker] tick failed', error));
  }, intervalMs);
}
