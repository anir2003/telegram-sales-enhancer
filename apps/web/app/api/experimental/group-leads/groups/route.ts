import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { listTelegramGroupOptions } from '@/lib/server/tg-group-leads';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
  }

  const groups = await listTelegramGroupOptions(
    { workspaceId: context.workspace.id, profileId: context.profile.id },
    accountId,
  );
  return NextResponse.json({ groups });
}
