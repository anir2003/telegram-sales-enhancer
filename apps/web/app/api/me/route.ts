import { NextResponse } from 'next/server';
import { isTeamAccessConfigured } from '@/lib/env';
import { getWorkspaceContext } from '@/lib/server/context';

export async function GET() {
  const context = await getWorkspaceContext();

  return NextResponse.json({
    configured: context?.configured ?? false,
    teamAccessConfigured: isTeamAccessConfigured(),
    profile: context?.profile ?? null,
    workspace: context?.workspace ?? null,
    authenticated: Boolean(context?.profile),
  });
}
