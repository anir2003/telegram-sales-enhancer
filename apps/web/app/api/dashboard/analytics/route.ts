import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getDashboardAnalytics } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const analytics = await getDashboardAnalytics(
      context?.workspace
        ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null }
        : undefined,
    );
    const response = NextResponse.json({ analytics });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('dashboard/analytics error', error);
    const message = error instanceof Error ? error.message : 'Failed to load analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
