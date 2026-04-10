import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { updateTgConsoleDialog } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const dialog = await updateTgConsoleDialog(
    { workspaceId: context.workspace.id, profileId: context.profile.id },
    id,
    await req.json(),
  );
  return NextResponse.json({ dialog });
}
