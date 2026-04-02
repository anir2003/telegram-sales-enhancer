import { NextRequest, NextResponse } from 'next/server';
import { isTrustedBotRequest } from '@/lib/server/bot-auth';
import { runBotScheduler } from '@/lib/server/repository';

export async function POST(request: NextRequest) {
  if (!isTrustedBotRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await runBotScheduler();
  return NextResponse.json({ result });
}
