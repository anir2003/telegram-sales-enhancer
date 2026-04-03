import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { importLeadsCsv } from '@/lib/server/repository';

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
    const leads = await importLeadsCsv(csvText, extraTags, context?.workspace ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null } : undefined);

    return NextResponse.json({ leads });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to import CSV.' }, { status: 400 });
  }
}
