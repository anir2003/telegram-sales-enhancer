import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getWorkspaceDemoGuildTrace } from '@/lib/server/demo-guilds';

export const dynamic = 'force-dynamic';

function getActiveWorkspaceContext(context: Awaited<ReturnType<typeof getWorkspaceContext>>) {
  if (!context?.workspace) {
    throw new Error('Join or create an organization before using Demo Guilds.');
  }

  return {
    workspaceId: context.workspace.id,
    profileId: context.profile?.id ?? null,
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const record = await getWorkspaceDemoGuildTrace(getActiveWorkspaceContext(context), decodeURIComponent(id));
    if (!record) {
      return NextResponse.json({ error: 'Trace not found.' }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load Demo Guild trace.' },
      { status: 500 },
    );
  }
}
