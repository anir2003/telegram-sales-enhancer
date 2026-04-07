import { NextRequest, NextResponse } from 'next/server';
import { isTrustedBotRequest } from '@/lib/server/bot-auth';
import { consumeAccountLinkCode } from '@/lib/server/repository';
import { autoFetchAccountAvatar } from '@/lib/server/auto-fetch-avatar';

export async function POST(request: NextRequest) {
  if (!isTrustedBotRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const account = await consumeAccountLinkCode({
    code: body.code,
    telegramUserId: body.telegramUserId,
    telegramUsername: body.telegramUsername ?? '',
  });

  if (!account) {
    return NextResponse.json({ error: 'Invalid or expired account link code' }, { status: 404 });
  }

  // Auto-fetch profile picture in background after account is linked
  if (account.telegram_username) {
    autoFetchAccountAvatar(account.id, account.telegram_username, account.workspace_id);
  }

  return NextResponse.json({ account });
}
