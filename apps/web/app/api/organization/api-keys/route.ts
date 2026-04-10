import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getWorkspaceContext } from '@/lib/server/context';
import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

// AES-256-GCM encryption for stored secret values.
// Key is derived from APP_SECRET (or a fallback for demo mode).
const ENCRYPTION_KEY_HEX = process.env.APP_SECRET
  ? process.env.APP_SECRET.padEnd(64, '0').slice(0, 64)
  : '0'.repeat(64);

function encryptValue(plaintext: string): string {
  const key = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptValue(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(':');
  if (!ivHex || !tagHex || !encHex) return '••••••••';
  try {
    const key = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    return '••••••••';
  }
}

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ keys: [] });
  }
  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('workspace_api_keys')
    .select('id, label, key_prefix, encrypted_value, created_at')
    .eq('workspace_id', context.workspace.id)
    .order('label', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Return records with decrypted values so the settings page can display them
  const keys = (data ?? []).map((row: any) => ({
    id: row.id,
    label: row.label,
    key_prefix: row.key_prefix,
    value: row.encrypted_value ? decryptValue(row.encrypted_value) : null,
    created_at: row.created_at,
  }));
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const label = String(body.label ?? '').trim();
  const value = String(body.value ?? '').trim();
  if (!label) return NextResponse.json({ error: 'Label is required.' }, { status: 400 });
  if (!value) return NextResponse.json({ error: 'Value is required.' }, { status: 400 });

  // Store a visible prefix (first 6 chars) so the user can identify which key is which
  const prefix = value.length > 6 ? value.slice(0, 6) : value;
  const encrypted = encryptValue(value);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ record: { id: 'demo', label, key_prefix: prefix, value, created_at: new Date().toISOString() } });
  }
  const supabase = getAdminSupabaseClient()!;
  const { data, error } = await supabase
    .from('workspace_api_keys')
    .insert({
      workspace_id: context.workspace.id,
      label,
      key_prefix: prefix,
      key_hash: encrypted, // reusing key_hash column to store encrypted value
      encrypted_value: encrypted,
      created_by: context.profile.id,
    })
    .select('id, label, key_prefix, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: { ...data, value } });
}

export async function PATCH(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const id = String(body.id ?? '').trim();
  const value = String(body.value ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  if (!value) return NextResponse.json({ error: 'Value is required.' }, { status: 400 });

  const prefix = value.length > 6 ? value.slice(0, 6) : value;
  const encrypted = encryptValue(value);

  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });
  const supabase = getAdminSupabaseClient()!;
  const { error } = await supabase
    .from('workspace_api_keys')
    .update({ key_prefix: prefix, key_hash: encrypted, encrypted_value: encrypted })
    .eq('id', id)
    .eq('workspace_id', context.workspace.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });
  const supabase = getAdminSupabaseClient()!;
  const { error } = await supabase
    .from('workspace_api_keys')
    .delete()
    .eq('id', id)
    .eq('workspace_id', context.workspace.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
