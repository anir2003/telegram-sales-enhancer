import { NextRequest, NextResponse } from 'next/server';
import { isTrustedBotRequest } from '@/lib/server/bot-auth';
import { consumeAccountLinkCode } from '@/lib/server/repository';

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

  return NextResponse.json({ account });
}
