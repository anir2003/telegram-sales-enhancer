import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { importLeadsCsv } from '@/lib/server/repository';
import { autoFetchLeadAvatar } from '@/lib/server/auto-fetch-avatar';

export async function POST(request: NextRequest) {
  try {
    const context = await getWorkspaceContext();
    if (context?.configured && !context.profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Upload a CSV file.' }, { status: 400 });
    }

    const csvText = await file.text();
    const tagsRaw = formData.get('tags');
    const extraTags = typeof tagsRaw === 'string'
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const wsCtx = context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined;
    const leads = await importLeadsCsv(csvText, extraTags, wsCtx);

    // Auto-fetch profile pictures for all imported leads (background, non-blocking)
    for (const lead of leads) {
      if (lead.telegram_username) {
        autoFetchLeadAvatar(lead.id, lead.telegram_username, wsCtx);
      }
    }

    return NextResponse.json({ leads });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to import CSV.' }, { status: 400 });
  }
}
