import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

const DEMO_CARDS: any[] = (globalThis as any).__kanban_demo_cards__ ?? [];

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { column_id, title, description, assigned_to } = body;
  if (!column_id || !title?.trim()) {
    return NextResponse.json({ error: 'column_id and title required' }, { status: 400 });
  }

  if (!isSupabaseConfigured() || !context?.workspace) {
    const posInCol = DEMO_CARDS.filter((c) => c.column_id === column_id).length;
    const card = {
      id: `card-${crypto.randomUUID()}`,
      workspace_id: 'demo',
      column_id,
      title: title.trim(),
      description: description ?? null,
      assigned_to: assigned_to ?? null,
      position: posInCol,
      created_at: new Date().toISOString(),
    };
    DEMO_CARDS.push(card);
    return NextResponse.json({ card });
  }

  const supabase = getAdminSupabaseClient()!;
  const { count } = await supabase
    .from('kanban_cards')
    .select('id', { count: 'exact', head: true })
    .eq('column_id', column_id);

  const { data, error } = await supabase
    .from('kanban_cards')
    .insert({
      workspace_id: context.workspace.id,
      column_id,
      title: title.trim(),
      description: description ?? null,
      assigned_to: assigned_to ?? null,
      position: count ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
