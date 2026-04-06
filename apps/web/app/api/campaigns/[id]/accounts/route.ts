import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { setCampaignAccounts } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    // Resolve message limits: global messagesPerAccount takes precedence over per-account messageLimits
    const resolvedLimits: Array<{ accountId: string; limit: number }> | null = body.messagesPerAccount
      ? (body.accountIds ?? []).map((aid: string) => ({ accountId: aid, limit: Number(body.messagesPerAccount) }))
      : (body.messageLimits ?? null);
    const accountIds = await setCampaignAccounts(id, body.accountIds ?? [], resolvedLimits, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
    return NextResponse.json({ accountIds });
  } catch (err: any) {
    console.error('[POST /api/campaigns/[id]/accounts] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to set accounts' }, { status: 500 });
  }
}
