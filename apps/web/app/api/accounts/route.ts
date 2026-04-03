import { NextRequest, NextResponse } from 'next/server';
import { createAccount, listAccounts } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

// Cache accounts for 60 seconds (they don't change as often)
export const revalidate = 60;

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await listAccounts(context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  
  // Add cache headers for better client-side caching
  const response = NextResponse.json({ accounts });
  response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
  return response;
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const account = await createAccount(await request.json(), context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
  return NextResponse.json({ account });
}
