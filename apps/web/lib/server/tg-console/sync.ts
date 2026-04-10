import {
  getTgConsoleAccountPrivate,
  markTgConsoleAccountSynced,
  upsertTgConsoleDialog,
  upsertTgConsoleMessages,
} from '@/lib/server/repository';
import { resolveWorkspaceTgCredentials } from '@/lib/server/tg-console/credentials';
import { buildTelegramClient } from '@/lib/server/tg-console/client';
import { decryptJson, decryptSecret } from '@/lib/server/tg-console/crypto';
import type { TgConsoleProxyConfig } from '@telegram-enhancer/shared';

type SyncContext = {
  workspaceId: string;
  profileId: string | null;
};

function toIsoFromTelegramDate(value: unknown) {
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

function getEntityId(entity: any) {
  return String(entity?.id ?? entity?.userId ?? entity?.channelId ?? entity?.chatId ?? 'unknown');
}

function getEntityKind(entity: any) {
  if (entity?.bot) return 'bot' as const;
  if (entity?.className === 'User') return 'user' as const;
  if (entity?.className === 'Chat') return 'group' as const;
  if (entity?.className === 'Channel') return entity?.broadcast ? 'channel' as const : 'group' as const;
  return 'unknown' as const;
}

function getEntityTitle(entity: any) {
  const fullName = [entity?.firstName, entity?.lastName].filter(Boolean).join(' ').trim();
  return entity?.title || fullName || entity?.username || `Telegram ${getEntityId(entity)}`;
}

function getPreview(message: any) {
  const text = typeof message?.message === 'string' ? message.message : '';
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export async function syncTgConsoleAccountOnce(context: SyncContext, accountId: string) {
  const account = await getTgConsoleAccountPrivate(context, accountId);
  if (!account?.is_authenticated) {
    throw new Error('Telegram account is not authenticated.');
  }

  const session = decryptSecret(account.session_ciphertext);
  if (!session) {
    throw new Error('Encrypted Telegram session is missing.');
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
    const dialogs = await client.getDialogs({ limit: 50 });

    for (const dialog of dialogs as any[]) {
      const entity = dialog.entity;
      if (!entity) continue;
      const lastMessage = dialog.message;
      const telegramDialogId = `${getEntityKind(entity)}:${getEntityId(entity)}`;
      const storedDialog = await upsertTgConsoleDialog(context, {
        account_id: accountId,
        telegram_dialog_id: telegramDialogId,
        kind: getEntityKind(entity),
        title: getEntityTitle(entity),
        username: entity.username ?? null,
        folder_id: typeof dialog.folderId === 'number' ? dialog.folderId : null,
        folder_name: typeof dialog.folderId === 'number' ? `Telegram Folder ${dialog.folderId}` : 'All Inboxes',
        crm_folder: dialog.unreadCount > 0 ? 'My Inbox' : 'All Inboxes',
        unread_count: Number(dialog.unreadCount ?? 0),
        is_unread: Number(dialog.unreadCount ?? 0) > 0,
        is_replied: Boolean(lastMessage?.out),
        last_message_at: lastMessage?.date ? toIsoFromTelegramDate(lastMessage.date) : null,
        last_message_preview: lastMessage ? getPreview(lastMessage) : null,
        tags: [],
        notes: null,
      });

      const messages = await client.getMessages(entity, { limit: 30 });
      await upsertTgConsoleMessages(context, (messages as any[]).reverse().map((message) => ({
        account_id: accountId,
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
      })));
    }

    await markTgConsoleAccountSynced(context, accountId);
    return { ok: true, dialogs: (dialogs as unknown[]).length };
  } finally {
    await client.disconnect();
  }
}
