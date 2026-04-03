import { NextRequest, NextResponse } from 'next/server';
import { createLead, listLeads } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leads = await listLeads(context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);

  const response = NextResponse.json({ leads });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const lead = await createLead(body, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
    return NextResponse.json({ lead });
  } catch (err: any) {
    console.error('[POST /api/leads] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to create lead' }, { status: 500 });
  }
}
