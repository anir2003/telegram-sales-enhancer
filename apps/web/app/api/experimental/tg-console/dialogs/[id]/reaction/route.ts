import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { sendTgDialogReaction } from '@/lib/server/tg-console/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const emoji = String(body.emoji ?? '').trim();
  const telegramMessageId = String(body.telegram_message_id ?? '').trim();

  if (!emoji) {
    return NextResponse.json({ error: 'emoji is required.' }, { status: 400 });
  }
  if (!telegramMessageId) {
    return NextResponse.json({ error: 'telegram_message_id is required.' }, { status: 400 });
  }

  const result = await sendTgDialogReaction({
    context: { workspaceId: context.workspace.id, profileId: context.profile.id },
    dialogId: id,
    telegramMessageId,
    emoji,
  });

  return NextResponse.json(result);
}
