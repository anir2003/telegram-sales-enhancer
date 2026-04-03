import { NextRequest, NextResponse } from 'next/server';
import { updateCampaignLead } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; leadId: string }> }) {
  const { leadId } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const lead = await updateCampaignLead(leadId, await request.json(), context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
    return NextResponse.json({ lead });
  } catch (err: any) {
    console.error('[PATCH /api/campaigns/[id]/leads/[leadId]] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to update lead' }, { status: 500 });
  }
}
