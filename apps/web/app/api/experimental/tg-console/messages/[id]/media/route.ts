import { NextResponse } from 'next/server';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { getWorkspaceContext } from '@/lib/server/context';
import {
  getTgConsoleAccountPrivate,
  getTgConsoleDialog,
  getTgConsoleMessage,
} from '@/lib/server/repository';
import { buildTelegramClient } from '@/lib/server/tg-console/client';
import { resolveWorkspaceTgCredentials } from '@/lib/server/tg-console/credentials';
import { decryptJson, decryptSecret } from '@/lib/server/tg-console/crypto';
import { buildTgMessageMediaMetadata } from '@/lib/server/tg-console/media';
import type { TgConsoleDialogRecord, TgConsoleProxyConfig } from '@telegram-enhancer/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseDialogPeer(dialog: Pick<TgConsoleDialogRecord, 'telegram_dialog_id'>) {
  const [kind, rawId] = dialog.telegram_dialog_id.split(':');
  if (!kind || !rawId) return null;

  try {
    const id = bigInt(rawId);
    if (kind === 'user' || kind === 'bot') return new Api.PeerUser({ userId: id });
    if (kind === 'group') return new Api.PeerChat({ chatId: id });
    if (kind === 'channel') return new Api.PeerChannel({ channelId: id });
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
  if (!peer) throw new Error('Dialog cannot be resolved for media download.');
  return client.getInputEntity(peer);
}

function safeFileName(value: unknown) {
  const name = typeof value === 'string' && value.trim() ? value.trim() : 'telegram-media';
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'telegram-media';
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ctx = { workspaceId: context.workspace.id, profileId: context.profile.id };
  const { id } = await params;
  const message = await getTgConsoleMessage(ctx, id);
  if (!message?.telegram_message_id) {
    return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  }

  const [dialog, account, tgCreds] = await Promise.all([
    getTgConsoleDialog(ctx, message.dialog_id),
    getTgConsoleAccountPrivate(ctx, message.account_id),
    resolveWorkspaceTgCredentials(ctx),
  ]);

  if (!dialog || !account?.is_authenticated) {
    return NextResponse.json({ error: 'Telegram media source is unavailable.' }, { status: 404 });
  }
  if (!tgCreds) {
    return NextResponse.json({ error: 'Telegram app credentials are not configured.' }, { status: 503 });
  }

  const session = decryptSecret(account.session_ciphertext);
  if (!session) {
    return NextResponse.json({ error: 'Telegram session is missing.' }, { status: 503 });
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
    const results = await client.getMessages(entity, { ids: Number(message.telegram_message_id) });
    const telegramMessage = Array.isArray(results) ? results[0] : results?.[0];
    if (!telegramMessage?.media) {
      return NextResponse.json({ error: 'Message has no downloadable media.' }, { status: 404 });
    }

    const downloaded = await client.downloadMedia(telegramMessage, {});
    if (!downloaded || typeof downloaded === 'string') {
      return NextResponse.json({ error: 'Media could not be downloaded.' }, { status: 404 });
    }

    const buffer = Buffer.from(downloaded);
    const metadata = buildTgMessageMediaMetadata(telegramMessage);
    const mimeType = typeof metadata.mime_type === 'string' ? metadata.mime_type : 'application/octet-stream';
    const filename = safeFileName(metadata.file_name);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Content-Type': mimeType,
      },
    });
  } finally {
    await client.disconnect();
  }
}
