import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import {
  getTelegramCredential,
  upsertTelegramCredential,
  deleteTelegramCredential,
} from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ctx = { workspaceId: context.workspace.id, profileId: context.profile.id };
  const cred = await getTelegramCredential(ctx);
  if (!cred) {
    return NextResponse.json({ credential: null });
  }
  // Never expose session_string or api_hash to the client
  return NextResponse.json({
    credential: {
      api_id: cred.api_id,
      phone: cred.phone,
      is_authenticated: cred.is_authenticated,
      has_code_pending: Boolean(cred.phone_code_hash),
    },
  });
}

export async function POST(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ctx = { workspaceId: context.workspace.id, profileId: context.profile.id };
  const body = await req.json();
  const { api_id, api_hash, phone } = body;
  if (!api_id || !api_hash || !phone) {
    return NextResponse.json({ error: 'api_id, api_hash, and phone are required.' }, { status: 400 });
  }
  await upsertTelegramCredential(ctx, { api_id: String(api_id), api_hash: String(api_hash), phone: String(phone) });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ctx = { workspaceId: context.workspace.id, profileId: context.profile.id };
  await deleteTelegramCredential(ctx);
  return NextResponse.json({ ok: true });
}
