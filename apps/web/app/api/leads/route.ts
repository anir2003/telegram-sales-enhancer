import { NextRequest, NextResponse } from 'next/server';
import { createLead, listLeads } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

// Cache leads for 30 seconds, allow stale-while-revalidate for 5 minutes
export const revalidate = 30;

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leads = await listLeads(context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  
  // Add cache headers for better client-side caching
  const response = NextResponse.json({ leads });
  response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=300');
  return response;
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const lead = await createLead(body, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  return NextResponse.json({ lead });
}
