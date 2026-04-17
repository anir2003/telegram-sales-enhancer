import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, randomBytes } from 'node:crypto';
import { getWorkspaceContext } from '@/lib/server/context';
import { getWorkspaceSecret } from '@/lib/server/tg-console/credentials';
import { isSupabaseConfigured } from '@/lib/env';
import { getAdminSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const label = 'OPENAI_API_KEY';

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

async function upsertOpenAiKey(workspaceId: string, profileId: string | null, value: string) {
  const encrypted = encryptValue(value);
  const prefix = value.length > 10 ? value.slice(0, 10) : value;
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

  if (process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ source: 'env', configured: true, canEdit: false });
  }

  if (isSupabaseConfigured() && !isAppSecretConfigured()) {
    return NextResponse.json({ error: 'APP_SECRET is required before storing OpenAI API keys.' }, { status: 503 });
  }

  const stored = await getWorkspaceSecret(context.workspace.id, label);
  return NextResponse.json({
    source: stored ? 'organization' : 'missing',
    configured: Boolean(stored),
    canEdit: true,
  });
}

export async function POST(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const value = String((await req.json()).api_key ?? '').trim();
  if (!value.startsWith('sk-')) {
    return NextResponse.json({ error: 'Enter a valid OpenAI API key.' }, { status: 400 });
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: 'OpenAI API key is set by server env vars.' }, { status: 409 });
  }
  if (isSupabaseConfigured() && !isAppSecretConfigured()) {
    return NextResponse.json({ error: 'APP_SECRET is required before storing OpenAI API keys.' }, { status: 503 });
  }

  if (isSupabaseConfigured()) {
    await upsertOpenAiKey(context.workspace.id, context.profile.id, value);
  }

  return NextResponse.json({ ok: true });
}
