import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { fetchTelegramAvatar } from '@/lib/server/fetch-telegram-avatar';
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

  const avatarUrl = await fetchTelegramAvatar(telegramUsername);

  if (!avatarUrl) {
    return NextResponse.json({ ok: false, avatarUrl: null, message: 'No profile picture found for this username' });
  }

  // Persist to DB / demo store
  if (!isSupabaseConfigured()) {
    const account = demoState.accounts.find((a) => a.id === id);
    if (account) (account as any).profile_picture_url = avatarUrl;
  } else {
    const supabase = getAdminSupabaseClient();
    await supabase!
      .from('telegram_accounts')
      .update({ profile_picture_url: avatarUrl })
      .eq('id', id)
      .eq('workspace_id', context?.workspace?.id);
  }

  return NextResponse.json({ ok: true, avatarUrl });
}
