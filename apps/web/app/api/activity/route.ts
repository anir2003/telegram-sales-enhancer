import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { listActivity } from '@/lib/server/repository';

// Cache activity for 15 seconds (activity changes frequently)
export const revalidate = 15;

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const activity = await listActivity(context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  
  // Add cache headers for better client-side caching
  const response = NextResponse.json({ activity });
  response.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
  return response;
}
