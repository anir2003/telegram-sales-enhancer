import { NextRequest, NextResponse } from 'next/server';
import { isTrustedBotRequest } from '@/lib/server/bot-auth';
import { reportAccountRestriction } from '@/lib/server/repository';

export async function POST(request: NextRequest) {
  if (!isTrustedBotRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const result = await reportAccountRestriction(body.telegramUserId, body.messageText ?? '');
    return NextResponse.json({ result });
  } catch (err: any) {
    if (err.message === 'NOT_LINKED') {
      return NextResponse.json({ error: 'NOT_LINKED' }, { status: 400 });
    }
    return NextResponse.json({ error: err?.message ?? 'Failed to report restriction' }, { status: 400 });
  }
}
