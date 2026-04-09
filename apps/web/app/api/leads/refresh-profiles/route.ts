import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { listLeads, logActivity } from '@/lib/server/repository';
import { refreshLeadProfile } from '@/lib/server/auto-fetch-avatar';

export const dynamic = 'force-dynamic';

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let index = 0;

  async function next() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

export async function POST() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const wsCtx = context?.workspace
    ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null }
    : undefined;
  const leads = await listLeads(wsCtx);
  const refreshable = leads.filter((lead) => lead.telegram_username?.trim());

  const results = await runWithConcurrency(refreshable, 4, async (lead) => {
    try {
      const profile = await refreshLeadProfile(lead.id, lead.telegram_username, wsCtx);
      return {
        id: lead.id,
        exists: profile.exists,
        avatarUrl: profile.avatarUrl,
      };
    } catch {
      return {
        id: lead.id,
        exists: null,
        avatarUrl: null,
      };
    }
  });

  const summary = {
    processed: results.length,
    refreshed: results.filter((item) => item.exists === true && item.avatarUrl).length,
    invalid: results.filter((item) => item.exists === false).length,
    noAvatar: results.filter((item) => item.exists === true && !item.avatarUrl).length,
    unavailable: results.filter((item) => item.exists === null).length,
  };

  if (wsCtx) {
    await logActivity({
      workspaceId: wsCtx.workspaceId,
      profileId: wsCtx.profileId,
      event_type: 'lead.profile_refresh',
      event_label: `Refreshed ${summary.processed} lead profiles`,
      payload: summary,
    });
  }

  return NextResponse.json({ ok: true, ...summary });
}
