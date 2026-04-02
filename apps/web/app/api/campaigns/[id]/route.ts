import { NextResponse } from 'next/server';
import { getCampaignDetail, updateCampaign } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const detail = await getCampaignDetail(id, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const campaign = await updateCampaign(
    id,
    await request.json(),
    context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined,
  );
  return NextResponse.json({ campaign });
}
