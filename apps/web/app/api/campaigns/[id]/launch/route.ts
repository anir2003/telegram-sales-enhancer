import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { launchCampaign, runBotScheduler } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const queuedLeads = await launchCampaign(id, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
    // Immediately promote queued leads to due so the bot can pick them up right away
    const schedulerResult = await runBotScheduler();
    return NextResponse.json({ queued_leads: queuedLeads, scheduler: schedulerResult });
  } catch (err: any) {
    console.error('[POST /api/campaigns/[id]/launch] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to launch campaign' }, { status: 500 });
  }
}
