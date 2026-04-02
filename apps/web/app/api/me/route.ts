import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';

export async function GET() {
  const context = await getWorkspaceContext();

  return NextResponse.json({
    configured: context?.configured ?? false,
    profile: context?.profile ?? null,
    workspace: context?.workspace ?? null,
    authenticated: Boolean(context?.profile),
  });
}
