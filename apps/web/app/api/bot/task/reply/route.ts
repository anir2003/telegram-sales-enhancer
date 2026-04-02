import { NextRequest, NextResponse } from 'next/server';
import { isTrustedBotRequest } from '@/lib/server/bot-auth';
import { markTaskReply } from '@/lib/server/repository';

export async function POST(request: NextRequest) {
  if (!isTrustedBotRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json();
  const task = await markTaskReply(body.taskId, body.telegramUserId, body.replyStatus);
  return NextResponse.json({ task });
}
