import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { syncTgConsoleAccountOnce } from '@/lib/server/tg-console/sync';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { accountId } = await req.json();
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
  }

  const result = await syncTgConsoleAccountOnce(
    { workspaceId: context.workspace.id, profileId: context.profile.id },
    String(accountId),
  );
  return NextResponse.json(result);
}
