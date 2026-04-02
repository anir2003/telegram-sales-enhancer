import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { createBotLinkCode } from '@/lib/server/repository';

export async function POST() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const linkCode = await createBotLinkCode(context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  return NextResponse.json({ linkCode });
}
