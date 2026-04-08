import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { autoFetchLeadAvatar } from '@/lib/server/auto-fetch-avatar';
import { importLeadsCsv, listLeadsByTag, addLeadsToCampaign, assignUnassignedCampaignLeads } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

function queueMissingLeadAvatars(
  leads: Array<{ id: string; telegram_username: string; profile_picture_url?: string | null }>,
  context?: { workspaceId: string; profileId: string | null },
) {
  let queued = 0;
  for (const lead of leads) {
    if (!lead.telegram_username || lead.profile_picture_url) continue;
    autoFetchLeadAvatar(lead.id, lead.telegram_username, context);
    queued += 1;
  }
  return queued;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ctx = context?.workspace
    ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null }
    : undefined;

  try {
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      // ── Method A: Upload CSV ─────────────────────────────────────
      const formData = await request.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Upload a CSV file.' }, { status: 400 });
      }

      const tagsRaw = formData.get('tags');
      const extraTags =
        typeof tagsRaw === 'string'
          ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
          : [];

      const csvText = await file.text();
      const leads = await importLeadsCsv(csvText, extraTags, ctx);
      const result = await addLeadsToCampaign(id, leads.map((l) => l.id), ctx);
      const assignmentResult = await assignUnassignedCampaignLeads(id, ctx);
      const avatarFetchQueued = queueMissingLeadAvatars(leads, ctx);

      return NextResponse.json({
        imported: leads.length,
        added_to_campaign: result.added,
        already_in_campaign: result.skipped,
        assigned_to_accounts: assignmentResult.assigned,
        active_accounts: assignmentResult.availableAccounts,
        avatar_fetch_queued: avatarFetchQueued,
      });
    } else {
      // ── Method B: Tag-based ──────────────────────────────────────
      const body = await request.json();
      const { tag } = body as { tag?: string };
      if (!tag?.trim()) {
        return NextResponse.json({ error: 'tag is required.' }, { status: 400 });
      }

      const leads = await listLeadsByTag(tag.trim(), ctx);
      const result = await addLeadsToCampaign(id, leads.map((l) => l.id), ctx);
      const assignmentResult = await assignUnassignedCampaignLeads(id, ctx);
      const avatarFetchQueued = queueMissingLeadAvatars(leads, ctx);

      return NextResponse.json({
        matched: leads.length,
        added_to_campaign: result.added,
        already_in_campaign: result.skipped,
        assigned_to_accounts: assignmentResult.assigned,
        active_accounts: assignmentResult.availableAccounts,
        avatar_fetch_queued: avatarFetchQueued,
      });
    }
  } catch (err: any) {
    console.error('[POST /api/campaigns/[id]/add-leads]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to add leads.' }, { status: 500 });
  }
}
