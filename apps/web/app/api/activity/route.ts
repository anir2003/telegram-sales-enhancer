import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { listActivity } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const activity = await listActivity(context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);

  const response = NextResponse.json({ activity });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
