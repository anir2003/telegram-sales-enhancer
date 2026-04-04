import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

// In-memory demo store for calendar highlights
const DEMO_HIGHLIGHTS: any[] = [];

export async function GET(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured() || !context?.workspace) {
    return NextResponse.json({ highlights: DEMO_HIGHLIGHTS });
  }

  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('calendar_highlights')
    .select('*')
    .eq('workspace_id', context.workspace.id)
    .order('date', { ascending: true });

  if (error) {
    console.error('[GET /api/calendar-highlights]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ highlights: data ?? [] });
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { date, is_highlighted, comment } = body;

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    if (!isSupabaseConfigured() || !context?.workspace) {
      const existing = DEMO_HIGHLIGHTS.find(h => h.date === date);
      if (existing) {
        if (is_highlighted !== undefined) existing.is_highlighted = is_highlighted;
        if (comment !== undefined) existing.comment = comment;
        existing.updated_at = new Date().toISOString();
        return NextResponse.json({ highlight: existing });
      }
      const entry = {
        id: crypto.randomUUID(),
        workspace_id: 'demo',
        date,
        is_highlighted: is_highlighted ?? false,
        comment: comment ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      DEMO_HIGHLIGHTS.push(entry);
      return NextResponse.json({ highlight: entry });
    }

    const supabase = getAdminSupabaseClient()!;
    const { data, error } = await supabase
      .from('calendar_highlights')
      .upsert(
        {
          workspace_id: context.workspace.id,
          date,
          is_highlighted: is_highlighted ?? false,
          comment: comment ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,date' }
      )
      .select()
      .single();

    if (error) {
      console.error('[POST /api/calendar-highlights]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ highlight: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    if (!isSupabaseConfigured() || !context?.workspace) {
      const idx = DEMO_HIGHLIGHTS.findIndex(h => h.date === date);
      if (idx !== -1) DEMO_HIGHLIGHTS.splice(idx, 1);
      return NextResponse.json({ ok: true });
    }

    const supabase = getAdminSupabaseClient()!;
    const { error } = await supabase
      .from('calendar_highlights')
      .delete()
      .eq('workspace_id', context.workspace.id)
      .eq('date', date);

    if (error) {
      console.error('[DELETE /api/calendar-highlights]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
