import { NextRequest, NextResponse } from 'next/server';
import { updateSequenceStep } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const { stepId } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const step = await updateSequenceStep(stepId, await request.json(), context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
    return NextResponse.json({ step });
  } catch (err: any) {
    console.error('[PATCH /api/campaigns/[id]/steps/[stepId]] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to update step' }, { status: 500 });
  }
}
