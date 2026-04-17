import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { cleanGroupLeadResultsWithAi } from '@/lib/server/tg-group-leads';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await cleanGroupLeadResultsWithAi(
      { workspaceId: context.workspace.id, profileId: context.profile.id },
      await req.json(),
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auto-clean failed.';
    console.error('[group-leads/clean] error:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
