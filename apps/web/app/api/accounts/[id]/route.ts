import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { demoState } from '@/lib/server/demo-store';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  
  // Build update payload
  const payload: Record<string, unknown> = {};
  if (body.label !== undefined) payload.label = String(body.label).trim();
  if (body.daily_limit !== undefined) payload.daily_limit = Number(body.daily_limit);
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  if (!isSupabaseConfigured()) {
    // Demo mode
    const account = demoState.accounts.find((a) => a.id === id);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    Object.assign(account, payload);
    return NextResponse.json({ account });
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('telegram_accounts')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', context?.workspace?.id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    demoState.accounts = demoState.accounts.filter(a => a.id !== id);
    demoState.assignments = demoState.assignments.filter(a => a.telegram_account_id !== id);
    return NextResponse.json({ success: true });
  }

  const supabase = getAdminSupabaseClient();
  const { error } = await supabase!
    .from('telegram_accounts')
    .delete()
    .eq('id', id)
    .eq('workspace_id', context?.workspace?.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
