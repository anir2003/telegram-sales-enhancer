import { NextRequest, NextResponse } from 'next/server';
import { getTelegramAppCredentials } from '@/lib/env';
import { getWorkspaceContext } from '@/lib/server/context';
import { resolveTelegramConnectorMode } from '@/lib/server/tg-console/credentials';
import {
  listTgConsoleAccounts,
  listTgConsoleDialogs,
  listTgConsoleMessages,
  listTgSendApprovals,
  listTgWarmedUsernames,
} from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ctx = { workspaceId: context.workspace.id, profileId: context.profile.id };
  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId');
  const dialogId = url.searchParams.get('dialogId');
  const credentialKeyConfigured = Boolean(getTelegramAppCredentials().credentialKey);
  const connector = await resolveTelegramConnectorMode(ctx);

  const [accounts, dialogs, messages, warmedUsernames, sendApprovals] = await Promise.all([
    listTgConsoleAccounts(ctx),
    listTgConsoleDialogs(ctx, accountId),
    listTgConsoleMessages(ctx, dialogId),
    listTgWarmedUsernames(ctx),
    listTgSendApprovals(ctx),
  ]);

  return NextResponse.json({
    serverConfigured: connector.mode === 'mock' || Boolean(credentialKeyConfigured && connector.credentials),
    connectorMode: connector.mode,
    accounts,
    dialogs,
    messages,
    warmedUsernames,
    sendApprovals,
  });
}
