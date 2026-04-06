import { NextRequest, NextResponse } from 'next/server';
import { isTrustedBotRequest } from '@/lib/server/bot-auth';
import { markLeadReplied } from '@/lib/server/repository';

export async function POST(request: NextRequest) {
  if (!isTrustedBotRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { telegramUsername } = body;

  if (!telegramUsername || typeof telegramUsername !== 'string') {
    return NextResponse.json({ error: 'telegramUsername is required' }, { status: 400 });
  }

  const result = await markLeadReplied(telegramUsername);
  return NextResponse.json(result);
}
