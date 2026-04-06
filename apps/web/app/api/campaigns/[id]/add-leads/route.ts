import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { importLeadsCsv, listLeadsByTag, addLeadsToCampaign } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

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

      return NextResponse.json({
        imported: leads.length,
        added_to_campaign: result.added,
        already_in_campaign: result.skipped,
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

      return NextResponse.json({
        matched: leads.length,
        added_to_campaign: result.added,
        already_in_campaign: result.skipped,
      });
    }
  } catch (err: any) {
    console.error('[POST /api/campaigns/[id]/add-leads]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to add leads.' }, { status: 500 });
  }
}
