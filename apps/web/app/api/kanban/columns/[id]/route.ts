import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

// shared with parent route module — import the demo arrays by re-exporting from route
// instead we duplicate a small reference here for demo path
const DEMO_COLUMNS: any[] = (globalThis as any).__kanban_demo_columns__ ?? [];
const DEMO_CARDS: any[] = (globalThis as any).__kanban_demo_cards__ ?? [];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  if (!isSupabaseConfigured() || !context?.workspace) {
    const col = DEMO_COLUMNS.find((c) => c.id === id);
    if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (body.name !== undefined) col.name = body.name;
    if (body.position !== undefined) col.position = body.position;
    return NextResponse.json({ column: col });
  }

  const supabase = getAdminSupabaseClient()!;
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.position !== undefined) update.position = body.position;

  const { data, error } = await supabase
    .from('kanban_columns')
    .update(update)
    .eq('id', id)
    .eq('workspace_id', context.workspace.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ column: data });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured() || !context?.workspace) {
    const idx = DEMO_COLUMNS.findIndex((c) => c.id === id);
    if (idx !== -1) DEMO_COLUMNS.splice(idx, 1);
    // remove orphan cards
    const toRemove = DEMO_CARDS.filter((c) => c.column_id === id).map((c) => c.id);
    toRemove.forEach((cid) => { const i = DEMO_CARDS.findIndex((c) => c.id === cid); if (i !== -1) DEMO_CARDS.splice(i, 1); });
    return NextResponse.json({ ok: true });
  }

  const supabase = getAdminSupabaseClient()!;
  // cards cascade-deleted via FK
  const { error } = await supabase
    .from('kanban_columns')
    .delete()
    .eq('id', id)
    .eq('workspace_id', context.workspace.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
