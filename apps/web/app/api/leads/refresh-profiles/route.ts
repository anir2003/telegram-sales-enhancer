import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { listAccounts, listLeads, logActivity } from '@/lib/server/repository';
import { refreshAccountProfile, refreshLeadProfile } from '@/lib/server/auto-fetch-avatar';

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
  const accounts = await listAccounts(wsCtx);
  const refreshable = leads.filter((lead) => lead.telegram_username?.trim());
  const refreshableAccounts = accounts.filter((account) => account.telegram_username?.trim());

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
  const accountResults = await runWithConcurrency(refreshableAccounts, 4, async (account) => {
    try {
      const profile = await refreshAccountProfile(account.id, account.telegram_username, wsCtx?.workspaceId);
      return {
        id: account.id,
        exists: profile.exists,
        avatarUrl: profile.avatarUrl,
      };
    } catch {
      return {
        id: account.id,
        exists: null,
        avatarUrl: null,
      };
    }
  });

  const accountSummary = {
    processed: accountResults.length,
    refreshed: accountResults.filter((item) => item.exists === true && item.avatarUrl).length,
    invalid: accountResults.filter((item) => item.exists === false).length,
    noAvatar: accountResults.filter((item) => item.exists === true && !item.avatarUrl).length,
    unavailable: accountResults.filter((item) => item.exists === null).length,
  };

  if (wsCtx) {
    await logActivity({
      workspaceId: wsCtx.workspaceId,
      profileId: wsCtx.profileId,
      event_type: 'profile.refresh',
      event_label: `Refreshed ${summary.processed} leads and ${accountSummary.processed} accounts`,
      payload: {
        leads: summary,
        accounts: accountSummary,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    leads: summary,
    accounts: accountSummary,
  });
}
