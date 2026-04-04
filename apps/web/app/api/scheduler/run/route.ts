import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { runBotScheduler } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function POST() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runBotScheduler();
    return NextResponse.json({ result });
  } catch (err: any) {
    console.error('[POST /api/scheduler/run] Error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to run scheduler' }, { status: 500 });
  }
}
