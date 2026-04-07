import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { fetchTelegramAvatar } from '@/lib/server/fetch-telegram-avatar';
import { updateLead } from '@/lib/server/repository';
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
  const wsCtx = context?.workspace
    ? { workspaceId: context.workspace.id, profileId: context.profile?.id ?? null }
    : undefined;

  // Resolve the lead's telegram_username
  let telegramUsername: string | null = null;

  if (!isSupabaseConfigured()) {
    const lead = demoState.leads.find((l) => l.id === id);
    telegramUsername = lead?.telegram_username ?? null;
  } else {
    const supabase = getAdminSupabaseClient();
    const { data } = await supabase!
      .from('leads')
      .select('telegram_username')
      .eq('id', id)
      .maybeSingle();
    telegramUsername = data?.telegram_username ?? null;
  }

  if (!telegramUsername) {
    return NextResponse.json({ error: 'Lead not found or no Telegram username' }, { status: 404 });
  }

  const avatarUrl = await fetchTelegramAvatar(telegramUsername);

  if (!avatarUrl) {
    return NextResponse.json({ ok: false, avatarUrl: null, message: 'No profile picture found for this username' });
  }

  await updateLead(id, { profile_picture_url: avatarUrl }, wsCtx);

  return NextResponse.json({ ok: true, avatarUrl });
}
