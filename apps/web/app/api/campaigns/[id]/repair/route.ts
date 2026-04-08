import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { autoFetchLeadAvatar } from '@/lib/server/auto-fetch-avatar';
import { assignUnassignedCampaignLeads, getCampaignDetail } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const wsCtx = context?.workspace
    ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null }
    : undefined;

  try {
    const assignmentResult = await assignUnassignedCampaignLeads(id, wsCtx);
    const detail = await getCampaignDetail(id, wsCtx);
    if (!detail.campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const attachedLeadIds = new Set((detail.attachedLeads ?? []).map((lead) => lead.lead_id));
    let avatarFetchQueued = 0;

    for (const lead of detail.leads ?? []) {
      if (!attachedLeadIds.has(lead.id) || !lead.telegram_username || lead.profile_picture_url) continue;
      autoFetchLeadAvatar(lead.id, lead.telegram_username, wsCtx);
      avatarFetchQueued += 1;
    }

    return NextResponse.json({
      assigned: assignmentResult.assigned,
      active_accounts: assignmentResult.availableAccounts,
      avatar_fetch_queued: avatarFetchQueued,
    });
  } catch (err: any) {
    console.error('[POST /api/campaigns/[id]/repair] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to repair campaign lead intake' }, { status: 500 });
  }
}
