import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { pauseCampaign } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const campaign = await pauseCampaign(id, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
    return NextResponse.json({ campaign });
  } catch (err: any) {
    console.error('[POST /api/campaigns/[id]/pause] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to pause campaign' }, { status: 500 });
  }
}
