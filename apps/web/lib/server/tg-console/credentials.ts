/**
 * Resolves TELEGRAM_API_ID and TELEGRAM_API_HASH for a workspace.
 *
 * Priority:
 *   1. Process env vars (TELEGRAM_API_ID / TELEGRAM_API_HASH) — set in Railway
 *   2. Workspace DB secrets (workspace_api_keys table) — set via Settings → Secrets
 *
 * TELEGRAM_CREDENTIAL_KEY always comes from Railway env only (needed before DB is readable).
 */

import { createDecipheriv } from 'node:crypto';
import { getTelegramAppCredentials } from '@/lib/env';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

type WorkspaceContext = { workspaceId: string; profileId: string | null };

export function decryptOrgSecret(stored: string): string | null {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) return null;
  const keyHex = appSecret.padEnd(64, '0').slice(0, 64);
  const [ivHex, tagHex, encHex] = stored.split(':');
  if (!ivHex || !tagHex || !encHex) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

export async function getWorkspaceSecret(workspaceId: string, label: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getAdminSupabaseClient()!;
  const { data } = await supabase
    .from('workspace_api_keys')
    .select('encrypted_value')
    .eq('workspace_id', workspaceId)
    .eq('label', label)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.encrypted_value) return null;
  return decryptOrgSecret(data.encrypted_value);
}

export async function resolveWorkspaceTgCredentials(ctx: WorkspaceContext): Promise<{
  apiId: string;
  apiHash: string;
} | null> {
  const fromEnv = getTelegramAppCredentials();

  // Use env vars if both are present
  if (fromEnv.apiId && fromEnv.apiHash) {
    return { apiId: fromEnv.apiId, apiHash: fromEnv.apiHash };
  }

  // Fall back to DB secrets
  const [apiId, apiHash] = await Promise.all([
    getWorkspaceSecret(ctx.workspaceId, 'TELEGRAM_API_ID'),
    getWorkspaceSecret(ctx.workspaceId, 'TELEGRAM_API_HASH'),
  ]);

  if (apiId && apiHash && Number.isInteger(Number(apiId))) {
    return { apiId, apiHash };
  }

  return null;
}

export async function resolveTelegramConnectorMode(ctx: WorkspaceContext): Promise<{
  mode: 'mock' | 'live';
  credentials: { apiId: string; apiHash: string } | null;
}> {
  if (process.env.TELEGRAM_ADAPTER_MODE === 'mock') {
    return { mode: 'mock', credentials: null };
  }

  const credentials = await resolveWorkspaceTgCredentials(ctx);
  if (credentials) {
    return { mode: 'live', credentials };
  }

  if (process.env.NODE_ENV !== 'production') {
    return { mode: 'mock', credentials: null };
  }

  return { mode: 'live', credentials: null };
}
