import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

const DEMO_ENTRIES: any[] = [];

export async function GET() {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured() || !context?.workspace) {
    return NextResponse.json({ entries: DEMO_ENTRIES });
  }

  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('business_tracker')
    .select('*, campaigns(name), leads(first_name, last_name, telegram_username), telegram_accounts(label, telegram_username)')
    .eq('workspace_id', context.workspace.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/business-tracker]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!isSupabaseConfigured() || !context?.workspace) {
      const entry = { id: crypto.randomUUID(), ...body, workspace_id: 'demo', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      DEMO_ENTRIES.unshift(entry);
      return NextResponse.json({ entry });
    }

    const supabase = getAdminSupabaseClient()!;
    const { data, error } = await supabase
      .from('business_tracker')
      .insert({ ...body, workspace_id: context.workspace.id })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/business-tracker]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entry: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to create entry' }, { status: 500 });
  }
}
