import { NextRequest, NextResponse } from 'next/server';
import { updateLead, deleteLead } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';
import { autoFetchLeadAvatar } from '@/lib/server/auto-fetch-avatar';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const wsCtx = context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined;
  const lead = await updateLead(id, body, wsCtx);
  if (lead?.telegram_username && body.telegram_username !== undefined) {
    autoFetchLeadAvatar(lead.id, lead.telegram_username, wsCtx);
  }
  return NextResponse.json({ lead });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await deleteLead(id, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  return NextResponse.json({ ok: true });
}
