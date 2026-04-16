import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import {
  listWorkspaceDemoGuildTraces,
  upsertWorkspaceDemoGuildTraces,
} from '@/lib/server/demo-guilds';

export const dynamic = 'force-dynamic';

function getActiveWorkspaceContext(context: Awaited<ReturnType<typeof getWorkspaceContext>>) {
  if (!context?.workspace) {
    throw new Error('Join or create an organization before using Demo Guilds.');
  }

  return {
    workspaceId: context.workspace.id,
    profileId: context.profile?.id ?? null,
  };
}

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const traces = await listWorkspaceDemoGuildTraces(getActiveWorkspaceContext(context));
    return NextResponse.json({ traces });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load Demo Guild traces.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const traces = Array.isArray(body?.traces)
      ? body.traces
      : body?.trace
        ? [body.trace]
        : [];

    if (!traces.length) {
      return NextResponse.json({ error: 'Provide at least one trace payload.' }, { status: 400 });
    }

    const source = typeof body?.source === 'string' && body.source.trim() ? body.source.trim() : 'manual';
    const saved = await upsertWorkspaceDemoGuildTraces(getActiveWorkspaceContext(context), traces, source);
    return NextResponse.json({ traces: saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save Demo Guild traces.' },
      { status: 400 },
    );
  }
}
