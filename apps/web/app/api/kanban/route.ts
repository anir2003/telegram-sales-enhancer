import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

// Demo state — module-level so it persists across requests in dev
const DEMO_COLUMNS: any[] = [
  { id: 'col-1', workspace_id: 'demo', name: 'To Do',      position: 0, created_at: new Date().toISOString() },
  { id: 'col-2', workspace_id: 'demo', name: 'In Progress', position: 1, created_at: new Date().toISOString() },
  { id: 'col-3', workspace_id: 'demo', name: 'Review',      position: 2, created_at: new Date().toISOString() },
  { id: 'col-4', workspace_id: 'demo', name: 'Done',        position: 3, created_at: new Date().toISOString() },
];
const DEMO_CARDS: any[] = [];

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured() || !context?.workspace) {
    return NextResponse.json({ columns: DEMO_COLUMNS, cards: DEMO_CARDS });
  }

  const supabase = getAdminSupabaseClient()!;
  const wid = context.workspace.id;

  // Auto-create default columns on first load
  const { data: existingCols } = await supabase
    .from('kanban_columns')
    .select('id')
    .eq('workspace_id', wid)
    .limit(1);

  if (!existingCols?.length) {
    const defaults = [
      { workspace_id: wid, name: 'To Do',       position: 0 },
      { workspace_id: wid, name: 'In Progress',  position: 1 },
      { workspace_id: wid, name: 'Review',       position: 2 },
      { workspace_id: wid, name: 'Done',         position: 3 },
    ];
    await supabase.from('kanban_columns').insert(defaults);
  }

  const [{ data: columns }, { data: cards }] = await Promise.all([
    supabase.from('kanban_columns').select('*').eq('workspace_id', wid).order('position'),
    supabase.from('kanban_cards').select('*').eq('workspace_id', wid).order('position'),
  ]);

  return NextResponse.json({ columns: columns ?? [], cards: cards ?? [] });
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  if (!isSupabaseConfigured() || !context?.workspace) {
    const col = {
      id: `col-${crypto.randomUUID()}`,
      workspace_id: 'demo',
      name: name.trim(),
      position: DEMO_COLUMNS.length,
      created_at: new Date().toISOString(),
    };
    DEMO_COLUMNS.push(col);
    return NextResponse.json({ column: col });
  }

  const supabase = getAdminSupabaseClient()!;
  const { count } = await supabase
    .from('kanban_columns')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', context.workspace.id);

  const { data, error } = await supabase
    .from('kanban_columns')
    .insert({ workspace_id: context.workspace.id, name: name.trim(), position: count ?? 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ column: data });
}
