import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { sendTgDialogMessage } from '@/lib/server/tg-console/dispatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const contentType = req.headers.get('content-type') ?? '';

  let text: string | null | undefined;
  let file: { name: string; type: string | null; buffer: Buffer; size: number } | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    text = String(form.get('text') ?? '');
    const rawFile = form.get('file');
    if (rawFile instanceof File && rawFile.size > 0) {
      file = {
        name: rawFile.name,
        type: rawFile.type || null,
        buffer: Buffer.from(await rawFile.arrayBuffer()),
        size: rawFile.size,
      };
    }
  } else {
    const body = await req.json();
    text = String(body.text ?? '');
  }

  const result = await sendTgDialogMessage({
    context: { workspaceId: context.workspace.id, profileId: context.profile.id },
    dialogId: id,
    text,
    file,
  });

  return NextResponse.json(result);
}
