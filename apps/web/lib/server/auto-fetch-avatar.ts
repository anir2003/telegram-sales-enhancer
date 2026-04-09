/**
 * Fire-and-forget helpers that fetch a Telegram profile picture in the
 * background after a lead or account is created / linked.
 *
 * Each function returns void immediately — the async work runs in the
 * background without blocking the HTTP response.
 */
import { fetchTelegramAvatar, fetchTelegramPublicProfile, type TelegramPublicProfile } from '@/lib/server/fetch-telegram-avatar';
import { updateLead } from '@/lib/server/repository';
import { isSupabaseConfigured } from '@/lib/env';
import { demoState } from '@/lib/server/demo-store';
import { getAdminSupabaseClient } from '@/lib/supabase/server';

type WorkspaceContext = { workspaceId: string; profileId: string | null };

export async function refreshLeadProfile(
  leadId: string,
  telegramUsername: string,
  context?: WorkspaceContext,
): Promise<TelegramPublicProfile> {
  const profile = await fetchTelegramPublicProfile(telegramUsername);
  const patch: Record<string, unknown> = {
    telegram_checked_at: new Date().toISOString(),
  };

  if (profile.exists === true) {
    patch.profile_picture_url = profile.avatarUrl;
    patch.telegram_exists = true;
  } else if (profile.exists === false) {
    patch.profile_picture_url = null;
    patch.telegram_exists = false;
  }

  await updateLead(leadId, patch, context);
  return profile;
}

/**
 * Kicks off a background fetch of the Telegram profile picture for a lead.
 * Saves the result directly to the DB / demo store.
 */
export function autoFetchLeadAvatar(
  leadId: string,
  telegramUsername: string,
  context?: WorkspaceContext,
): void {
  if (!telegramUsername || !leadId) return;

  void (async () => {
    try {
      await refreshLeadProfile(leadId, telegramUsername, context);
    } catch {
      // silent — this is a best-effort background task
    }
  })();
}

/**
 * Kicks off a background fetch of the Telegram profile picture for an account.
 * Saves the result directly to the DB / demo store.
 */
export function autoFetchAccountAvatar(
  accountId: string,
  telegramUsername: string,
  workspaceId?: string,
): void {
  if (!telegramUsername || !accountId) return;

  void (async () => {
    try {
      const avatarUrl = await fetchTelegramAvatar(telegramUsername);
      if (!avatarUrl) return;

      if (!isSupabaseConfigured()) {
        const account = demoState.accounts.find((a) => a.id === accountId);
        if (account) (account as any).profile_picture_url = avatarUrl;
      } else {
        const supabase = getAdminSupabaseClient();
        const q = supabase!
          .from('telegram_accounts')
          .update({ profile_picture_url: avatarUrl })
          .eq('id', accountId);
        await (workspaceId ? q.eq('workspace_id', workspaceId) : q);
      }
    } catch {
      // silent — best-effort background task
    }
  })();
}
