import { NextResponse } from 'next/server';
import { getCampaignDetail, updateCampaign, deleteCampaign } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const detail = await getCampaignDetail(id, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  const response = NextResponse.json(detail);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const campaign = await updateCampaign(
      id,
      await request.json(),
      context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined,
    );
    return NextResponse.json({ campaign });
  } catch (err: any) {
    console.error('[PATCH /api/campaigns/[id]] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to update campaign' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await deleteCampaign(id, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /api/campaigns/[id]] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to delete campaign' }, { status: 500 });
  }
}
