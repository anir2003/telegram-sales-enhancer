import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { approveTgSendApproval, createTgSendApprovals, listTgSendApprovals } from '@/lib/server/repository';
import { dispatchTgSendApprovalsNow } from '@/lib/server/tg-console/dispatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SCHEDULED_MEDIA_BYTES = 10 * 1024 * 1024;

async function getCtx() {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) return null;
  return { workspaceId: context.workspace.id, profileId: context.profile.id };
}

function parseStringArray(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    // Accept comma-separated fallback for simple callers.
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function parseSendApprovalRequest(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return req.json();
  }

  const form = await req.formData();
  const rawFile = form.get('file');
  let media = null;

  if (rawFile instanceof File && rawFile.size > 0) {
    if (rawFile.size > MAX_SCHEDULED_MEDIA_BYTES) {
      throw new Error('Scheduled media must be 10 MB or smaller.');
    }
    media = {
      name: rawFile.name,
      type: rawFile.type || null,
      size: rawFile.size,
      data_base64: Buffer.from(await rawFile.arrayBuffer()).toString('base64'),
    };
  }

  return {
    account_id: String(form.get('account_id') ?? '').trim(),
    dialog_ids: parseStringArray(form.get('dialog_ids')),
    target_usernames: parseStringArray(form.get('target_usernames')),
    message_text: String(form.get('message_text') ?? '').trim(),
    approve_now: String(form.get('approve_now') ?? '') === 'true',
    scheduled_for: String(form.get('scheduled_for') ?? '').trim() || null,
    media,
  };
}

export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ sendApprovals: await listTgSendApprovals(ctx) });
}

export async function POST(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await parseSendApprovalRequest(req);
    const sendApprovals = await createTgSendApprovals(ctx, body);
    if (!body?.approve_now || body?.scheduled_for) {
      return NextResponse.json({ sendApprovals });
    }
    return NextResponse.json({ sendApprovals: await dispatchTgSendApprovalsNow(ctx, sendApprovals) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not queue Telegram send.' },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, action } = await req.json();
  if (!id || action !== 'approve') {
    return NextResponse.json({ error: 'Use action=approve with a send approval id.' }, { status: 400 });
  }
  const sendApproval = await approveTgSendApproval(ctx, String(id));
  const [delivered] = await dispatchTgSendApprovalsNow(ctx, [sendApproval]);
  return NextResponse.json({ sendApproval: delivered });
}
