import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

const DEMO_CARDS: any[] = (globalThis as any).__kanban_demo_cards__ ?? [];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  if (!isSupabaseConfigured() || !context?.workspace) {
    const card = DEMO_CARDS.find((c) => c.id === id);
    if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (body.title !== undefined) card.title = body.title;
    if (body.description !== undefined) card.description = body.description;
    if (body.assigned_to !== undefined) card.assigned_to = body.assigned_to;
    if (body.column_id !== undefined) card.column_id = body.column_id;
    if (body.position !== undefined) card.position = body.position;
    return NextResponse.json({ card });
  }

  const supabase = getAdminSupabaseClient()!;
  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description;
  if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to;
  if (body.column_id !== undefined) update.column_id = body.column_id;
  if (body.position !== undefined) update.position = body.position;

  const { data, error } = await supabase
    .from('kanban_cards')
    .update(update)
    .eq('id', id)
    .eq('workspace_id', context.workspace.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured() || !context?.workspace) {
    const idx = DEMO_CARDS.findIndex((c) => c.id === id);
    if (idx !== -1) DEMO_CARDS.splice(idx, 1);
    return NextResponse.json({ ok: true });
  }

  const supabase = getAdminSupabaseClient()!;
  const { error } = await supabase
    .from('kanban_cards')
    .delete()
    .eq('id', id)
    .eq('workspace_id', context.workspace.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
