import { NextRequest, NextResponse } from 'next/server';
import { attachLeadToCampaign } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const campaignLead = await attachLeadToCampaign(id, body.leadId, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  return NextResponse.json({ campaignLead });
}
