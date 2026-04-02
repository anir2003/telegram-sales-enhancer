import { NextRequest, NextResponse } from 'next/server';
import { createAccountLinkCode } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const label = (body.label ?? '').trim();
  const dailyLimit = Number(body.dailyLimit) || 20;

  if (!label) {
    return NextResponse.json({ error: 'Account label is required' }, { status: 400 });
  }

  const linkCode = await createAccountLinkCode(
    { label, dailyLimit },
    context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined,
  );

  return NextResponse.json({ linkCode });
}
