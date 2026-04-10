import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { approveTgSendApproval, createTgSendApprovals, listTgSendApprovals } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

async function getCtx() {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) return null;
  return { workspaceId: context.workspace.id, profileId: context.profile.id };
}

export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ sendApprovals: await listTgSendApprovals(ctx) });
}

export async function POST(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sendApprovals = await createTgSendApprovals(ctx, await req.json());
  return NextResponse.json({ sendApprovals });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, action } = await req.json();
  if (!id || action !== 'approve') {
    return NextResponse.json({ error: 'Use action=approve with a send approval id.' }, { status: 400 });
  }
  const sendApproval = await approveTgSendApproval(ctx, String(id));
  return NextResponse.json({ sendApproval });
}
