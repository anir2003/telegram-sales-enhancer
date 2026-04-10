import { createDecipheriv } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type WorkspaceCredentialPair = {
  apiId: string;
  apiHash: string;
};

const cache = new Map<string, WorkspaceCredentialPair>();

function decryptOrgSecret(stored: string): string | null {
  const appSecret = process.env.APP_SECRET?.trim();
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

async function getDbSecret(supabase: SupabaseClient, workspaceId: string, label: string) {
  const { data, error } = await supabase
    .from('workspace_api_keys')
    .select('encrypted_value')
    .eq('workspace_id', workspaceId)
    .eq('label', label)
    .maybeSingle();
  if (error) throw error;
  if (!data?.encrypted_value) return null;
  return decryptOrgSecret(data.encrypted_value);
}

export async function resolveWorkspaceTgCredentials(supabase: SupabaseClient, workspaceId: string) {
  const envApiId = process.env.TELEGRAM_API_ID?.trim() ?? '';
  const envApiHash = process.env.TELEGRAM_API_HASH?.trim() ?? '';
  if (envApiId && envApiHash) {
    return { apiId: envApiId, apiHash: envApiHash };
  }

  const cached = cache.get(workspaceId);
  if (cached) return cached;

  const [apiId, apiHash] = await Promise.all([
    getDbSecret(supabase, workspaceId, 'TELEGRAM_API_ID'),
    getDbSecret(supabase, workspaceId, 'TELEGRAM_API_HASH'),
  ]);

  if (!apiId || !apiHash || !Number.isInteger(Number(apiId))) {
    throw new Error(`Telegram app credentials are not configured for workspace ${workspaceId}.`);
  }

  const resolved = { apiId, apiHash };
  cache.set(workspaceId, resolved);
  return resolved;
}
