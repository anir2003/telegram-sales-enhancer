import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!isSupabaseConfigured() || !context?.workspace) {
      return NextResponse.json({ entry: { id, ...body } });
    }

    const supabase = getAdminSupabaseClient()!;
    const { data, error } = await supabase
      .from('business_tracker')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', context.workspace.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entry: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to update entry' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured() || !context?.workspace) {
    return NextResponse.json({ ok: true });
  }

  const supabase = getAdminSupabaseClient()!;
  const { error } = await supabase
    .from('business_tracker')
    .delete()
    .eq('id', id)
    .eq('workspace_id', context.workspace.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
