import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getTelegramAppCredentials } from '@/lib/env';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

const secretLabels = ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH'] as const;

function isAppSecretConfigured() {
  return Boolean(process.env.APP_SECRET?.trim());
}

function keyHex() {
  return process.env.APP_SECRET
    ? process.env.APP_SECRET.padEnd(64, '0').slice(0, 64)
    : '0'.repeat(64);
}

function encryptValue(plaintext: string) {
  const key = Buffer.from(keyHex(), 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptValue(stored: string) {
  const [ivHex, tagHex, encHex] = stored.split(':');
  if (!ivHex || !tagHex || !encHex) return null;
  try {
    const key = Buffer.from(keyHex(), 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

async function getStoredSecret(workspaceId: string, label: string) {
  if (!isSupabaseConfigured()) return null;
  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('workspace_api_keys')
    .select('encrypted_value')
    .eq('workspace_id', workspaceId)
    .eq('label', label)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.encrypted_value ? decryptValue(data.encrypted_value) : null;
}

async function upsertStoredSecret(workspaceId: string, profileId: string | null, label: string, value: string) {
  const encrypted = encryptValue(value);
  const prefix = value.length > 6 ? value.slice(0, 6) : value;
  const supabase = getAdminSupabaseClient()!;
  const { data: existing, error: existingError } = await supabase
    .from('workspace_api_keys')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('label', label)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await supabase
      .from('workspace_api_keys')
      .update({ key_prefix: prefix, key_hash: encrypted, encrypted_value: encrypted })
      .eq('workspace_id', workspaceId)
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('workspace_api_keys')
    .insert({
      workspace_id: workspaceId,
      label,
      key_prefix: prefix,
      key_hash: encrypted,
      encrypted_value: encrypted,
      created_by: profileId,
    });
  if (error) throw error;
}

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = getTelegramAppCredentials();
  if (env.apiId && env.apiHash) {
    return NextResponse.json({
      source: 'env',
      apiId: env.apiId,
      apiHashConfigured: true,
      canEdit: false,
    });
  }

  if (isSupabaseConfigured() && !isAppSecretConfigured()) {
    return NextResponse.json({ error: 'APP_SECRET is required before storing Telegram API keys.' }, { status: 503 });
  }

  const [apiId, apiHash] = await Promise.all([
    getStoredSecret(context.workspace.id, 'TELEGRAM_API_ID'),
    getStoredSecret(context.workspace.id, 'TELEGRAM_API_HASH'),
  ]);

  return NextResponse.json({
    source: apiId && apiHash ? 'organization' : 'missing',
    apiId,
    apiHashConfigured: Boolean(apiHash),
    canEdit: true,
  });
}

export async function POST(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const apiId = String(body.api_id ?? '').trim();
  const apiHash = String(body.api_hash ?? '').trim();
  if (!apiId || !Number.isInteger(Number(apiId))) {
    return NextResponse.json({ error: 'Enter a valid Telegram API ID.' }, { status: 400 });
  }
  if (!apiHash) {
    return NextResponse.json({ error: 'Telegram API hash is required.' }, { status: 400 });
  }
  if (getTelegramAppCredentials().apiId && getTelegramAppCredentials().apiHash) {
    return NextResponse.json({ error: 'Telegram API keys are set by server env vars.' }, { status: 409 });
  }
  if (isSupabaseConfigured() && !isAppSecretConfigured()) {
    return NextResponse.json({ error: 'APP_SECRET is required before storing Telegram API keys.' }, { status: 503 });
  }

  if (isSupabaseConfigured()) {
    await Promise.all([
      upsertStoredSecret(context.workspace.id, context.profile.id, secretLabels[0], apiId),
      upsertStoredSecret(context.workspace.id, context.profile.id, secretLabels[1], apiHash),
    ]);
  }

  return NextResponse.json({ ok: true });
}
