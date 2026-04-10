import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { addTgWarmedUsername, deleteTgWarmedUsername, listTgWarmedUsernames } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

async function getCtx() {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) return null;
  return { workspaceId: context.workspace.id, profileId: context.profile.id };
}

export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ warmedUsernames: await listTgWarmedUsernames(ctx) });
}

export async function POST(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const warmedUsername = await addTgWarmedUsername(ctx, await req.json());
  return NextResponse.json({ warmedUsername });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  await deleteTgWarmedUsername(ctx, String(id));
  return NextResponse.json({ ok: true });
}
