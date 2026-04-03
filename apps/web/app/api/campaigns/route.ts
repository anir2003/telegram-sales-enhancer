import { NextRequest, NextResponse } from 'next/server';
import { createCampaign, listCampaigns } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

// Force dynamic — never cache this route on the server
export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const campaigns = await listCampaigns(context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);

  const response = NextResponse.json({ campaigns });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const campaign = await createCampaign(await request.json(), context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
    return NextResponse.json({ campaign });
  } catch (err: any) {
    console.error('[POST /api/campaigns] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to create campaign' }, { status: 500 });
  }
}
