import { NextRequest, NextResponse } from 'next/server';
import { isTrustedBotRequest } from '@/lib/server/bot-auth';
import { consumeBotLinkCode } from '@/lib/server/repository';

export async function POST(request: NextRequest) {
  if (!isTrustedBotRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const profile = await consumeBotLinkCode({
    code: body.code,
    telegramUserId: body.telegramUserId,
    telegramUsername: body.telegramUsername ?? null,
  });

  if (!profile) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 404 });
  }

  return NextResponse.json({ profile });
}
