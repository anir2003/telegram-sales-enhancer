import { Api } from 'telegram';
import bigInt from 'big-integer';
import type { TgConsoleDialogRecord, TgConsoleProxyConfig, TgSendApprovalRecord } from '@telegram-enhancer/shared';
import { isSupabaseConfigured, isTelegramMockAdapter } from '@/lib/env';
import {
  getTgConsoleAccountPrivate,
  getTgConsoleDialog,
  logActivity,
  upsertTgConsoleDialog,
  upsertTgConsoleMessages,
} from '@/lib/server/repository';
import { buildTelegramClient } from '@/lib/server/tg-console/client';
import { decryptJson, decryptSecret } from '@/lib/server/tg-console/crypto';
import { resolveWorkspaceTgCredentials } from '@/lib/server/tg-console/credentials';
import { getAdminSupabaseClient } from '@/lib/supabase/server';

type WorkspaceContext = {
  workspaceId: string;
  profileId: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function toIsoFromTelegramDate(value: unknown) {
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return nowIso();
}

function previewText(text: string) {
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function parseDialogPeer(dialog: Pick<TgConsoleDialogRecord, 'telegram_dialog_id'>) {
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

async function resolveDialogEntity(client: any, dialog: TgConsoleDialogRecord) {
  if (dialog.username) {
    return client.getInputEntity(dialog.username.replace(/^@/, ''));
  }

  const peer = parseDialogPeer(dialog);
  if (!peer) {
    throw new Error(`Dialog ${dialog.id} cannot be resolved for sending.`);
  }
  return client.getInputEntity(peer);
}

async function persistApprovalResult(
  context: WorkspaceContext,
  approval: TgSendApprovalRecord,
  patch: Partial<TgSendApprovalRecord>,
) {
  const updatedAt = nowIso();
  if (!isSupabaseConfigured()) {
    return {
      ...approval,
      ...patch,
      updated_at: updatedAt,
    } as TgSendApprovalRecord;
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_send_approvals')
    .update({
      ...patch,
      updated_at: updatedAt,
    })
    .eq('workspace_id', context.workspaceId)
    .eq('id', approval.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as TgSendApprovalRecord;
}

async function mirrorOutboundMessage(input: {
  context: WorkspaceContext;
  dialog: TgConsoleDialogRecord | null;
  accountId: string;
  accountLabel: string | null;
  messageId: string;
  messageText: string;
  sentAt: string;
  metadata?: Record<string, unknown>;
}) {
  if (!input.dialog) return;

  await upsertTgConsoleDialog(input.context, {
    id: input.dialog.id,
    account_id: input.dialog.account_id,
    telegram_dialog_id: input.dialog.telegram_dialog_id,
    kind: input.dialog.kind,
    title: input.dialog.title,
    username: input.dialog.username,
    folder_id: input.dialog.folder_id,
    folder_name: input.dialog.folder_name,
    crm_folder: input.dialog.crm_folder,
    unread_count: 0,
    is_unread: false,
    is_replied: true,
    last_message_at: input.sentAt,
    last_message_preview: previewText(input.messageText),
    tags: input.dialog.tags,
    notes: input.dialog.notes,
    avatar_url: input.dialog.avatar_url,
  });

  await upsertTgConsoleMessages(input.context, [{
    account_id: input.accountId,
    dialog_id: input.dialog.id,
    telegram_message_id: input.messageId,
    sender_name: input.accountLabel || 'You',
    is_outbound: true,
    text: input.messageText,
    sent_at: input.sentAt,
    metadata: {
      delivery: 'direct',
      ...(input.metadata ?? {}),
    },
  }]);
}

async function deliverOneApproval(
  context: WorkspaceContext,
  approval: TgSendApprovalRecord,
  client: any,
  accountLabel: string | null,
) {
  const dialog = approval.dialog_id ? await getTgConsoleDialog(context, approval.dialog_id) : null;
  const target = approval.target_username || dialog?.username || null;

  try {
    const entity = dialog
      ? await resolveDialogEntity(client, dialog)
      : await client.getEntity(target!.replace(/^@/, ''));
    const sent = await client.sendMessage(entity, { message: approval.message_text });
    const sentAt = toIsoFromTelegramDate((sent as any)?.date);
    const delivered = await persistApprovalResult(context, approval, {
      status: 'sent',
      delivery_result: {
        telegram_message_id: String((sent as any)?.id ?? ''),
        delivered_at: sentAt,
        direct: true,
      },
    });

    await mirrorOutboundMessage({
      context,
      dialog,
      accountId: approval.account_id,
      accountLabel,
      messageId: String((sent as any)?.id ?? `local-${Date.now()}`),
      messageText: approval.message_text,
      sentAt,
    });

    await logActivity({
      workspaceId: context.workspaceId,
      profileId: context.profileId,
      event_type: 'telegram.send.delivered',
      event_label: 'Telegram direct send delivered',
      payload: {
        approval_id: approval.id,
        account_id: approval.account_id,
        target: target ?? dialog?.telegram_dialog_id ?? null,
      },
    });

    return delivered;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await persistApprovalResult(context, approval, {
      status: 'failed',
      delivery_result: {
        error: message,
        failed_at: nowIso(),
        direct: true,
      },
    });

    await logActivity({
      workspaceId: context.workspaceId,
      profileId: context.profileId,
      event_type: 'telegram.send.failed',
      event_label: 'Telegram direct send failed',
      payload: {
        approval_id: approval.id,
        account_id: approval.account_id,
        error: message,
      },
    });

    return failed;
  }
}

export async function dispatchTgSendApprovalsNow(
  context: WorkspaceContext,
  approvals: TgSendApprovalRecord[],
) {
  const grouped = new Map<string, TgSendApprovalRecord[]>();
  for (const approval of approvals) {
    const existing = grouped.get(approval.account_id) ?? [];
    existing.push(approval);
    grouped.set(approval.account_id, existing);
  }

  const delivered: TgSendApprovalRecord[] = [];

  for (const [accountId, accountApprovals] of grouped) {
    const account = await getTgConsoleAccountPrivate(context, accountId);
    if (!account?.is_authenticated) {
      for (const approval of accountApprovals) {
        delivered.push(await persistApprovalResult(context, approval, {
          status: 'failed',
          delivery_result: { error: 'Telegram account is not authenticated.', failed_at: nowIso(), direct: true },
        }));
      }
      continue;
    }

    const session = decryptSecret(account.session_ciphertext);
    if (!session) {
      for (const approval of accountApprovals) {
        delivered.push(await persistApprovalResult(context, approval, {
          status: 'failed',
          delivery_result: { error: 'Encrypted Telegram session is missing.', failed_at: nowIso(), direct: true },
        }));
      }
      continue;
    }

    if (isTelegramMockAdapter() || session.startsWith('mock-session:')) {
      for (const approval of accountApprovals) {
        const dialog = approval.dialog_id ? await getTgConsoleDialog(context, approval.dialog_id) : null;
        const sentAt = nowIso();
        const deliveredApproval = await persistApprovalResult(context, approval, {
          status: 'sent',
          delivery_result: { telegram_message_id: `mock-${Date.now()}`, delivered_at: sentAt, direct: true, mock: true },
        });
        await mirrorOutboundMessage({
          context,
          dialog,
          accountId: approval.account_id,
          accountLabel: account.display_name,
          messageId: `mock-${Date.now()}`,
          messageText: approval.message_text,
          sentAt,
        });
        delivered.push(deliveredApproval);
      }
      continue;
    }

    const tgCreds = await resolveWorkspaceTgCredentials(context);
    if (!tgCreds) {
      throw new Error('Telegram app credentials are not configured for this workspace.');
    }

    const proxy = decryptJson<TgConsoleProxyConfig>(account.proxy_config_ciphertext);
    const { client } = await buildTelegramClient({
      apiId: Number(tgCreds.apiId),
      apiHash: tgCreds.apiHash,
      session,
      proxy,
    });

    try {
      await client.connect();
      for (const approval of accountApprovals) {
        delivered.push(await deliverOneApproval(context, approval, client, account.display_name));
      }
    } finally {
      await client.disconnect();
    }
  }

  return delivered;
}

export async function sendTgDialogReaction(input: {
  context: WorkspaceContext;
  dialogId: string;
  telegramMessageId: string;
  emoji: string;
}) {
  const dialog = await getTgConsoleDialog(input.context, input.dialogId);
  if (!dialog) {
    throw new Error('Dialog not found.');
  }

  const account = await getTgConsoleAccountPrivate(input.context, dialog.account_id);
  if (!account?.is_authenticated) {
    throw new Error('Telegram account is not authenticated.');
  }

  const session = decryptSecret(account.session_ciphertext);
  if (!session) {
    throw new Error('Encrypted Telegram session is missing.');
  }

  if (isTelegramMockAdapter() || session.startsWith('mock-session:')) {
    await logActivity({
      workspaceId: input.context.workspaceId,
      profileId: input.context.profileId,
      event_type: 'telegram.reaction.sent',
      event_label: 'Telegram reaction sent',
      payload: {
        account_id: dialog.account_id,
        dialog_id: dialog.id,
        telegram_message_id: input.telegramMessageId,
        emoji: input.emoji,
        mock: true,
      },
    });
    return { ok: true };
  }

  const tgCreds = await resolveWorkspaceTgCredentials(input.context);
  if (!tgCreds) {
    throw new Error('Telegram app credentials are not configured for this workspace.');
  }

  const proxy = decryptJson<TgConsoleProxyConfig>(account.proxy_config_ciphertext);
  const { client } = await buildTelegramClient({
    apiId: Number(tgCreds.apiId),
    apiHash: tgCreds.apiHash,
    session,
    proxy,
  });

  try {
    await client.connect();
    const entity = await resolveDialogEntity(client, dialog);
    await client.invoke(new Api.messages.SendReaction({
      peer: entity,
      msgId: Number(input.telegramMessageId),
      addToRecent: true,
      big: false,
      reaction: [
        new Api.ReactionEmoji({ emoticon: input.emoji }),
      ],
    }));
  } finally {
    await client.disconnect();
  }

  await logActivity({
    workspaceId: input.context.workspaceId,
    profileId: input.context.profileId,
    event_type: 'telegram.reaction.sent',
    event_label: 'Telegram reaction sent',
    payload: {
      account_id: dialog.account_id,
      dialog_id: dialog.id,
      telegram_message_id: input.telegramMessageId,
      emoji: input.emoji,
    },
  });

  return { ok: true };
}

export async function sendTgDialogMessage(input: {
  context: WorkspaceContext;
  dialogId: string;
  text?: string | null;
  file?: {
    name: string;
    type: string | null;
    buffer: Buffer;
    size: number;
  } | null;
}) {
  const dialog = await getTgConsoleDialog(input.context, input.dialogId);
  if (!dialog) {
    throw new Error('Dialog not found.');
  }

  const text = (input.text ?? '').trim();
  const file = input.file ?? null;
  if (!text && !file) {
    throw new Error('Add a message or attach media before sending.');
  }

  const account = await getTgConsoleAccountPrivate(input.context, dialog.account_id);
  if (!account?.is_authenticated) {
    throw new Error('Telegram account is not authenticated.');
  }

  const session = decryptSecret(account.session_ciphertext);
  if (!session) {
    throw new Error('Encrypted Telegram session is missing.');
  }

  const mediaPreview = file ? `[media] ${file.name}` : text;
  const messagePreview = text || mediaPreview;

  if (isTelegramMockAdapter() || session.startsWith('mock-session:')) {
    const sentAt = nowIso();
    await mirrorOutboundMessage({
      context: input.context,
      dialog,
      accountId: dialog.account_id,
      accountLabel: account.display_name,
      messageId: `mock-${Date.now()}`,
      messageText: messagePreview,
      sentAt,
      metadata: file
        ? {
          media: true,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
          mock: true,
        }
        : { mock: true },
    });
    return { ok: true, direct: true, mock: true };
  }

  const tgCreds = await resolveWorkspaceTgCredentials(input.context);
  if (!tgCreds) {
    throw new Error('Telegram app credentials are not configured for this workspace.');
  }

  const proxy = decryptJson<TgConsoleProxyConfig>(account.proxy_config_ciphertext);
  const { client } = await buildTelegramClient({
    apiId: Number(tgCreds.apiId),
    apiHash: tgCreds.apiHash,
    session,
    proxy,
  });

  try {
    await client.connect();
    const entity = await resolveDialogEntity(client, dialog);

    let sent: any;
    if (file) {
      const { CustomFile } = await import('telegram/client/uploads');
      const telegramFile = new CustomFile(file.name, file.size, '', file.buffer);
      sent = await client.sendFile(entity, {
        file: telegramFile,
        caption: text || undefined,
        forceDocument: !(file.type?.startsWith('image/') || file.type?.startsWith('video/')),
        workers: 2,
      });
    } else {
      sent = await client.sendMessage(entity, { message: text });
    }

    const sentAt = toIsoFromTelegramDate(sent?.date);
    await mirrorOutboundMessage({
      context: input.context,
      dialog,
      accountId: dialog.account_id,
      accountLabel: account.display_name,
      messageId: String(sent?.id ?? `local-${Date.now()}`),
      messageText: messagePreview,
      sentAt,
      metadata: file
        ? {
          media: true,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
        }
        : undefined,
    });

    await logActivity({
      workspaceId: input.context.workspaceId,
      profileId: input.context.profileId,
      event_type: 'telegram.message.sent',
      event_label: 'Telegram direct message sent',
      payload: {
        account_id: dialog.account_id,
        dialog_id: dialog.id,
        telegram_message_id: String(sent?.id ?? ''),
        media: Boolean(file),
        file_name: file?.name ?? null,
      },
    });

    return {
      ok: true,
      direct: true,
      telegramMessageId: String(sent?.id ?? ''),
      sentAt,
    };
  } finally {
    await client.disconnect();
  }
}
