import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { refreshAccountProfile } from '@/lib/server/auto-fetch-avatar';
import { isSupabaseConfigured } from '@/lib/env';
import { demoState } from '@/lib/server/demo-store';
import { getAdminSupabaseClient } from '@/lib/supabase/server';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getWorkspaceContext();
  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Resolve the account's telegram_username
  let telegramUsername: string | null = null;

  if (!isSupabaseConfigured()) {
    const account = demoState.accounts.find((a) => a.id === id);
    telegramUsername = account?.telegram_username ?? null;
  } else {
    const supabase = getAdminSupabaseClient();
    const { data } = await supabase!
      .from('telegram_accounts')
      .select('telegram_username')
      .eq('id', id)
      .maybeSingle();
    telegramUsername = data?.telegram_username ?? null;
  }

  if (!telegramUsername) {
    return NextResponse.json({ error: 'Account not found or no Telegram username' }, { status: 404 });
  }

  const profile = await refreshAccountProfile(id, telegramUsername, context?.workspace?.id);

  if (profile.exists === false) {
    return NextResponse.json({
      ok: false,
      avatarUrl: null,
      exists: false,
      message: 'This Telegram username does not exist.',
    });
  }

  if (profile.exists === null) {
    return NextResponse.json({
      ok: false,
      avatarUrl: null,
      exists: null,
      message: 'Telegram could not be reached right now. Try again in a bit.',
    });
  }

  if (!profile.avatarUrl) {
    return NextResponse.json({
      ok: true,
      avatarUrl: null,
      exists: true,
      message: 'Username is valid, but no public profile picture is available.',
    });
  }

  return NextResponse.json({ ok: true, avatarUrl: profile.avatarUrl, exists: true });
}
