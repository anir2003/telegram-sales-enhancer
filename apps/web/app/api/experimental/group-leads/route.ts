import { NextRequest, NextResponse } from 'next/server';
import { getTelegramAppCredentials } from '@/lib/env';
import { getWorkspaceContext } from '@/lib/server/context';
import { resolveTelegramConnectorMode } from '@/lib/server/tg-console/credentials';
import { listTgConsoleAccounts } from '@/lib/server/repository';
import {
  createGroupLeadScrapeJob,
  getGroupLeadScrapeJob,
  listGroupLeadResults,
  listGroupLeadScrapeJobs,
  runGroupLeadScrapeJob,
} from '@/lib/server/tg-group-leads';

export const dynamic = 'force-dynamic';

async function getCtx() {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) return null;
  return { workspaceId: context.workspace.id, profileId: context.profile.id };
}

export async function GET(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  const credentialKeyConfigured = Boolean(getTelegramAppCredentials().credentialKey);
  const connector = await resolveTelegramConnectorMode(ctx);
  const [accounts, jobs] = await Promise.all([
    listTgConsoleAccounts(ctx),
    listGroupLeadScrapeJobs(ctx),
  ]);
  const selectedJob = jobId ? await getGroupLeadScrapeJob(ctx, jobId) : jobs[0] ?? null;
  const results = selectedJob ? await listGroupLeadResults(ctx, selectedJob.id) : [];

  const response = NextResponse.json({
    serverConfigured: connector.mode === 'mock' || Boolean(credentialKeyConfigured && connector.credentials),
    connectorMode: connector.mode,
    accounts,
    jobs,
    selectedJob,
    results,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job, input } = await createGroupLeadScrapeJob(ctx, await req.json());
  void runGroupLeadScrapeJob(ctx, job.id, input);
  return NextResponse.json({ job });
}
