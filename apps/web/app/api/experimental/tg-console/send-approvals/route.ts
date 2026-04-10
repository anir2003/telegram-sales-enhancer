import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { approveTgSendApproval, createTgSendApprovals, listTgSendApprovals } from '@/lib/server/repository';
import { dispatchTgSendApprovalsNow } from '@/lib/server/tg-console/dispatch';

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
  const body = await req.json();
  const sendApprovals = await createTgSendApprovals(ctx, body);
  if (!body?.approve_now) {
    return NextResponse.json({ sendApprovals });
  }
  return NextResponse.json({ sendApprovals: await dispatchTgSendApprovalsNow(ctx, sendApprovals) });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, action } = await req.json();
  if (!id || action !== 'approve') {
    return NextResponse.json({ error: 'Use action=approve with a send approval id.' }, { status: 400 });
  }
  const sendApproval = await approveTgSendApproval(ctx, String(id));
  const [delivered] = await dispatchTgSendApprovalsNow(ctx, [sendApproval]);
  return NextResponse.json({ sendApproval: delivered });
}
