import { NextRequest, NextResponse } from 'next/server';
import { createAccount, listAccounts } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await listAccounts(context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);

  const response = NextResponse.json({ accounts });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const account = await createAccount(await request.json(), context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);
    return NextResponse.json({ account });
  } catch (err: any) {
    console.error('[POST /api/accounts] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to create account' }, { status: 500 });
  }
}
